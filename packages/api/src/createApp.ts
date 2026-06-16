import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { loadAuthUser } from "./middleware/auth";
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import adminRoutes from "./routes/admin";
import projectRoutes from "./routes/projects";
import dashboardRoutes from "./routes/dashboard";
import exportRoutes from "./routes/exports";
import inviteRoutes from "./routes/invites";

/**
 * App factory.
 *
 * Production (`index.ts`) wires in a Redis-backed session store plus a real
 * Redis client for the health-check probe. Integration tests pass nothing
 * here — they get an in-memory session store (the express-session default),
 * a `redisStatus` callback that just returns true, and `logging: false` to
 * avoid noisy pino output in test runs.
 *
 * The factory deliberately does NOT call `app.listen()` — that's the caller's
 * job. This is the seam that lets supertest pass `app` directly without
 * binding a port.
 */
export interface CreateAppOptions {
  /** Session store. Omit for the default (in-memory) — fine for tests, NOT for prod. */
  sessionStore?: session.Store;
  /** Health-check probe for Redis. Defaults to `() => true`. */
  redisStatus?: () => boolean;
  /** Disable pino HTTP logging — useful in tests. */
  logging?: boolean;
}

export function createApp(opts: CreateAppOptions = {}): Express {
  const app = express();

  // Trust Fly's edge proxy (and any single reverse-proxy hop in front)
  // so req.secure honours X-Forwarded-Proto and the SameSite=strict +
  // secure cookie correctly. Setting "1" rather than `true` so we don't
  // blindly trust arbitrary depth — relevant if rate-limit ever uses
  // req.ip for keys.
  app.set("trust proxy", 1);

  // ── Core middleware ──
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.WEB_URL || "http://localhost:5173",
      credentials: true,
    })
  );
  app.use(express.json());

  if (opts.logging !== false) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === "/api/health" },
      })
    );
  }

  // ── Session ──
  app.use(
    session({
      store: opts.sessionStore, // undefined → MemoryStore (used in tests)
      secret: process.env.SESSION_SECRET || "dev-fallback-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      },
    })
  );

  // ── Auth user loading (runs on every request) ──
  app.use(loadAuthUser);

  // ── Rate limiting for auth-style endpoints ──
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: "Too many attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    // Tests issue more than 10 requests per IP; gate the limiter to skip in
    // test mode. The unit test suite doesn't exercise rate limiting; the
    // integration suite tests it explicitly by toggling this flag.
    //
    // Also skip GET /api/auth/domains: it's a public, read-only endpoint the
    // signup form fetches on load, so it must not share the auth-attempt
    // budget — otherwise a few page reloads (or reloads plus login attempts)
    // would 429 it and the form would wrongly report every domain as not
    // allowed. req.path is mount-relative ("/domains") here; the endsWith
    // guard covers it regardless of how the router strips the prefix.
    skip: (req) =>
      process.env.RATE_LIMIT_DISABLED === "1" ||
      req.path === "/domains" ||
      req.path.endsWith("/auth/domains"),
  });

  // ── Health check ──
  const redisStatus = opts.redisStatus ?? (() => true);
  app.get("/api/health", async (_req, res) => {
    // Fly Managed Postgres (pgbouncer) recycles idle connections, so a pooled
    // connection may already be dead when a query lands on it. Prisma reconnects
    // transparently on the next query, so retry SELECT 1 once: this prevents a
    // single recycled connection from producing a false 503 and flapping Fly's
    // health check (which otherwise marks the machine unhealthy and 502s).
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return res.json({
          status: "ok",
          db: "connected",
          redis: redisStatus() ? "connected" : "disconnected",
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        if (attempt === 2) {
          logger.error(
            { err: (err as Error)?.message ?? String(err) },
            "Health check failed: database SELECT 1 errored after retry"
          );
          return res
            .status(503)
            .json({ status: "error", message: "Service unavailable" });
        }
        // brief pause to let Prisma establish a fresh connection
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  });

  // ── Routes ──
  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/invites", authLimiter, inviteRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  // exportRoutes defines /projects/:id/export.csv and .pdf — mount at /api so
  // the full path is /api/projects/:id/export.csv (alongside /api/projects).
  app.use("/api", exportRoutes);

  // ── 404 handler ──
  app.use("/api/*", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  return app;
}
