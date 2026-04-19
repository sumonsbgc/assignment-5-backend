import { Router } from "express";
import { MovieController } from "./movie.controller.js";
import { authenticate, optionalAuth } from "@middlewares/auth.js";
import { requireRole } from "@middlewares/rbac.js";
import { validate } from "@middlewares/validate.js";
import {
	createMovieSchema,
	updateMovieSchema,
	movieQuerySchema,
} from "./movie.schema.js";

const router: Router = Router();
const ctrl = new MovieController();

router.get("/", validate(movieQuerySchema, "query"), ctrl.list);
// `/by-id/:id` precedes `/:slug` so numeric admin lookups don't collide
// with the slug router (slugs are non-numeric in practice).
router.get("/by-id/:id", optionalAuth, ctrl.getById);
router.get("/:slug", optionalAuth, ctrl.getBySlug);
router.get("/:id/reviews", ctrl.getReviews);

router.post(
	"/",
	authenticate,
	requireRole("ADMIN"),
	validate(createMovieSchema),
	ctrl.create,
);

router.patch(
	"/:id",
	authenticate,
	requireRole("ADMIN"),
	validate(updateMovieSchema),
	ctrl.update,
);
router.delete("/:id", authenticate, requireRole("ADMIN"), ctrl.remove);

export default router;
