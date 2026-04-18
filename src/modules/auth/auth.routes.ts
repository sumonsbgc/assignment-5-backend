import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authenticate } from "@middlewares/auth.js";
import { validate } from "@middlewares/validate.js";
import { authRateLimit, passwordResetRateLimit } from "@middlewares/rate-limit.js";
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "./auth.schema.js";

const router = Router();
const ctrl = new AuthController();

router.post("/register", authRateLimit, validate(registerSchema), ctrl.register);
router.post("/login", authRateLimit, validate(loginSchema), ctrl.login);
router.post("/refresh", ctrl.refresh);
router.post("/logout", authenticate, ctrl.logout);
router.post("/verify-email", ctrl.verifyEmail);
router.post("/forgot-password", passwordResetRateLimit, validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), ctrl.resetPassword);
router.get("/me", authenticate, ctrl.me);

export default router;
