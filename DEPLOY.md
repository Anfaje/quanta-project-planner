# Deploying Quanta to Fly.io

This walks you through getting Quanta running on Fly.io for end-to-end testing. You'll do most of it in the **Fly dashboard UI** — no CLI install needed. The actual deploys are handled by the **GitHub Actions workflows** from Drop 5b. You touch a few buttons once, then every push to `main` deploys automatically.

**Time:** 15–25 minutes the first time.
**Cost:** $0 on Fly's free tier. You'll need a credit card on file (fraud check); you won't be charged unless you scale up.
**Prerequisites:** A Fly account, a credit card linked, push access to this GitHub repo.

> **Don't have flyctl installed and don't want to install it?** Good news — you don't need to. Everything in this guide is point-and-click or copy-paste. The only optional CLI moment is generating two random hex strings in step 2, and the doc covers non-CLI alternatives.

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
   │ (Fly PG)│ │(Upstash)│
   └─────────┘ └─────────┘
```

Everything lives in one Fly organisation, same region (default: `ord` — Chicago). Cookies are first-party (the SPA and API share an origin via nginx proxy), there's no CORS, and the only public port is `quanta-web.fly.dev`.

---

## 1. Provision the four resources in the Fly dashboard

Open [fly.io/dashboard](https://fly.io/dashboard).

### 1a. Create the two apps

The "Apps" view lists your apps. Click **Launch an app** (or **Create a new app** — labelling varies).

Create **`quanta-api`** first:
- Name: `quanta-api`
- Region: `ord` (or pick the closest — but **everything must be in the same region** for free internal networking)
- When the wizard asks "deploy now" / "launch from Docker", **skip / cancel** — we have no image to deploy yet; the GitHub Actions will push the first image once everything's wired up.

Then create **`quanta-web`** the same way. Same region.

After this step, both apps appear in your Apps list with status "No machines yet" or similar. That's fine.

### 1b. Provision Postgres

Sidebar → **Databases** (or **Postgres**) → **Create database**.

- Name: `quanta-db`
- Region: same as the apps
- Plan: smallest available (the free tier is something like **Development — shared CPU, 256MB, 1GB storage**; for testing this is plenty)
- Volume size: 3 GB

Click Create and wait ~30 seconds for the cluster to provision. You'll get a status screen showing the new cluster.

### 1c. Attach Postgres to the API

In the new `quanta-db` cluster's overview, find **Attach an app** (might be under "Connect" or "Apps" tab depending on UI version). Pick `quanta-api` from the dropdown.

This single action does three things on your behalf:
1. Creates a fresh database inside the cluster scoped to this app
2. Creates a database role with limited permissions
3. Writes the resulting connection URL as a secret called `DATABASE_URL` on `quanta-api`

**Verify it worked:** go to `quanta-api` → **Secrets** tab. You should see `DATABASE_URL` listed (the value is masked).

### 1d. Provision Upstash Redis

Sidebar → **Databases** (or **Add-ons**) → **Upstash for Redis** → **Create database**.

- Name: `quanta-redis`
- Region: same as the apps (so internal latency is sub-ms)
- Plan: Free tier (256MB ceiling; we use ~1MB for sessions)

After creation, the cluster overview will show a **connection string** that looks like:

```
redis://default:LONGRANDOMSTRING@something.upstash.io:port
```

**Copy this entire string** — you'll need it in step 2. Treat it like a password (it's effectively one).

---

## 2. Generate two random secrets

Quanta encrypts user TOTP secrets at rest and signs session cookies with HMAC. Both need a 32-byte random key (64 hex characters). **Don't reuse the same value for both** — separate keys means one being compromised doesn't compromise the other.

Pick whichever generator you find easiest:

**Option A: CLI (if you have one open)**
```bash
openssl rand -hex 32
# Run twice — once for SESSION_SECRET, once for TOTP_ENCRYPTION_KEY
```

**Option B: Browser dev console** (any tab, F12 → Console)
```javascript
Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map(b => b.toString(16).padStart(2, '0')).join('')
// Run twice
```

**Option C: 1Password / Bitwarden / etc.** — use the password generator, set length 64, character set "hex only" (a-f0-9).

**Option D: Online generator** — search "random hex generator", set length 64. (Avoid this if you can; you don't want your TOTP encryption key in someone's server logs.)

Stash both values somewhere safe (password manager). You'll paste them into Fly in step 3 and won't see them again.

---

## 3. Set the API app's secrets

`quanta-api` → **Secrets** tab → **New secret**.

Add each of these (one at a time, click Save between each):

| Name | Value |
|------|-------|
| `SESSION_SECRET` | First hex string from step 2 |
| `TOTP_ENCRYPTION_KEY` | Second hex string from step 2 |
| `REDIS_URL` | The full `redis://default:...@...upstash.io:port` string from step 1d |
| `WEB_URL` | `https://quanta-web.fly.dev` |

`DATABASE_URL` is already there from step 1c.

After all five are saved, the Secrets tab should show:

```
DATABASE_URL          ✓ set
REDIS_URL             ✓ set
SESSION_SECRET        ✓ set
TOTP_ENCRYPTION_KEY   ✓ set
WEB_URL               ✓ set
```

> **Don't set anything on `quanta-web`.** The web app reads its only environment value (`API_INTERNAL_URL`) from `fly.toml` directly, no secrets needed.

---

## 4. Create a Fly deploy token + paste it into GitHub

### 4a. Mint the Fly token

In the Fly dashboard:

- Top-right **account menu** (your avatar) → **Access Tokens** (may also be labelled **API Tokens** or **Personal Access Tokens** depending on the version)
- Click **Create a deploy token** (or **New token** → scope: deploy)
- Name: anything descriptive — `github-actions-deploy` works
- Expiry: 1 year (or your preferred lifetime)
- Click Create

The next page shows a `FlyV1 ...` token string. **Copy the entire thing including the `FlyV1 ` prefix.** This is the only time you'll see it.

### 4b. Add as a GitHub secret

Open [github.com/Anfaje/quanta-project-planner/settings/secrets/actions](https://github.com/Anfaje/quanta-project-planner/settings/secrets/actions).

- **New repository secret**
- Name: `FLY_API_TOKEN` (exact — case sensitive, no quotes)
- Value: paste the `FlyV1 ...` token from 4a
- **Add secret**

The list now shows `FLY_API_TOKEN` with a timestamp. The value is masked forever — to rotate, generate a new Fly token and update the secret.

---

## 5. Trigger the first deploy

The GitHub Actions workflows only trigger on file changes inside `packages/api/**` or `packages/web/**`. To kick off the first deploy, make a no-op change to each.

**Easiest path — edit in the GitHub UI:**

1. Open [packages/api/Dockerfile](https://github.com/Anfaje/quanta-project-planner/edit/main/packages/api/Dockerfile)
2. Add a trailing newline at the very end of the file (or change a comment text — anything trivial)
3. Commit directly to `main` with a message like `chore: trigger first deploy`
4. Repeat for [packages/web/Dockerfile](https://github.com/Anfaje/quanta-project-planner/edit/main/packages/web/Dockerfile)

**Watch them run:** [github.com/Anfaje/quanta-project-planner/actions](https://github.com/Anfaje/quanta-project-planner/actions)

You should see two workflow runs (one per package). Each runs CI first (typecheck + tests + integration for the API) and then the deploy job.

Expected timings:
| Workflow | CI | Deploy | Total |
|----------|----|--------|-------|
| API | ~3 min (unit + Postgres-backed integration) | ~90 sec | ~4–5 min |
| Web | ~1 min (typecheck + vitest + vite build) | ~60 sec | ~2 min |

When both go green, your apps are live.

**Verify the API:**
```
https://quanta-api.fly.dev/api/health
```
Should return JSON like `{"status":"ok","db":"connected","redis":"connected",...}`.

If `db` or `redis` is `disconnected`, see Troubleshooting below.

---

## 6. Seed the bootstrap admin user

You still can't log in — there's no user in the database. The seed script (from Drop 1) creates one bootstrap AA along with sample BUs, accounts, domains, and a small fixture team.

In the Fly dashboard:

- `quanta-api` → **Machines** (or **Overview** → click the running machine row) → look for **Console** / **Open shell** / **Web SSH**

In the shell that opens, run:

```bash
npx tsx prisma/seed.ts
```

**What gets seeded** (so you know what to expect):

| | Value |
|---|---|
| Whitelisted email domains | `trifork.com`, `trifork-na.com`, `spantree.com` |
| Bootstrap AA login | `sarah@trifork.com` |
| **Bootstrap password (all users)** | `quanta123` |
| Business Units | US-ORD-OWLS, DK-AAR-PANDA, US-CA-SE, EU-BER-FOXES |
| Accounts | A few fixture accounts |
| Sample users | ~13 across the various roles |

> ⚠️ **`quanta123` is a hard-coded dev password.** Log in immediately and change it via the admin console. The seed script lives in source — you should also rotate it to either skip user creation in prod or generate random per-user passwords ([TODO.md](TODO.md) flags this).

---

## 7. Log in

Open `https://quanta-web.fly.dev`. You should see the Quanta login screen.

- Email + password (the bootstrap credentials from step 6)
- You'll be prompted to set up TOTP — scan the QR with Google Authenticator, 1Password, or any TOTP app
- Enter the 6-digit code to confirm setup
- You should land on the dashboard

**First-login checklist:**
1. Open admin console → Users → change your name/password
2. Add real users via the Invite flow (until SMTP is wired up — TODO.md gap — the invite token is shown to you in the modal; copy the magic link to the new user out-of-band)
3. Create real BUs, Accounts, projects

You're live.

---

## What happens on every subsequent code change

Push to `main` → GitHub Actions runs the matching workflow → CI passes → deploy runs → new version goes live. Both happen automatically; you don't run any commands.

Migration safety: the API workflow runs `npx prisma migrate deploy` as Fly's release command *before* the new image goes live. If a migration fails, the deploy aborts and the previous machine keeps serving. No downtime even on bad migrations — you just get a failed Actions run.

---

## Troubleshooting

### CI passes but deploy fails with "no authentication credentials"
`FLY_API_TOKEN` isn't set on the GitHub repo, or it expired. Re-do step 4.

### Deploy succeeds but `/api/health` returns 503 or `db: "disconnected"`
The `prisma migrate deploy` release command probably failed. Open the Fly dashboard → `quanta-api` → **Monitoring** / **Live logs** and look for the migration error. Common causes:
- `DATABASE_URL` is wrong (re-do the postgres attach in step 1c)
- Migration file conflict — Prisma will say which migration is the culprit

### Health check shows `redis: "disconnected"`
- Verify `REDIS_URL` matches what Upstash showed — full string, no truncation
- Confirm the Upstash instance is in the same region as `quanta-api`
- Restart the API machine: Fly dashboard → `quanta-api` → Machines → ⋯ menu → Restart

### Web app loads but `/api/me` returns 502 Bad Gateway
The nginx upstream can't reach the API container. Both apps must be in the **same Fly organisation** (default org, unless you explicitly created another). Check `quanta-api` is actually running: Fly dashboard → `quanta-api` → Machines should show at least one machine in state `started`.

### Cookies don't persist between requests
- Browser devtools → Application → Cookies → check `connect.sid` has Secure, HttpOnly, SameSite=Strict
- Confirm the web URL is HTTPS (browsers reject Secure cookies over HTTP)
- The trust-proxy setting in `createApp` should handle this; if it doesn't, file an issue with browser + cookie details

### "Too many attempts. Please try again later." on login
The rate limiter is firing — limit is 10 attempts per 15 minutes per IP. Wait, or restart the API machine (resets the limiter's memory).

### Need to roll back to the previous version
Fly dashboard → `quanta-api` (or `quanta-web`) → **Image history** (or **Releases**) → click the previous deployment → **Rollback**. Effectively instant.

### A workflow is stuck or you need to re-run after fixing a secret
GitHub Actions tab → click the failed run → **Re-run all jobs** (top right). No code change needed.

---

## Tear it down

If you want to pause spending or start over:

| Resource | Where to delete |
|----------|----------------|
| `quanta-web` app | Fly dashboard → `quanta-web` → Settings → Delete app |
| `quanta-api` app | Fly dashboard → `quanta-api` → Settings → Delete app |
| `quanta-db` Postgres | Fly dashboard → Databases → `quanta-db` → Settings → Delete |
| `quanta-redis` Upstash | Fly dashboard → Databases → `quanta-redis` → Settings → Delete |
| `FLY_API_TOKEN` GitHub secret | github.com/Anfaje/quanta-project-planner/settings/secrets/actions → Delete |
| The Fly token itself | Fly dashboard → account menu → Access Tokens → Revoke |

---

## What's deferred to Drop 5c

This is the minimum viable deploy. Bigger production work is parked in [`TODO.md`](TODO.md) under Drop 5c:

- **Terraform** — declarative provisioning so the above is reproducible from code instead of dashboard clicks
- **Custom domain + cert** — `quanta.your-company.com` instead of `*.fly.dev`
- **Staging environment** alongside prod
- **Observability** — Sentry, structured log aggregation
- **Backup strategy** beyond Fly's Postgres defaults

When you're ready to harden, that's the list.

---

## Appendix: CLI equivalents

For reference if you ever want to drive Fly from a terminal instead of the UI. Everything below is optional.

```bash
# One-time install
curl -L https://fly.io/install.sh | sh
fly auth login

# Steps 1a, 1b, 1c, 1d, 1e
fly apps create quanta-api
fly apps create quanta-web
fly postgres create --name quanta-db --region ord \
  --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 3
fly postgres attach quanta-db --app quanta-api
fly redis create --name quanta-redis --region ord

# Step 3
fly secrets set --app quanta-api \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  TOTP_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  REDIS_URL="<from fly redis create>" \
  WEB_URL="https://quanta-web.fly.dev"

# Step 4a
fly tokens create deploy -x 8760h

# Step 6
fly ssh console --app quanta-api -C "npx tsx prisma/seed.ts"

# Manual deploys (in case CI is broken)
cd packages/api && fly deploy --remote-only
cd packages/web && fly deploy --remote-only
```
