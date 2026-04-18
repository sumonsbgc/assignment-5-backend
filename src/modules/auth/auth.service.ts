import { prisma } from "@lib/database.js";
import { hashPassword, verifyPassword } from "@utils/hash.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@utils/jwt.js";
import { AppError } from "@utils/app-error.js";
import { v4 as uuidv4 } from "uuid";
import type { RegisterInput, LoginInput } from "./auth.schema.js";

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new AppError("CONFLICT", "Email already registered", 409);

    const password = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, password },
      select: { id: true, name: true, email: true, role: true },
    });
    return { user };
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new AppError("UNAUTHORIZED", "Invalid credentials", 401);

    const valid = await verifyPassword(user.password, input.password);
    if (!valid) throw new AppError("UNAUTHORIZED", "Invalid credentials", 401);

    const accessToken = signAccessToken({ userId: user.id, role: user.role, email: user.email });
    const refreshToken = signRefreshToken(user.id);
    const hashedToken = await hashPassword(refreshToken);

    await prisma.refreshToken.create({
      data: {
        token: hashedToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new AppError("UNAUTHORIZED", "Refresh token required", 401);

    let payload: { userId: number };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError("UNAUTHORIZED", "Invalid refresh token", 401);
    }

    const tokens = await prisma.refreshToken.findMany({
      where: { userId: payload.userId, revokedAt: null },
    });

    let matchedToken = null;
    for (const t of tokens) {
      const match = await verifyPassword(t.token, refreshToken).catch(() => false);
      if (match) { matchedToken = t; break; }
    }

    if (!matchedToken) {
      // Token reuse detected — revoke all tokens
      await prisma.refreshToken.updateMany({
        where: { userId: payload.userId },
        data: { revokedAt: new Date() },
      });
      throw new AppError("UNAUTHORIZED", "Refresh token reuse detected", 401);
    }

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { revokedAt: new Date() },
    });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new AppError("UNAUTHORIZED", "User not found", 401);

    const newAccessToken = signAccessToken({ userId: user.id, role: user.role, email: user.email });
    const newRefreshToken = signRefreshToken(user.id);
    const hashedNewToken = await hashPassword(newRefreshToken);

    await prisma.refreshToken.create({
      data: {
        token: hashedNewToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: number, refreshToken: string) {
    if (!refreshToken) return;
    const tokens = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });
    for (const t of tokens) {
      const match = await verifyPassword(t.token, refreshToken).catch(() => false);
      if (match) {
        await prisma.refreshToken.update({
          where: { id: t.id },
          data: { revokedAt: new Date() },
        });
        break;
      }
    }
  }

  async verifyEmail(_token: string) {
    // Email verification implementation
    return true;
  }

  async forgotPassword(_email: string) {
    // Send password reset email
    return true;
  }

  async resetPassword(_token: string, _password: string) {
    // Reset password implementation
    return true;
  }

  async getMe(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, emailVerified: true, avatarUrl: true, createdAt: true },
    });
    if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
    return user;
  }
}
