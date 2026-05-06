import { Router } from "express";
import { ReportController } from "./report.controller.js";
import { authenticate } from "@middlewares/auth.js";
import { validate } from "@middlewares/validate.js";
import { createReportSchema } from "./report.schema.js";

const router = Router();
const ctrl = new ReportController();

router.post("/", authenticate, validate(createReportSchema), ctrl.create);

export default router;
