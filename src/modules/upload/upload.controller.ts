import { Request, Response, NextFunction } from "express";
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { r2 } from "@lib/r2.js";
import { env } from "@lib/env.js";
import { prisma } from "@lib/database.js";
import { videoQueue } from "@lib/queue.js";
import { logger } from "@utils/logger.js";
import { AppError } from "@utils/app-error.js";
import { paramInt } from "@utils/query.js";

// Each part must be >= 5 MiB (S3/R2 multipart requirement, except the last)
// and <= 5 GiB. We let the client choose part size and just bound the count.
const MAX_PARTS = 10_000;

const initSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(["movie", "episode"]),
  contentId: z.number().int().positive(),
  fileSize: z.number().int().positive(),
  mimeType: z.string().regex(/^video\//, "Only video/* mime types allowed"),
  partCount: z.number().int().min(1).max(MAX_PARTS),
});

const completeSchema = z.object({
  uploadId: z.string().min(1),
  key: z.string().min(1),
  contentType: z.enum(["movie", "episode"]),
  contentId: z.number().int().positive(),
  parts: z.array(z.object({
    PartNumber: z.number().int().min(1),
    ETag: z.string().min(1),
  })).min(1).max(MAX_PARTS),
});

const abortSchema = z.object({
  uploadId: z.string().min(1),
  key: z.string().min(1),
});

export class UploadController {
  // Step 1: initiate multipart upload. Returns:
  //   - uploadId   (R2 multipart ID)
  //   - key        (target object key in R2)
  //   - urls       (presigned PUT URL per part — browser uploads directly to R2)
  initUpload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = initSchema.parse(req.body);

      if (body.fileSize > env.VIDEO_MAX_BYTES) {
        throw new AppError("PAYLOAD_TOO_LARGE", `File exceeds ${env.VIDEO_MAX_BYTES} bytes`, 413);
      }

      if (body.contentType === "movie") {
        const m = await prisma.movie.findUnique({ where: { id: body.contentId } });
        if (!m) throw new AppError("NOT_FOUND", "Movie not found", 404);
      } else {
        const e = await prisma.episode.findUnique({ where: { id: body.contentId } });
        if (!e) throw new AppError("NOT_FOUND", "Episode not found", 404);
      }

      const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `videos/raw/${body.contentType}-${body.contentId}-${Date.now()}-${safeName}`;

      const created = await r2.send(new CreateMultipartUploadCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        ContentType: body.mimeType,
      }));
      if (!created.UploadId) throw new AppError("INTERNAL_ERROR", "Failed to start multipart upload", 500);

      const urls = await Promise.all(
        Array.from({ length: body.partCount }, async (_, i) => {
          const cmd = new UploadPartCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
            UploadId: created.UploadId!,
            PartNumber: i + 1,
          });
          return getSignedUrl(r2, cmd, { expiresIn: 3600 });
        }),
      );

      res.json({ uploadId: created.UploadId, key, urls });
    } catch (err) { next(err); }
  };

  // Step 2: client posts the ETags returned by each part PUT response.
  // We finalize the multipart upload, create a VideoJob row, and enqueue transcoding.
  completeUpload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = completeSchema.parse(req.body);

      await r2.send(new CompleteMultipartUploadCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: body.key,
        UploadId: body.uploadId,
        MultipartUpload: {
          Parts: body.parts.sort((a, b) => a.PartNumber - b.PartNumber),
        },
      }));

      const job = await prisma.videoJob.create({
        data: {
          contentType: body.contentType,
          contentId: body.contentId,
          status: "QUEUED",
          rawKey: body.key,
        },
      });

      await videoQueue.add(
        "transcode",
        { jobId: job.id, rawKey: body.key, contentType: body.contentType, contentId: body.contentId },
        { jobId: `video-${job.id}` },
      );

      logger.info({ jobId: job.id, key: body.key }, "Video transcode job queued");
      res.json({ jobId: job.id, status: "QUEUED" });
    } catch (err) { next(err); }
  };

  abortUpload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = abortSchema.parse(req.body);
      await r2.send(new AbortMultipartUploadCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: body.key,
        UploadId: body.uploadId,
      }));
      res.json({ aborted: true });
    } catch (err) { next(err); }
  };

  getJobStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await prisma.videoJob.findUnique({ where: { id: paramInt(req.params.jobId ?? "") } });
      if (!job) throw new AppError("NOT_FOUND", "Job not found", 404);
      res.json({ data: job });
    } catch (err) { next(err); }
  };
}
