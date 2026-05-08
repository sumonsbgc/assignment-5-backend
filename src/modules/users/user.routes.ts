import { Router } from "express";
import { UserController } from "./user.controller.js";
import { authenticate } from "@middlewares/auth.js";

const router = Router();
const ctrl = new UserController();

router.patch("/me", authenticate, ctrl.updateProfile);
router.patch("/me/password", authenticate, ctrl.changePassword);

export default router;
