import { Router } from "express";
import { CheckoutController } from "./checkout.controller.js";
import { authenticate } from "@middlewares/auth.js";

const router = Router();
const ctrl = new CheckoutController();

router.post("/intent", authenticate, ctrl.createIntent);
router.post("/sync", authenticate, ctrl.syncFromStripe);
router.post("/subscription", authenticate, ctrl.createSubscription);
router.post("/purchase", authenticate, ctrl.createPurchase);
router.get("/subscription/me", authenticate, ctrl.getMySubscription);
router.post("/subscription/cancel", authenticate, ctrl.cancelSubscription);
router.post("/portal", authenticate, ctrl.createPortalSession);
router.get("/purchases/me", authenticate, ctrl.getMyPurchases);

export default router;
