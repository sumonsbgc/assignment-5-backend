import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service.js";
import { env } from "@lib/env.js";

const authService = new AuthService();

export class AuthController {
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (err) { next(err); }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { accessToken, refreshToken, user } = await authService.login(req.body);
      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/api/v1/auth/refresh",
      });
      res.json({ accessToken, user });
    } catch (err) { next(err); }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refresh_token as string;
      const result = await authService.refresh(refreshToken);
      res.cookie("refresh_token", result.refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/api/v1/auth/refresh",
      });
      res.json({ accessToken: result.accessToken });
    } catch (err) { next(err); }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refresh_token as string;
      await authService.logout(req.user!.userId, refreshToken);
      res.clearCookie("refresh_token", { path: "/api/v1/auth/refresh" });
      res.json({ success: true });
    } catch (err) { next(err); }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.verifyEmail(req.body.token as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.forgotPassword(req.body.email as string);
      res.json({ success: true, message: "If that email exists, a reset link was sent" });
    } catch (err) { next(err); }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.resetPassword(req.body.token as string, req.body.password as string);
      res.json({ success: true });
    } catch (err) { next(err); }
  };

  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getMe(req.user!.userId);
      res.json(user);
    } catch (err) { next(err); }
  };
}
