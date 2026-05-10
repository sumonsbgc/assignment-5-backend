/**
 * Video transcoding worker.
 *
 * Pulls VideoJob payloads from the `video-transcode` BullMQ queue.
 * For each job:
 *   1. Downloads the raw upload from R2 to a tmp dir.
 *   2. Runs FFmpeg to produce an HLS adaptive bitrate ladder:
 *        - 1080p @ 5000 kbps
 *        - 720p  @ 3000 kbps
 *        - 480p  @ 1400 kbps
 *        - 360p  @ 800  kbps
 *      6-second segments, single master.m3u8 playlist.
 *   3. Uploads every segment + variant playlist + master.m3u8 back to R2 under
 *      videos/hls/{contentType}-{contentId}-{jobId}/.
 *   4. Updates Movie.videoUrl / Episode.videoUrl to the master playlist key.
 *   5. Deletes the raw source from R2.
 *   6. Marks the VideoJob COMPLETED (or FAILED with error message).
 *
 * Run with: `npm run worker`
 */
import { Worker, type Job } from "bullmq";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import ffmpegPath from "ffmpeg-static";
// ffprobe-static ships no types; the runtime export shape is { path: string }.
// @ts-expect-error -- no @types/ffprobe-static package exists
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { queueConnection, type VideoJobPayload } from "@lib/queue.js";
import { r2 } from "@lib/r2.js";
import { env } from "@lib/env.js";
import { prisma } from "@lib/database.js";
import { logger } from "@utils/logger.js";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

type Variant = { name: string; width: number; height: number; videoBitrate: string; audioBitrate: string };

const LADDER: Variant[] = [
  { name: "360p",  width: 640,  height: 360,  videoBitrate: "800k",  audioBitrate: "96k"  },
  { name: "480p",  width: 854,  height: 480,  videoBitrate: "1400k", audioBitrate: "128k" },
  { name: "720p",  width: 1280, height: 720,  videoBitrate: "3000k", audioBitrate: "128k" },
  { name: "1080p", width: 1920, height: 1080, videoBitrate: "5000k", audioBitrate: "192k" },
];

const SEGMENT_DURATION = 6; // seconds

async function downloadFromR2(key: string, destPath: string) {
  const res = await r2.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
  if (!res.Body) throw new Error(`Empty body for R2 object ${key}`);
  await pipeline(res.Body as Readable, createWriteStream(destPath));
}

async function uploadFileToR2(localPath: string, key: string, contentType: string) {
  const stream = createReadStream(localPath);
  const { size } = await stat(localPath);
  await r2.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Body: stream,
    ContentType: contentType,
    ContentLength: size,
  }));
}

async function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration ?? 0);
    });
  });
}

async function transcodeVariant(input: string, outDir: string, v: Variant): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const playlist = path.join(outDir, "index.m3u8");
  // -hls_time: segment length. -hls_playlist_type vod: complete playlist.
  // -force_key_frames sets a keyframe at every segment boundary, which is
  // required for clean ABR switching at the player level.
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size(`${v.width}x${v.height}`)
      .videoBitrate(v.videoBitrate)
      .audioBitrate(v.audioBitrate)
      .outputOptions([
        "-preset", "veryfast",
        "-profile:v", "main",
        "-sc_threshold", "0",
        "-g", String(SEGMENT_DURATION * 30), // GOP = segment * fps
        "-keyint_min", String(SEGMENT_DURATION * 30),
        "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_DURATION})`,
        "-hls_time", String(SEGMENT_DURATION),
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", path.join(outDir, "seg_%03d.ts"),
        "-f", "hls",
      ])
      .output(playlist)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

// Master playlist references variant playlists by absolute public R2 URLs.
// Why: the player fetches the master via a signed URL (from the auth-gated
// /stream/.../manifest endpoint), but each child segment request would need
// its own signature — too many, and signatures don't propagate across paths.
// Putting auth on the manifest endpoint and serving HLS assets from the
// public R2 base is the standard pattern.
function masterPlaylist(variants: Variant[], publicBase: string) {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const v of variants) {
    const videoBps = parseInt(v.videoBitrate) * 1000;
    const audioBps = parseInt(v.audioBitrate) * 1000;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${videoBps + audioBps},RESOLUTION=${v.width}x${v.height},CODECS="avc1.4d401f,mp4a.40.2"`);
    lines.push(`${publicBase}/${v.name}/index.m3u8`);
  }
  return lines.join("\n") + "\n";
}

async function uploadDir(localDir: string, keyPrefix: string) {
  const entries = await readdir(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(localDir, entry.name);
    if (entry.isDirectory()) {
      await uploadDir(full, `${keyPrefix}/${entry.name}`);
    } else {
      const mime = entry.name.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : entry.name.endsWith(".ts")
          ? "video/mp2t"
          : "application/octet-stream";
      await uploadFileToR2(full, `${keyPrefix}/${entry.name}`, mime);
    }
  }
}

async function processJob(payload: VideoJobPayload, job: Job<VideoJobPayload>) {
  const { jobId, rawKey, contentType, contentId } = payload;
  const workDir = path.join(env.VIDEO_TMP_DIR, `job-${jobId}`);
  const inputPath = path.join(workDir, "input.bin");
  const hlsDir = path.join(workDir, "hls");

  await prisma.videoJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });
  await mkdir(workDir, { recursive: true });

  try {
    logger.info({ jobId, rawKey }, "Downloading raw video from R2");
    await downloadFromR2(rawKey, inputPath);
    await job.updateProgress(10);

    const duration = await probeDuration(inputPath);
    logger.info({ jobId, durationSec: duration }, "Probed input");

    const totalSteps = LADDER.length;
    for (let i = 0; i < LADDER.length; i++) {
      const v = LADDER[i]!;
      logger.info({ jobId, variant: v.name }, "Transcoding variant");
      await transcodeVariant(inputPath, path.join(hlsDir, v.name), v);
      await job.updateProgress(10 + Math.round(((i + 1) / totalSteps) * 70));
    }

    const outputPrefixEarly = `videos/hls/${contentType}-${contentId}-${jobId}`;
    const publicBase = `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${outputPrefixEarly}`;
    const master = masterPlaylist(LADDER, publicBase);
    await writeFile(path.join(hlsDir, "master.m3u8"), master, "utf8");

    const outputPrefix = outputPrefixEarly;
    logger.info({ jobId, outputPrefix }, "Uploading HLS assets to R2");
    await uploadDir(hlsDir, outputPrefix);
    await job.updateProgress(95);

    const masterKey = `${outputPrefix}/master.m3u8`;

    // Point the consumer (streamer) at the new master playlist.
    if (contentType === "movie") {
      await prisma.movie.update({ where: { id: contentId }, data: { videoUrl: masterKey } });
    } else {
      await prisma.episode.update({ where: { id: contentId }, data: { videoUrl: masterKey } });
    }

    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", outputPrefix },
    });

    // Best-effort cleanup of the raw upload (storage cost saving). Failures here
    // don't fail the job — the video is already playable.
    await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: rawKey }))
      .catch((err) => logger.warn({ err, rawKey }, "Failed to delete raw upload"));

    await job.updateProgress(100);
    logger.info({ jobId }, "Video job completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, jobId }, "Video job failed");
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: message.slice(0, 1000) },
    });
    throw err; // let BullMQ record the failure and trigger retry/backoff
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const worker = new Worker<VideoJobPayload>(
  "video-transcode",
  async (job) => processJob(job.data, job),
  {
    connection: queueConnection,
    concurrency: 1, // FFmpeg is CPU-heavy; bump if you have spare cores
  },
);

worker.on("ready", () => logger.info("Video worker ready"));
worker.on("failed", (job, err) => logger.error({ err, jobId: job?.id }, "Worker job failed"));
worker.on("completed", (job) => logger.info({ jobId: job.id }, "Worker job completed"));

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Worker shutting down");
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
