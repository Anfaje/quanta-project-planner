import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import RedisStore from "connect-redis";
import Redis from "ioredis";
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

const app = express();
const port = Number(process.env.API_PORT) || 4000;

// ── Redis ──
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// ── Core Middleware ──
app.use(helmet());
app.use(cors({
  origin: process.env.WEB_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

// ── Session ──
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET || "dev-fallback-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
}));

// ── Auth User Loading (runs on every request) ──
app.use(loadAuthUser);

// ── Rate Limiting (auth endpoints) ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: "Too many attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Health Check ──
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisOk = redis.status === "ready";
    res.json({
      status: "ok",
      db: "connected",
      redis: redisOk ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "error", message: "Service unavailable" });
  }
});

// ── Routes ──
app.use("/api/auth", authLimiter, authRoutes);
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

// ── Start ──
app.listen(port, "0.0.0.0", () => {
  logger.info(`🚀 Quanta API listening on port ${port}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`   Health: http://localhost:${port}/api/health`);
});

export default app;
