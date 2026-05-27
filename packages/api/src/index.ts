import "dotenv/config";
import RedisStore from "connect-redis";
import Redis from "ioredis";
import { createApp } from "./createApp";
import { logger } from "./lib/logger";

/**
 * Production entry point.
 *
 * The Express app definition lives in `createApp` so integration tests can
 * import it without binding a port or requiring Redis. Here we just wire in
 * the real Redis-backed session store and start listening.
 */

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const app = createApp({
  sessionStore: new RedisStore({ client: redis }),
  redisStatus: () => redis.status === "ready",
});

const port = Number(process.env.API_PORT) || 4000;

app.listen(port, "0.0.0.0", () => {
  logger.info(`🚀 Quanta API listening on port ${port}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`   Health: http://localhost:${port}/api/health`);
});

export default app;
