import { Request, Response, NextFunction } from "express";
import { AppError } from "@utils/app-error.js";

type Role = "USER" | "MODERATOR" | "ADMIN";

const ROLE_HIERARCHY: Record<Role, number> = {
  USER: 0,
  MODERATOR: 1,
  ADMIN: 2,
};

export function requireRole(minRole: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("UNAUTHORIZED", "Authentication required", 401));
    }
    const userLevel = ROLE_HIERARCHY[req.user.role as Role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole];
    if (userLevel < requiredLevel) {
      return next(new AppError("FORBIDDEN", "Insufficient permissions", 403));
    }
    next();
  };
}
