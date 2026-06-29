# Staging environment

Staging is a full, isolated mirror of production for alpha testing. **Every push
to `main` auto-deploys to staging.** Production is a deliberate promotion (see
[Promoting to production](#promoting-to-production)).

| | Production | Staging |
|---|---|---|
| API app | `quanta-api` | `quanta-api-staging` |
| Web app | `quanta-web` | `quanta-web-staging` |
| Database | prod Postgres | **separate** Postgres (`quanta-db-staging`) |
| Redis | prod Upstash | **separate** Upstash |
| Deploys on | tag `v*` / manual | push to `main` |
| Config | `fly.toml` | `fly.staging.toml` |

Schema is still applied with `prisma db push` (same as prod). When we move to
`prisma migrate`, swap the `release_command` in **both** `fly.toml` and
`fly.staging.toml` together.

## One-time provisioning (needs Fly access — run locally)

Do this **before** merging the staging-setup branch, so the first auto-deploy
has somewhere to land.

```bash
# --- Staging API ---
fly apps create quanta-api-staging
fly postgres create --name quanta-db-staging --region ord   # smallest size is fine
fly postgres attach quanta-db-staging --app quanta-api-staging   # sets DATABASE_URL

# Staging secrets — generate NEW values; never reuse prod's SESSION_SECRET,
# or sessions would be valid across environments. TOTP_ENCRYPTION_KEY must be
# at least 32 characters.
fly secrets set --app quanta-api-staging \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  TOTP_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  REDIS_URL="rediss://…staging-upstash…"

# --- Staging Web ---
fly apps create quanta-web-staging
# No DB/Redis: it's nginx + static dist, proxying /api/* to
# quanta-api-staging.internal (already set in fly.staging.toml).
```

## Cut over

1. Merge the `staging-setup` branch to `main`.
2. The API and web workflows run CI, then auto-deploy to the **staging** apps.
   The API release command runs `prisma db push` against the staging DB.
3. Seed the single alpha user into staging (creates only `afh@trifork.com`
   plus one BU + one account; **not** the full demo data):
   ```bash
   fly ssh console --app quanta-api-staging -C "npm run db:seed:staging"
   ```
   Initial login is `afh@trifork.com` / `Trifork-staging-changeme` (override by
   running an interactive `fly ssh console` and setting `SEED_ADMIN_PASSWORD`).
   Change it on first login.
4. Smoke-test `https://quanta-web-staging.fly.dev` (a "STAGING" badge appears
   bottom-right). Hand the URL + seeded test logins to alpha testers.

> After cut-over, pushes to `main` no longer touch production — they go to
> staging. Production only changes via promotion.

## Promoting to production

Production deploys both services from a chosen commit as a coherent pair.

- **Tag (recommended):** `git tag v1.0.0 && git push origin v1.0.0`
- **Manual:** Actions → *Promote to production* → Run workflow → type `deploy`.

Tests already ran when the commit merged to `main`, so promotion is deploy-only.
Cut tags from `main`. For a hard gate, add `environment: production` with
required reviewers (Settings → Environments) to the deploy jobs in
`.github/workflows/promote-prod.yml`.

## Notes

- **Cost:** staging machines scale to zero when idle (`auto_stop_machines`,
  `min_machines_running = 0`); expect a brief cold start on the first request.
  Flip those to match prod if it's annoying.
- **Access:** staging is publicly reachable but login-gated by the seeded
  accounts. If alpha needs to be locked down harder, add HTTP basic auth at the
  web nginx layer or an IP allowlist — tracked as a follow-up.
