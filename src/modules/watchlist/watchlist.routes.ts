import { Router } from "express";
import { WatchlistController } from "./watchlist.controller.js";
import { authenticate } from "@middlewares/auth.js";

const router = Router();
const ctrl = new WatchlistController();

router.get("/", authenticate, ctrl.list);
router.post("/", authenticate, ctrl.add);
router.delete("/:id", authenticate, ctrl.remove);

export default router;
