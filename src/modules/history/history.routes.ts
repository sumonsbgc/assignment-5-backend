import { Router } from "express";
import { HistoryController } from "./history.controller.js";
import { authenticate } from "@middlewares/auth.js";

const router = Router();
const ctrl = new HistoryController();

router.get("/", authenticate, ctrl.list);
router.post("/progress", authenticate, ctrl.updateProgress);

export default router;
