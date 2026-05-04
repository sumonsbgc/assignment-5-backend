import { Router } from "express";
import { AdminController } from "./admin.controller.js";
import { authenticate } from "@middlewares/auth.js";
import { requireRole } from "@middlewares/rbac.js";
import { UploadController } from "@modules/upload/upload.controller.js";

const router = Router();
const adminCtrl = new AdminController();
const uploadCtrl = new UploadController();

router.use(authenticate, requireRole("MODERATOR"));

router.get("/stats", requireRole("ADMIN"), adminCtrl.getStats);
router.get("/reviews", adminCtrl.getPendingReviews);
router.patch("/reviews/:id/status", adminCtrl.updateReviewStatus);
router.get("/reports", adminCtrl.getReports);
router.patch("/reports/:id", adminCtrl.resolveReport);
router.get("/sales", requireRole("ADMIN"), adminCtrl.getSalesReport);

// User management — ADMIN-only. MODERATOR can review content but
// can't change roles.
router.get("/subscribers", requireRole("ADMIN"), adminCtrl.listSubscribers);
router.get("/users", requireRole("ADMIN"), adminCtrl.listUsers);
router.patch("/users/:id/role", requireRole("ADMIN"), adminCtrl.updateUserRole);
router.delete("/users/:id", requireRole("ADMIN"), adminCtrl.deleteUser);
router.post("/upload/video/init", requireRole("ADMIN"), uploadCtrl.initUpload);
router.post("/upload/video/complete", requireRole("ADMIN"), uploadCtrl.completeUpload);
router.post("/upload/video/abort", requireRole("ADMIN"), uploadCtrl.abortUpload);
router.get("/upload/:jobId/status", requireRole("ADMIN"), uploadCtrl.getJobStatus);

export default router;
