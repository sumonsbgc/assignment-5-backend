import { Router } from "express";
import { SeriesController } from "./series.controller.js";
import { authenticate, optionalAuth } from "@middlewares/auth.js";
import { requireRole } from "@middlewares/rbac.js";
import { validate } from "@middlewares/validate.js";
import { createSeriesSchema, updateSeriesSchema, seriesQuerySchema, createSeasonSchema, createEpisodeSchema } from "./series.schema.js";

const router = Router();
const ctrl = new SeriesController();

router.get("/", validate(seriesQuerySchema, "query"), ctrl.list);
router.get("/by-id/:id", optionalAuth, ctrl.getById);
router.get("/:slug", optionalAuth, ctrl.getBySlug);
router.get("/:id/reviews", ctrl.getReviews);
router.post("/", authenticate, requireRole("ADMIN"), validate(createSeriesSchema), ctrl.create);
router.patch("/:id", authenticate, requireRole("ADMIN"), validate(updateSeriesSchema), ctrl.update);
router.delete("/:id", authenticate, requireRole("ADMIN"), ctrl.remove);
router.post("/:id/seasons", authenticate, requireRole("ADMIN"), validate(createSeasonSchema), ctrl.addSeason);

export default router;
