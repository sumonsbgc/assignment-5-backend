import { Router } from "express";
import { StreamController } from "./stream.controller.js";
import { authenticate, optionalAuth } from "@middlewares/auth.js";
import { streamingRateLimit } from "@middlewares/rate-limit.js";

const router = Router();
const ctrl = new StreamController();

router.get("/:contentType/:id/info", optionalAuth, ctrl.getStreamInfo);
router.get("/:contentType/:id/manifest", optionalAuth, streamingRateLimit, ctrl.getManifest);
router.get("/key/:keyId", authenticate, ctrl.getDecryptionKey);

export default router;
