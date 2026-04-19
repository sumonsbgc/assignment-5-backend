import { Request, Response, NextFunction } from "express";
import { MovieService } from "./movie.service.js";
import { ReviewService } from "@modules/reviews/review.service.js";
import { flattenQuery, paramInt, paramStr } from "@utils/query.js";

const movieService = new MovieService();
const reviewService = new ReviewService();

export class MovieController {
	list = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const result = await movieService.list(flattenQuery(req.query));
			res.json(result);
		} catch (err) {
			next(err);
		}
	};

	getBySlug = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const movie = await movieService.getBySlug(paramStr(req.params.slug));
			res.json(movie);
		} catch (err) {
			next(err);
		}
	};

	getById = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const movie = await movieService.getById(parseInt(req.params.id ?? "0"));
			res.json(movie);
		} catch (err) {
			next(err);
		}
	};

	create = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const movie = await movieService.create(req.body);
			res.status(201).json(movie);
		} catch (err) {
			next(err);
		}
	};

	update = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const movie = await movieService.update(
				paramInt(req.params.id),
				req.body,
			);
			res.json(movie);
		} catch (err) {
			next(err);
		}
	};

	remove = async (req: Request, res: Response, next: NextFunction) => {
		try {
			await movieService.remove(paramInt(req.params.id));
			res.json({ success: true });
		} catch (err) {
			next(err);
		}
	};

	getReviews = async (req: Request, res: Response, next: NextFunction) => {
		try {
			const cursor = req.query.cursor
				? parseInt(req.query.cursor as string)
				: undefined;
			const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
			res.json(
				await reviewService.listByMovie(paramInt(req.params.id), cursor, limit),
			);
		} catch (err) {
			next(err);
		}
	};
}
