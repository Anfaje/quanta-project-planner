import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import RedisStore from "connect-redis";
import Redis from "ioredis";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";

const app = express();
const port = Number(process.env.API_PORT) || 4000;

// ── Redis ──
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// ── Middleware ──
app.use(helmet());
app.use(cors({
  origin: process.env.WEB_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(pinoHttp({ logger }));

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

// ── Health check ──
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
  } catch (err) {
    res.status(503).json({ status: "error", message: "Service unavailable" });
  }
});

// ── Route placeholders (will be populated in Drop 2 + 3) ──
app.get("/api/me", (_req, res) => {
  res.json({ message: "Auth routes coming in Drop 2" });
});

// ── Start ──
app.listen(port, "0.0.0.0", () => {
  logger.info(`🚀 Quanta API listening on port ${port}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`   Health check: http://localhost:${port}/api/health`);
});

export default app;
