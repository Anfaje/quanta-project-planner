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

// Last-resort safety net. Node >=15 exits the process on an unhandled promise
// rejection, so a single un-caught async error in a request handler would take
// the whole API down and flap the health check. Log with full context instead
// so the process stays up to serve other requests and the cause is visible in
// `fly logs` rather than a silent exit.
process.on("unhandledRejection", (reason) => {
  logger.error(
    { reason: reason instanceof Error ? reason.stack : String(reason) },
    "Unhandled promise rejection"
  );
});
process.on("uncaughtException", (err) => {
  logger.error({ err: err.stack ?? err.message }, "Uncaught exception");
});

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  // Fail a command after a few retries instead of queueing forever, so a
  // session read/write surfaces an error the middleware can handle rather
  // than hanging the request (which would 504 behind Fly's proxy).
  maxRetriesPerRequest: 3,
});

// CRITICAL: an ioredis client with no 'error' listener throws an *unhandled*
// 'error' event on any connection problem, which crashes the Node process.
// /api/health never touches Redis, so the process can pass health checks at
// boot and then die on the first request that writes a session (e.g. login) —
// surfacing as a 502 and a flapping health check. Log the error instead so a
// Redis problem degrades gracefully and is visible in the logs.
redis.on("error", (err) => {
  logger.error({ err: (err as Error).message }, "Redis client error");
});
redis.on("connect", () => logger.info("Redis connection established"));
redis.on("ready", () => logger.info("Redis ready"));

const app = createApp({
  sessionStore: new RedisStore({ client: redis }),
  redisStatus: () => redis.status === "ready",
});

const port = Number(process.env.API_PORT) || 4000;

// Listen on :: (dual-stack), NOT 0.0.0.0. Fly's private network (6PN — what
// *.internal names like quanta-api.internal resolve to) is IPv6-only, so
// binding to 0.0.0.0 (IPv4) leaves the app reachable via Fly's public proxy
// but NOT from other Fly apps over .internal. That's why the web container's
// nginx /api proxy got connection-refused → 502 while public curls returned
// 401. On Linux, a :: socket also accepts IPv4-mapped connections, so the
// public proxy and health checks keep working.
app.listen(port, "::", () => {
  logger.info(`🚀 Quanta API listening on port ${port}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`   Health: http://localhost:${port}/api/health`);
});

export default app;
