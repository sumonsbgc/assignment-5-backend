import { Router } from "express";
import { GenreController } from "./genre.controller.js";
import { authenticate } from "@middlewares/auth.js";
import { requireRole } from "@middlewares/rbac.js";

const router = Router();
const ctrl = new GenreController();

router.get("/", ctrl.list);
router.post("/", authenticate, requireRole("ADMIN"), ctrl.create);
router.patch("/:id", authenticate, requireRole("ADMIN"), ctrl.update);
router.delete("/:id", authenticate, requireRole("ADMIN"), ctrl.remove);

export default router;
