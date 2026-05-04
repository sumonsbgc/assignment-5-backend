import { Request, Response, NextFunction } from "express";
import { AdminService } from "./admin.service.js";
import { flattenQuery, paramInt } from "@utils/query.js";

const adminService = new AdminService();

export class AdminController {
	getStats = async (_req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(await adminService.getStats());
		} catch (err) {
			next(err);
		}
	};
	getPendingReviews = async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			res.json(await adminService.getPendingReviews(flattenQuery(req.query)));
		} catch (err) {
			next(err);
		}
	};
	updateReviewStatus = async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			const { status } = req.body as { status: "APPROVED" | "REJECTED" };
			res.json(
				await adminService.updateReviewStatus(paramInt(req.params.id), status),
			);
		} catch (err) {
			next(err);
		}
	};
	getReports = async (req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(await adminService.getReports(flattenQuery(req.query)));
		} catch (err) {
			next(err);
		}
	};
	resolveReport = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { status } = req.body as { status: "RESOLVED" | "DISMISSED" };
			res.json(
				await adminService.resolveReport(paramInt(req.params.id), status),
			);
		} catch (err) {
			next(err);
		}
	};
	getSalesReport = async (req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(await adminService.getSalesReport(flattenQuery(req.query)));
		} catch (err) {
			next(err);
		}
	};

	listSubscribers = async (req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(await adminService.listSubscribers(flattenQuery(req.query)));
		} catch (err) {
			next(err);
		}
	};

	listUsers = async (req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(await adminService.listUsers(flattenQuery(req.query)));
		} catch (err) {
			next(err);
		}
	};

	updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { role } = req.body as { role: "USER" | "MODERATOR" | "ADMIN" };
			res.json(
				await adminService.updateUserRole(
					paramInt(req.params.id),
					role,
					req.user!.userId,
				),
			);
		} catch (err) {
			next(err);
		}
	};

	deleteUser = async (req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(
				await adminService.deleteUser(paramInt(req.params.id), req.user!.userId),
			);
		} catch (err) {
			next(err);
		}
	};
}
