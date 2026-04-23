# Quanta — Local Setup Guide

Step-by-step instructions to get Quanta running on your machine.

## Prerequisites

You need these installed:

| Tool | Version | Check with |
|------|---------|------------|
| **Docker Desktop** | Any recent | `docker --version` |
| **Node.js** | 20+ | `node --version` |
| **npm** | 9+ | `npm --version` |
| **Git** | Any | `git --version` |

If you don't have Docker Desktop: https://www.docker.com/products/docker-desktop/

**Important (macOS):** Make sure Docker Desktop is running before Step 3. Open it from Applications and wait for the whale icon in the menu bar to stop animating. You can verify with `docker info`.

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/Anfaje/quanta-project-planner.git
cd quanta-project-planner
```

## Step 2 — Create your .env file

```bash
cp .env.example .env
```

The defaults work as-is for local development. No edits needed.

## Step 3 — Start the infrastructure

This starts PostgreSQL, Redis, and Mailpit (local email testing):

```bash
docker-compose up -d postgres redis mailpit
```

Wait a few seconds, then verify they're running:

```bash
docker-compose ps
```

You should see all three services with status `Up` or `running`.

## Step 4 — Install dependencies

```bash
npm install
```

This installs both the API and web packages (mono-repo workspaces).

## Step 5 — Run database migrations

```bash
cd packages/api
npx prisma migrate dev --name init
```

This creates all the database tables. You should see output ending with:

```
Your database is now in sync with your schema.
```

## Step 6 — Seed the database

```bash
npm run db:seed
```

You should see:

```
🌱 Seeding Quanta database...

✅ 4 Business Units
✅ 4 Accounts
✅ 13 Users (password: quanta123)
✅ 3 Whitelisted Domains
✅ Account Manager assignments (Lena → Meridian + Pinnacle)
✅ Project: Brand Refresh 2026
✅ 3 Resource Assignments
✅ 24 Hour Entries
✅ 6 Config entries

🎉 Seed complete!
```

Go back to the project root:

```bash
cd ../..
```

## Step 7 — Start the dev servers

```bash
npm run dev
```

This starts both the API and the web frontend concurrently. You'll see logs from both.

---

## What's running

| Service | URL | What it does |
|---------|-----|-------------|
| **API** | http://localhost:4000 | Express backend |
| **Web** | http://localhost:5173 | React frontend (placeholder for now) |
| **Mailpit** | http://localhost:8025 | Email inbox (catches all outgoing mail) |
| **Postgres** | localhost:5432 | Database |
| **Redis** | localhost:6379 | Sessions + cache |

## Step 8 — Verify everything works

### Check the health endpoint

Open in your browser or run:

```bash
curl http://localhost:4000/api/health
```

You should see:

```json
{
  "status": "ok",
  "db": "connected",
  "redis": "connected",
  "timestamp": "2026-04-..."
}
```

### Check the web frontend

Open http://localhost:5173 in your browser. You should see the Quanta logo with "Foundation ready — Drop 1 complete". (The full UI comes in Drop 4.)

### Test the auth API

**Get allowed domains:**

```bash
curl http://localhost:4000/api/auth/domains
```

Returns: `{"domains":["spantree.com","trifork-na.com","trifork.com"]}`

**Register a new user:**

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@trifork.com",
    "password": "testpass123",
    "name": "New User",
    "projectRoles": ["Backend", "DevOps"]
  }'
```

Returns a success response with MFA setup details (QR URI + manual key).

**Try a blocked domain:**

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "someone@gmail.com",
    "password": "testpass123",
    "name": "Blocked User",
    "projectRoles": []
  }'
```

Returns 403: `{"error":"Email domain not authorised","allowedDomains":[...]}`

**Login with a seeded user:**

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email": "sarah@trifork.com", "password": "quanta123"}'
```

Returns `{"status":"mfa_setup_required","mfaSetup":{...}}` (seed users haven't completed MFA setup yet).

### Browse the database

If you want to inspect the data visually:

```bash
cd packages/api
npx prisma studio
```

Opens a browser-based database explorer at http://localhost:5555. You can browse all tables, see the seeded users, their roles, projects, hour entries, etc.

---

## Seed users

All passwords are `quanta123`.

| Email | Roles | Notes |
|-------|-------|-------|
| sarah@trifork.com | AA + IC | Platform admin, has financial access |
| sara@trifork.com | BUL + PM + IC | BU leader for US-ORD-OWLS |
| lena@trifork.com | AC + PM + IC | Manages Meridian Corp + Pinnacle Tech |
| jonas@trifork.com | PM + IC | Designer in DK-AAR-PANDA |
| tom@spantree.com | PM + IC | Full Stack in US-ORD-OWLS |
| kai@trifork.com | PM + IC | ML Engineer in US-CA-SE |
| maya@trifork.com | IC | iOS Dev in US-ORD-OWLS |
| alex@trifork-na.com | IC | Backend in US-ORD-OWLS |
| priya@trifork.com | IC | 3D Dev in US-ORD-OWLS |
| diego@trifork-na.com | IC | DevOps in US-ORD-OWLS |
| emma@spantree.com | IC | iOS Dev in US-CA-SE |
| noor@trifork.com | IC | QA Lead in EU-BER-FOXES |
| marco@trifork.com | IC | Backend in EU-BER-FOXES (inactive) |

---

## Run tests

```bash
cd packages/api
npx vitest run
```

Should show 42 tests passing across 3 test suites (permissions, serializer, TOTP).

---

## Stopping everything

```bash
# Stop the dev servers: Ctrl+C in the terminal running `npm run dev`

# Stop Docker services
docker-compose down

# To also wipe the database volume (full reset)
docker-compose down -v
```

## Starting fresh

If you want to reset the database and re-seed:

```bash
docker-compose up -d postgres redis mailpit
cd packages/api
npx prisma migrate reset --force
npm run db:seed
cd ../..
npm run dev
```

---

## Troubleshooting

**"Port 5432 already in use"** — You have another Postgres running. Stop it, or change the port in `docker-compose.yml`.

**"Cannot find module '@prisma/client'"** — Run `cd packages/api && npx prisma generate` then try again.

**"ECONNREFUSED on Redis"** — Make sure Docker services are running: `docker-compose ps`.

**npm install fails** — Make sure you're on Node 20+. Run `node --version` to check.
