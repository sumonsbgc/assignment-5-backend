import { Router } from "express";
import { WebhookController } from "./webhook.controller.js";

const router = Router();
const ctrl = new WebhookController();

// Raw body required for Stripe signature verification
router.post("/stripe", ctrl.handleStripe);

export default router;
