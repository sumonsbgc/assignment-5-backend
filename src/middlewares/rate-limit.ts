import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redis } from "@lib/redis.js";

function makeRedisStore(prefix: string) {
  return new RedisStore({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendCommand: (...args: string[]) => redis.call(args[0]!, ...(args.slice(1))) as Promise<any>,
    prefix: `rl:${prefix}:`,
  });
}

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore("auth"),
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" } },
});

export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  store: makeRedisStore("pwd-reset"),
  message: { error: { code: "RATE_LIMITED", message: "Too many password reset attempts" } },
});

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  store: makeRedisStore("general"),
  message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
});

export const reviewRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  store: makeRedisStore("review"),
  message: { error: { code: "RATE_LIMITED", message: "Review submission limit reached" } },
});

export const streamingRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  store: makeRedisStore("streaming"),
  message: { error: { code: "RATE_LIMITED", message: "Streaming request limit reached" } },
});
