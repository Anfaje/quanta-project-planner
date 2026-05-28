# Deploying Quanta to Fly.io

This walks through deploying the API and Web packages to Fly.io for end-to-end testing. Total cost on Fly's free tier is currently $0; add a credit card to unlock Postgres + Redis.

If you've never used Fly, the model is: one CLI (`flyctl`) that wraps Docker builds, image registry pushes, machine scheduling, and TLS certs. You don't manage VMs directly.

---

## 0. Prerequisites

- A Fly.io account ([fly.io/app/sign-up](https://fly.io/app/sign-up))
- A credit card linked (free tier covers everything we need; the card is just a fraud check)
- `flyctl` installed locally:
  ```bash
  curl -L https://fly.io/install.sh | sh
  fly auth login
  ```
- Docker installed locally (only needed if `flyctl` chooses to build locally; usually it builds on Fly's remote builder)

---

## 1. Create the apps + provision the data services

You can do these in any order. Region `ord` is Chicago — pick whatever is closest to you, but **the API, Postgres, and Redis should all be in the same region** to keep latency low.

```bash
# From the repo root
cd packages/api

# 1a. Reserve the API app name (no machines yet)
fly apps create quanta-api

# 1b. Provision managed Postgres in the same region
fly postgres create \
  --name quanta-db \
  --region ord \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 3

# 1c. Wire the DB to the API app. This sets DATABASE_URL as a secret on
#     quanta-api automatically.
fly postgres attach quanta-db --app quanta-api

# 1d. Provision Upstash Redis via Fly's integration. Copy the printed
#     REDIS_URL — you'll set it as a secret in step 2.
fly redis create --name quanta-redis --region ord

# 1e. Reserve the web app name
cd ../web
fly apps create quanta-web
```

---

## 2. Set the API's secrets

Run this from `packages/api/`. Three secrets are random — generate them now; you won't see them again unless you save them somewhere. The fourth points at the web app's public URL.

```bash
cd packages/api

fly secrets set --app quanta-api \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  TOTP_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  REDIS_URL="<the URL fly redis create printed>" \
  WEB_URL="https://quanta-web.fly.dev"
```

`DATABASE_URL` was set for you by `fly postgres attach` in step 1c — verify with:

```bash
fly secrets list --app quanta-api
```

You should see all five secrets listed (no values shown, just names + timestamps).

---

## 3. Deploy the API

```bash
cd packages/api
fly deploy
```

Fly builds the Docker image on its remote builder, pushes it to Fly's registry, and creates one Machine running it. On first deploy, `prisma migrate deploy` runs as the release command before the new image goes live — your database is now at the current schema.

Watch the deploy:

```bash
fly logs --app quanta-api
```

Health check:

```bash
curl https://quanta-api.fly.dev/api/health
# {"status":"ok","db":"connected","redis":"connected",...}
```

If `db` shows disconnected, the release command probably failed — check `fly logs` for the migration error and re-run `fly deploy` after fixing.

---

## 4. Seed the bootstrap admin user

Until SMTP-delivered invites land (TODO.md production-readiness gaps), you need one AA user to log in as. Run the existing seed script via SSH to the API machine:

```bash
fly ssh console --app quanta-api -C "npx tsx prisma/seed.ts"
```

The seed script (from Drop 1) creates the default domains, BUs, accounts, and a bootstrap AA user. Note the printed email + password — that's your first login.

> 🔒 **Change the password immediately after first login.** The seed credentials are committed to source.

---

## 5. Deploy the web app

```bash
cd ../web
fly deploy
```

Once it's up, browse to:

```
https://quanta-web.fly.dev
```

Log in with the AA credentials from step 4. You should land on the dashboard. Click through to Projects, the wizard, the admin console — all of it is now hitting `quanta-api.fly.dev` via the nginx proxy in the web container.

---

## 6. Re-deploy on changes

Once CI/CD is wired up (next section), you don't need to do this manually — just push to `main`. Until then, or for one-off out-of-band deploys:

```bash
# Push code changes
git push origin main

# Then redeploy whichever package(s) changed
cd packages/api && fly deploy   # or
cd packages/web && fly deploy
```

For the API, `prisma migrate deploy` runs again as a release command — new migrations applied before the new image goes live.

---

## 7. Wire up CI/CD (recommended)

GitHub Actions can take over from manual `fly deploy`. Two workflows live in [`.github/workflows/`](.github/workflows/):

- `api.yml` — typecheck + unit tests + integration tests against an ephemeral Postgres + deploy on push to `main`
- `web.yml` — typecheck + tests + vite build + deploy on push to `main`

Both run CI on every PR (no deploy) and auto-deploy when the matching package's code changes land on `main`. Path filters mean a docs-only or web-only change doesn't kick off API CI, and vice versa.

### One-time setup

Get a Fly deploy token from your workstation and paste it into the GitHub repo secrets:

```bash
# Create a long-lived deploy-scoped token (recommended over fly auth token,
# which has full account power).
fly tokens create deploy --expiry 999999h
```

Copy the printed `FlyV1 ...` string. Then:

1. Open https://github.com/Anfaje/quanta-project-planner/settings/secrets/actions
2. Click **New repository secret**
3. Name: `FLY_API_TOKEN`
4. Value: the token from `fly tokens create deploy` (paste the whole thing including the `FlyV1 ` prefix)
5. Save

That's it. The next push to `main` that touches `packages/api/**` or `packages/web/**` will trigger CI, and if it passes, deploy.

### What you'll see

On a PR, the **Checks** tab will show the relevant CI jobs run and (for the API) the integration suite spinning up Postgres. Required check status surfaces in the merge button. On merge to `main`, the deploy job kicks off — typically 90–120 seconds for the API (build + push + release migration + machine swap), 60 seconds for the web app.

If a deploy job fails after CI passed (e.g. a migration conflict at release time), the previous machine keeps serving — Fly only swaps once the new machine reports healthy.

### Out-of-band deploys

You can still run `fly deploy` manually from your workstation any time — useful for hotfix branches, or to roll back via `fly deploy --image registry.fly.io/quanta-api:deployment-XXXX`. The CI deploys and manual deploys share the same concurrency group on Fly's side, so a manual deploy won't race a CI one.

---

## What to check / what to expect

| Area | Expected behaviour |
|------|-------------------|
| Login → MFA | Both pages render; the QR fetches from `api.qrserver.com` (external — see TODO.md) |
| `/api/me` | Returns user JSON with `roles`, `dashboardSections` |
| Dashboard sections | Match your role (IC → my_hours, AA → platform_admin, etc.) |
| Projects list | Empty initially — create one through the wizard as AA or PM |
| Audit log | Visible to AA in `/admin` → recent admin actions tab |
| Cookies | First-party (`quanta-web.fly.dev`), SameSite=strict, secure, HttpOnly |
| TLS | Fly auto-provisions; both apps serve only HTTPS |

---

## Troubleshooting

**`fly deploy` builds successfully but health check fails.**
The release command's `prisma migrate deploy` probably failed. Check `fly logs --app quanta-api`. Common causes: `DATABASE_URL` not actually set (rerun `fly postgres attach`); migration file conflict (Prisma will say which).

**Health check shows `"redis":"disconnected"`.**
`REDIS_URL` is wrong or the Upstash instance is in a different region. Verify with `fly secrets list --app quanta-api` and confirm Upstash is in `ord` (same as API).

**Web app loads but `/api/me` returns 502.**
The nginx upstream can't reach the API container. Check `fly status --app quanta-api` — the machine should be running and the health check passing. The web container uses `quanta-api.internal:4000` on Fly's private IPv6 network; both apps must be in the same Fly organisation (default org if you didn't create extras).

**Cookies not persisting between requests.**
`trust proxy` is enabled in `createApp` so secure cookies work behind Fly's TLS edge — confirm with browser devtools that the `connect.sid` cookie has Secure, HttpOnly, SameSite=Strict set. If it doesn't, double-check that the web URL is HTTPS (not HTTP).

**"Too many attempts. Please try again later." on login.**
The rate limiter is firing. Hit `/api/auth/login` ≤10 times per 15-minute window per IP. Wait 15 minutes or scale the API machine to a fresh one (`fly machine restart`).

---

## Tear it down

If you want to start over or pause spending:

```bash
fly apps destroy quanta-web --yes
fly apps destroy quanta-api --yes
fly postgres destroy quanta-db --yes
# Redis is destroyed through the Upstash dashboard or:
fly redis destroy quanta-redis --yes
```

---

## What's deferred to Drop 5b

This is "Drop 5a — get it on Fly for testing". The bigger infrastructure work is parked:

- **Terraform** — declarative provisioning so the above is reproducible from code
- **GitHub Actions CI/CD** — auto-deploy on push to `main`, run both test suites first
- **Custom domain + cert** — `quanta.your-company.com` instead of `*.fly.dev`
- **Staging environment** — `quanta-api-staging` alongside prod
- **Observability** — Sentry / Datadog / structured log aggregation
- **Backup strategy** — Postgres point-in-time recovery + automated snapshots beyond Fly's defaults

When you're ready to harden, see TODO.md → Drop 5 section.
