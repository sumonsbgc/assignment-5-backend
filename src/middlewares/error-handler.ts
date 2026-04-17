import { Request, Response, NextFunction } from "express";
import { AppError } from "@utils/app-error.js";
import { logger } from "@utils/logger.js";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const correlationId = req.headers["x-request-id"] as string;

  if (err instanceof AppError) {
    logger.warn({ correlationId, code: err.code, statusCode: err.statusCode }, err.message);
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? [],
      },
    });
  }

  logger.error({ correlationId, err }, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      details: [],
    },
  });
}
