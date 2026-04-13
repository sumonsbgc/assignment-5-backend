import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "staging", "production"])
		.default("development"),
	PORT: z.string().default("5000").transform(Number),
	DATABASE_URL: z.string().url(),
	REDIS_URL: z.string().url(),
	JWT_ACCESS_SECRET: z.string().min(32),
	JWT_REFRESH_SECRET: z.string().min(32),
	JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
	JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
	CSRF_SECRET: z.string().min(32),
	R2_ACCOUNT_ID: z.string(),
	R2_ACCESS_KEY_ID: z.string(),
	R2_SECRET_ACCESS_KEY: z.string(),
	R2_BUCKET_NAME: z.string(),
	R2_PUBLIC_URL: z.string().url(),
	STRIPE_SECRET_KEY: z.string(),
	STRIPE_WEBHOOK_SECRET: z.string(),
	STRIPE_MONTHLY_PRICE_ID: z.string().optional(),
	STRIPE_ANNUAL_PRICE_ID: z.string().optional(),
	FRONTEND_URL: z.string().url().default("http://localhost:3000"),
	SENTRY_DSN: z.string().optional(),
	// Video upload pipeline
	VIDEO_MAX_BYTES: z.string().default(String(10 * 1024 * 1024 * 1024)).transform(Number), // 10 GiB
	VIDEO_TMP_DIR: z.string().default("/tmp/video-jobs"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error(
		"Invalid environment variables:",
		parsed.error.flatten().fieldErrors,
	);
	process.exit(1);
}

export const env = parsed.data;
