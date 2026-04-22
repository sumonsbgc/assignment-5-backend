import { Router } from "express";
import { ReviewController } from "./review.controller.js";
import { authenticate, optionalAuth } from "@middlewares/auth.js";
import { validate } from "@middlewares/validate.js";
import { reviewRateLimit } from "@middlewares/rate-limit.js";
import { createReviewSchema, updateReviewSchema } from "./review.schema.js";

const router = Router();
const ctrl = new ReviewController();

router.post("/", authenticate, reviewRateLimit, validate(createReviewSchema), ctrl.create);
router.patch("/:id", authenticate, ctrl.update);
router.delete("/:id", authenticate, ctrl.remove);
router.post("/:id/like", authenticate, ctrl.toggleLike);
router.get("/:id/comments", optionalAuth, ctrl.getComments);
router.post("/:id/comments", authenticate, ctrl.addComment);

export default router;
