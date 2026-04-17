import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { AppError } from "@utils/app-error.js";

export function validate(schema: ZodSchema, target: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      return next(new AppError("VALIDATION_ERROR", "Validation failed", 400, details));
    }
    Object.defineProperty(req, target, { value: result.data, writable: true, configurable: true });
    next();
  };
}
