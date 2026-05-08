import { Request, Response, NextFunction } from "express";
import { prisma } from "@lib/database.js";
import { hashPassword, verifyPassword } from "@utils/hash.js";
import { AppError } from "@utils/app-error.js";

export class UserController {
  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, avatarUrl } = req.body as { name?: string; avatarUrl?: string };
      const user = await prisma.user.update({
        where: { id: req.user!.userId },
        data: { name, avatarUrl } as Parameters<typeof prisma.user.update>[0]["data"],
        select: { id: true, name: true, email: true, avatarUrl: true, role: true },
      });
      res.json(user);
    } catch (err) { next(err); }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
      const valid = await verifyPassword(user.password, currentPassword);
      if (!valid) throw new AppError("UNAUTHORIZED", "Current password is incorrect", 401);
      const hashed = await hashPassword(newPassword);
      await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      res.json({ success: true });
    } catch (err) { next(err); }
  };
}
