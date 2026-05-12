import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { env } from "@lib/env.js";
import { logger } from "@utils/logger.js";
import { requestId } from "@middlewares/request-id.js";
import { errorHandler } from "@middlewares/error-handler.js";
import { generalRateLimit } from "@middlewares/rate-limit.js";
import v1Routes from "@lib/router.js";

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      mediaSrc: ["'self'", env.R2_PUBLIC_URL],
      imgSrc: ["'self'", "data:", env.R2_PUBLIC_URL],
      frameSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// CORS
app.use(cors({
  origin: [env.FRONTEND_URL, "http://localhost:3000", "http://localhost:3001"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-CSRF-Token"],
}));

// Request logging
app.use(pinoHttp({ logger }));

// Request ID
app.use(requestId);

// Body parsing — must be before Stripe webhook route which needs raw body
app.use("/api/v1/webhooks/stripe", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use("/api/v1", generalRateLimit);

// Routes
app.use("/api/v1", v1Routes);

// Error handler (must be last)
app.use(errorHandler);

const PORT = env.PORT;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${env.NODE_ENV} mode`);
});

export default app;
