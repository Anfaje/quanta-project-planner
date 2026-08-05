# Deploying Quanta to Fly.io

This walks you through getting Quanta running on Fly.io for end-to-end testing. Provisioning is done from the **Fly CLI (`flyctl`)** — Fly moved both Postgres and Redis creation to the CLI, so there's no longer a pure point-and-click path. The ongoing **deploys** are still fully automated by the **GitHub Actions workflows** (Drop 5b): you wire things up once, then every push to `main` that touches `packages/api/**` or `packages/web/**` deploys that app automatically.

**Time:** 15–25 minutes the first time.
**Cost:** Fly no longer has a blanket free tier. This guide uses **Managed Postgres (MPG)**, whose smallest plan (Basic: shared-2x / 1 GB) is about $38/month plus ~$0.28/GB-month of storage; add two small always-on app machines and a free-allowance Redis and you're at roughly $40/month. If that's too much for a test box, swap MPG for Fly's cheaper **unmanaged** Postgres (`fly postgres`, a few dollars a month) — only steps 1b–1c and teardown change. Letting the app machines scale to zero (note in step 1a) trims the rest. A card must be on file; check live pricing at https://fly.io/docs/about/pricing/ and https://fly.io/docs/mpg/.
**Prerequisites:** A Fly account with a card linked, push access to this GitHub repo, and `flyctl` installed (step 0).

---

## Architecture in one diagram

```
        User's browser
              │
              ▼  HTTPS (Fly auto-TLS)
   ┌─────────────────────┐
   │ quanta-web          │   nginx on port 8080
   │ nginx + static SPA  │   Fly: ord region, shared-1x, 256mb
   └──────────┬──────────┘
              │  /api/* reverse-proxied
              │  over Fly's internal IPv6 network
              ▼
   ┌─────────────────────┐
   │ quanta-api          │   Express + Prisma on port 4000
   │ session middleware  │   Fly: ord region, shared-1x, 512mb
   └─────┬─────────┬─────┘
         │         │
         ▼         ▼
   ┌─────────┐ ┌─────────┐
   │ quanta- │ │ quanta- │
   │   db    │ │  redis  │
   │(Fly MPG)│ │(Upstash)│
   └─────────┘ └─────────┘
```

Everything lives in one Fly organisation, same region (default: `ord` — Chicago). Cookies are first-party (the SPA and API share an origin via the nginx proxy), there's no CORS, and the only public port is `quanta-web.fly.dev`.

A note on the two databases:
- **Postgres** is **Fly Managed Postgres (MPG)** — fully managed, with HA, automated backups, failover, and built-in **PgBouncer** connection pooling. The `DATABASE_URL` that `fly mpg attach` sets points at the pooler (Session mode by default), which is why Prisma needs no special `?pgbouncer=true` flag here. MPG's smallest plan is ~$38/month; if you'd rather run a test box for a few dollars, Fly's **unmanaged** Postgres (`fly postgres`, dashboard-labelled "Legacy") is a drop-in swap for steps 1b–1c.
- **Redis** is **Upstash for Redis**, provisioned through Fly. We use it only for session storage.

---

## 0. Install flyctl and log in

If you already did this while provisioning Redis, skip ahead.

```bash
# macOS
brew install flyctl
# or any platform:
curl -L https://fly.io/install.sh | sh

fly auth login   # opens a browser to authenticate
```

`fly` and `flyctl` are the same binary. Confirm you're logged in and note your org slug (you'll need it in step 4):

```bash
fly orgs list    # the personal org is usually called "personal"
```

---

## 1. Provision the four resources

### 1a. Create the two apps

```bash
fly apps create quanta-api
fly apps create quanta-web
```

This just reserves the names/app records — no machines deploy yet (the first image lands later, via GitHub Actions). Both apps must be in the **same organisation** (they talk over Fly's private network), and the `fly.toml` files already pin both to `primary_region = "ord"`.

> **Cost tip:** the committed `fly.toml` keeps machines warm (`auto_stop_machines = false`, `min_machines_running = 1`) so the test box is always responsive. To minimise spend, set `auto_stop_machines = true` and `min_machines_running = 0` in both `fly.toml` files — the apps then scale to zero when idle and cold-start on the next request.

### 1b. Provision Managed Postgres

```bash
fly mpg create --name quanta-db --region ord
```

It prompts for plan and volume; pick the **Basic** plan, region `ord`, and a small volume (the default is 10 GB; `--volume-size 3` is plenty for testing). Provisioning takes a minute or two. MPG clusters include PgBouncer and default to **Session** pool mode.

> Prefer a cheaper test box? Substitute Fly's unmanaged Postgres:
> `fly postgres create --name quanta-db --region ord --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 3`
> Everything downstream is identical except teardown (`fly apps destroy quanta-db` instead of `fly mpg destroy`).

### 1c. Attach Postgres to the API

```bash
fly mpg attach quanta-db --app quanta-api
```

This writes the pooled connection string as a `DATABASE_URL` secret on `quanta-api` (it also triggers a deploy if the app already has machines). The URL targets MPG's PgBouncer pooler — Prisma talks to it unchanged. Verify:

```bash
fly secrets list --app quanta-api    # should list DATABASE_URL
```

> Used unmanaged Postgres in 1b? Attach with `fly postgres attach quanta-db --app quanta-api` instead.

### 1d. Provision Upstash Redis

Redis is **CLI-only** now — the Fly dashboard has no "Create database" button for it (it just tells you to run this command):

```bash
fly redis create
```

It's interactive. Answer:
- **Organisation** — the same org as your apps.
- **Name** — `quanta-redis`. (Name and primary region **can't be changed later**.)
- **Primary region** — `ord`, same as the apps, so session lookups are sub-millisecond.
- **Eviction** — **No.** Sessions carry their own TTL; you don't want them evicted out from under logged-in users. (Changeable later.)
- **Plan** — the smallest / pay-as-you-go (free allowance is plenty; we use ~1 MB).

The connection URL is printed once at the end and looks like `redis://default:LONGSTRING@…upstash.io:6379`. **Copy it.** If you miss it:

```bash
fly redis status quanta-redis        # re-prints the connection URL
```

Treat it like a password — it effectively is one. You'll set it as a secret in step 3.

---

## 2. Generate two random secrets

Quanta encrypts user TOTP secrets at rest and signs session cookies with HMAC. Each needs its own 32-byte random key (64 hex chars). **Don't reuse the same value for both** — separate keys mean one leak doesn't compromise the other.

```bash
openssl rand -hex 32
# Run twice — once for SESSION_SECRET, once for TOTP_ENCRYPTION_KEY
```

No openssl? Any of these also produce 64 hex chars: a browser console —
`Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('')` —
or a password manager's generator set to length 64, hex charset. Stash both values in a password manager; you'll paste them in step 3.

(If you set the secrets straight from the shell in step 3, you can skip saving them — the inline `$(openssl rand -hex 32)` form generates them on the spot.)

---

## 3. Set the API app's secrets

In one command (the inline `openssl` calls fill in the two random keys):

```bash
fly secrets set --app quanta-api \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  TOTP_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  REDIS_URL="redis://default:...@...upstash.io:6379" \
  WEB_URL="https://quanta-web.fly.dev"
```

Replace `REDIS_URL` with the full string from step 1d. `DATABASE_URL` is already set from the attach in step 1c. Confirm all five:

```bash
fly secrets list --app quanta-api
# DATABASE_URL, REDIS_URL, SESSION_SECRET, TOTP_ENCRYPTION_KEY, WEB_URL
```

> **Don't set anything on `quanta-web`.** The web app reads its one environment value (`API_INTERNAL_URL`) straight from its `fly.toml`; no secrets needed.

Setting secrets on an app with no machines yet is fine — Fly stores them and injects them on the first deploy.

---

## 4. Create a Fly deploy token + add it to GitHub

### 4a. Mint an **org-scoped** token

Both apps deploy using the same `FLY_API_TOKEN`, so the token must cover the whole organisation. A plain deploy token is scoped to a **single app** and would only authorise one of the two — use an org token instead:

```bash
fly tokens create org <your-org-slug>     # e.g. personal — from `fly orgs list`
```

(If `create org` isn't recognised on an older flyctl, `fly tokens org <org>` is the equivalent; `fly tokens create --help` lists the forms.)

Copy the **entire** output, including the `FlyV1 ` prefix and the space. This is the only time it's shown.

> Prefer the dashboard? **Account menu → Tokens** can also mint an org token. The CLI is more reliable since the dashboard's token UI labels shift between versions.

### 4b. Add it as a GitHub secret

Open https://github.com/Anfaje/quanta-project-planner/settings/secrets/actions

- **New repository secret**
- Name: `FLY_API_TOKEN` (exact — case-sensitive, no quotes)
- Value: paste the `FlyV1 …` token
- **Add secret**

To rotate later: mint a new token, update this secret, and revoke the old one (`fly tokens list` / `fly tokens revoke`).

---

## 5. Trigger the first deploy

The workflows only run when files under `packages/api/**` or `packages/web/**` change. Two ways to kick off the first deploy:

**Option A — `workflow_dispatch` (no commit):** if the workflows expose a manual trigger, go to https://github.com/Anfaje/quanta-project-planner/actions, pick each workflow, and click **Run workflow**.

**Option B — a trivial commit to each package:**
1. Edit https://github.com/Anfaje/quanta-project-planner/edit/main/packages/api/Dockerfile and add a trailing newline (or tweak a comment).
2. Commit to `main` with a message like `chore: trigger first deploy`.
3. Repeat for `packages/web/Dockerfile`.

**Watch them:** https://github.com/Anfaje/quanta-project-planner/actions — you'll see one run per package. Each runs CI (typecheck + tests, plus Postgres-backed integration for the API) and then the deploy job.

| Workflow | CI | Deploy | Total |
|----------|----|--------|-------|
| API | ~3 min (unit + integration) | ~90 sec | ~4–5 min |
| Web | ~1 min (typecheck + vitest + vite build) | ~60 sec | ~2 min |

On the API deploy, Fly runs the release command (`scripts/release.sh`, i.e. `npx prisma migrate deploy` plus a one-time self-baseline for databases that predate the migrations folder) against the attached Postgres to apply pending migrations **before** the new image goes live. If that fails, the deploy aborts and the previous version keeps serving.

**Verify the API:**
```
https://quanta-api.fly.dev/api/health
```
Expect JSON like `{"status":"ok","db":"connected","redis":"connected",...}`. If `db` or `redis` is `disconnected`, see Troubleshooting.

---

## 6. Seed the bootstrap admin user

You can't log in yet — the database has no users. The seed script (Drop 1) creates a bootstrap AA plus sample BUs, accounts, domains, and a small fixture team. Run it on the API machine:

```bash
fly ssh console --app quanta-api --command "npx tsx prisma/seed.ts"
```

(Or `fly console --app quanta-api` for an interactive shell, then run `npx tsx prisma/seed.ts`.)

**What gets seeded:**

| | Value |
|---|---|
| Whitelisted email domains | `trifork.com`, `trifork-na.com`, `spantree.com` |
| Bootstrap AA login | `sarah@trifork.com` |
| **Bootstrap password (all users)** | `quanta123` |
| Business Units | US-ORD-OWLS, DK-AAR-PANDA, US-CA-SE, EU-BER-FOXES |
| Accounts | A few fixture accounts |
| Sample users | ~13 across the various roles |

> ⚠️ **`quanta123` is a hard-coded dev password.** Log in immediately and change it via the admin console. The seed lives in source — before any real use, rotate it to skip user creation in prod or generate random per-user passwords ([TODO.md](TODO.md) flags this).

---

## 7. Log in

1. Open `https://quanta-web.fly.dev`.
2. Sign in as `sarah@trifork.com` / `quanta123`.
3. You'll be walked through first-time TOTP enrolment (scan the QR with an authenticator app), then the one-time welcome screen.
4. You should land on the dashboard.

If login works end-to-end, the deploy is good.

---

## What happens on every subsequent code change

Push to `main`:
- Touches `packages/api/**` → the **API** workflow runs CI, then deploys `quanta-api` (re-running the migration release command).
- Touches `packages/web/**` → the **Web** workflow runs CI, then deploys `quanta-web`.
- Touches neither → nothing deploys.

No manual step. Rollbacks and logs are in the Fly dashboard (or `fly releases` / `fly logs`).

---

## Why it works: the non-obvious bits

Four things in this repo are load-bearing for a Fly deploy and each cost real debugging time to get right. If you fork or re-platform this, keep them in mind.

### The API binds to `::`, not `0.0.0.0`
Fly's private network (6PN — what `*.internal` names like `quanta-api.internal` resolve to) is **IPv6-only**. An app bound to `0.0.0.0` (IPv4) is reachable through Fly's *public* proxy and passes health checks, but **other apps can't reach it over `.internal`** — so the web container's nginx `/api` proxy gets connection-refused and every `/api/*` call 502s while the static SPA still loads. `packages/api/src/index.ts` listens on `::`; on Linux that also accepts IPv4-mapped connections, so the public proxy keeps working. Telltale sign if this regresses: `quanta-api.fly.dev/api/health` is healthy but the web app's API calls 502.

### The Dockerfile copies `prisma/` *before* `npm install`
`package.json`'s `postinstall` runs `prisma generate`, which needs `prisma/schema.prisma` on disk. The API Dockerfile copies the schema before `npm install` (so there's deliberately no separate `prisma generate` step — the postinstall does it). Reorder these and the image build fails at install time.

### nginx resolves the API at request time and returns JSON when it's down
With a literal hostname in `proxy_pass`, nginx resolves `quanta-api.internal` once at startup and **fails to boot** ("host not found in upstream") if the API is mid-deploy — taking the whole web app down. `nginx.conf.template` instead uses Fly's internal resolver (`[fdaa::3]`) plus a variable upstream, so nginx starts regardless and re-resolves per request (also picking up the API's new address on each redeploy). It also answers an unreachable `/api/*` with a small JSON 502 rather than the SPA's `index.html`, so a backend outage doesn't masquerade as a blank page (and is obvious in DevTools).

### The health check tolerates a recycled Postgres connection
MPG sits behind Fly's proxy + PgBouncer, which **terminate idle connections** — Fly's proxy drains and closes anything still open past ~10 minutes. A pooled Prisma connection can therefore be dead when a query lands on it; Prisma reconnects on the next query, but the one that hit the stale connection errors once. `/api/health` retries `SELECT 1` once so a single recycled connection doesn't flap the check (and 502 the machine). You'll see occasional `prisma:error … E57P01 "terminating connection due to administrator command"` in the logs after idle periods — expected, and self-healing. To make it rarer under steady load, keep the Prisma pool small (e.g. `?connection_limit=5` on `DATABASE_URL`); reconnection covers the rest.

---

## Troubleshooting

### CI passes but deploy fails with "no authentication credentials" / 401
`FLY_API_TOKEN` isn't set on the repo, or it expired. Re-do step 4.

### The API deploys fine but the **web** deploy fails auth (or vice-versa)
Classic symptom of an **app-scoped** token. A deploy token only covers one app; both apps share `FLY_API_TOKEN`, so it must be **org-scoped**. Re-mint with `fly tokens create org <org>` (step 4a) and update the GitHub secret.

### Deploy succeeds but `/api/health` shows `db: "disconnected"`
The release migration (`scripts/release.sh` → `prisma migrate deploy`) likely failed. Check logs:
```bash
fly logs --app quanta-api
```
Common causes: `DATABASE_URL` missing (re-run `fly mpg attach quanta-db --app quanta-api`), or the cluster is unreachable (check its status in the MPG dashboard, or `fly mpg list`). On unmanaged Postgres, re-attach with `fly postgres attach …` and check `fly status --app quanta-db`.

### Health check shows `redis: "disconnected"`
- Verify `REDIS_URL` is the full, untruncated string (`fly secrets list --app quanta-api` shows it's set; re-set if unsure).
- Confirm the Redis primary region matches `quanta-api`'s (`fly redis status quanta-redis`).
- Restart the API: `fly apps restart quanta-api`.

### Web app loads but `/api/*` returns 502 (sometimes as an HTML page, not JSON)
nginx is up but can't reach the API over `.internal`. Check, in order:
1. **API binding** — the usual culprit. If the API is bound to `0.0.0.0` (IPv4) instead of `::`, 6PN (IPv6-only) is unreachable, so the public health check passes but `.internal` is refused. `packages/api/src/index.ts` must call `app.listen(port, "::", …)`. If `quanta-api.fly.dev/api/health` is healthy while the web app 502s, this is almost certainly it.
2. **Same org** — both apps must be in the same Fly organisation to share the private network.
3. **API is running** — `fly status --app quanta-api`, expect a machine in state `started`.

A bare JSON body `{"error":"API temporarily unavailable"}` (rather than the SPA shell) confirms nginx is doing its job and the API itself is the unreachable piece.

### Logs show `prisma:error … E57P01 "terminating connection due to administrator command"`
Expected on MPG after idle periods — Fly's proxy/PgBouncer recycles idle connections (closing anything open past ~10 minutes). Prisma reconnects automatically and `/api/health` retries once, so it self-heals; no action needed. To make it rarer under load, lower the Prisma pool with `?connection_limit=5` on `DATABASE_URL`.

### Cookies don't persist between requests
Make sure you're hitting `https://quanta-web.fly.dev` (not the API host directly) and that `WEB_URL` on the API matches it. The session cookie is `Secure`+first-party; mismatched origins break it.

### "Too many attempts. Please try again later." on login
The auth rate limiter tripped. Wait a minute, or restart the API machine to clear the in-memory window.

### Roll back to the previous version
```bash
fly releases --app quanta-api          # list versions
fly releases rollback --app quanta-api # or pick a version in the dashboard → Releases
```

### A workflow is stuck or you need to re-run after fixing a secret
Re-run it from the **Actions** tab (the failed run has a **Re-run jobs** button), or push another trivial commit.

---

## Tear it down

To stop spending or start over:

```bash
fly apps destroy quanta-web
fly apps destroy quanta-api
fly mpg destroy quanta-db         # Managed Postgres lives outside your apps
fly redis destroy quanta-redis
```

Then remove the GitHub secret (https://github.com/Anfaje/quanta-project-planner/settings/secrets/actions) and revoke the Fly token (`fly tokens list` → `fly tokens revoke <id>`).

> After teardown, run `fly volumes list` and `fly apps list` to make sure nothing lingers — orphaned volumes still bill. **MPG lives outside your apps**, so `fly apps destroy` does *not* remove it; the `fly mpg destroy` above is what deletes it. (If you used unmanaged Postgres, `fly apps destroy quanta-db` removes it instead.)

---

## Hardening (deferred — see [`TODO.md`](TODO.md))

This is the minimum viable deploy. Production work parked for later:

- **Tune the Postgres connection for production load** — set `?connection_limit` on `DATABASE_URL` to match the machine size, and if you scale out connections consider switching the MPG pooler to Transaction mode (add `?pgbouncer=true` so Prisma stops using named prepared statements). MPG itself — HA, backups, failover — is already in place.
- **Reset-token email + hashing** — wire SMTP so password-reset links are emailed (not returned in the response), and hash reset tokens at rest (see [`SECURITY.md`](SECURITY.md)).
- **Terraform** — declarative provisioning so all of the above is reproducible from code.
- **Custom domain + cert**, **staging environment**, **observability** (Sentry, log aggregation), and a **backup/restore** runbook.

---

## Appendix: the whole thing as one script

For a from-scratch run (replace `<org>` and the `REDIS_URL`):

```bash
# 0. Tooling
curl -L https://fly.io/install.sh | sh && fly auth login

# 1. Provision
fly apps create quanta-api
fly apps create quanta-web
fly mpg create --name quanta-db --region ord     # Managed Postgres; pick the Basic plan
fly mpg attach quanta-db --app quanta-api         # sets DATABASE_URL (pooled, PgBouncer)
fly redis create        # interactive: org, name quanta-redis, region ord, eviction No

# 3. Secrets (paste REDIS_URL from `fly redis status quanta-redis`)
fly secrets set --app quanta-api \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  TOTP_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  REDIS_URL="redis://default:...@...upstash.io:6379" \
  WEB_URL="https://quanta-web.fly.dev"

# 4. Org-scoped deploy token → paste into GitHub as FLY_API_TOKEN
fly tokens create org <org>

# 5. First deploy is triggered from GitHub (push or workflow_dispatch).
#    Manual fallback, per app:
#      cd packages/api && fly deploy --remote-only
#      cd packages/web && fly deploy --remote-only

# 6. Seed
fly ssh console --app quanta-api --command "npx tsx prisma/seed.ts"
```
