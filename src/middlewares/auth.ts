import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "@utils/jwt.js";
import { AppError } from "@utils/app-error.js";

/**
 * Returns the bearer token from either the Authorization header or the
 * `access_token` cookie. The cookie pathway lets browser navigations
 * (where the client-side Bearer header might not be attached yet —
 * e.g. before the Zustand store hydrates) still carry credentials.
 */
function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.access_token;
  if (cookieToken) return cookieToken;
  return null;
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) {
    return next(new AppError("UNAUTHORIZED", "Authentication required", 401));
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    next(new AppError("UNAUTHORIZED", "Invalid or expired token", 401));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
