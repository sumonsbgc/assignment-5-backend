import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env.js";

// BullMQ needs maxRetriesPerRequest=null on its connection — it manages
// retries itself and the ioredis-default of 3 conflicts with blocking commands.
export const queueConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export type VideoJobPayload = {
  jobId: number;
  rawKey: string;
  contentType: "movie" | "episode";
  contentId: number;
};

export const videoQueue = new Queue<VideoJobPayload>("video-transcode", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});
