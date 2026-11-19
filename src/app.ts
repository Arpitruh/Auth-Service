import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { ENV } from './config/env.js';
import { requestId } from './middlewares/request-id.js';
import { httpLogger } from './middlewares/http-logger.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { authRoutes } from './routes/auth.routes.js';
import { tenantRoutes } from './tenant/routes.js';
import { oidcRoutes } from './oidc/routes.js';
import { dashboardRoutes } from './dashboard/routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { openapiSpec } from './docs/openapi.js';
import { parseAllowedOrigins } from './lib/origins.js';

/**
 * Builds the Express application without binding a port, so it can be reused by
 * the server entrypoint (server.ts) and by Supertest integration tests.
 */
export function createApp() {
  const app = express();

  // Trust the proxy so req.ip reflects the client behind a load balancer.
  app.set('trust proxy', 1);

  // Tracing + logging first so every request (including errors) is covered.
  app.use(requestId);
  app.use(httpLogger);

  app.use(express.json());
  app.use(cookieParser());
  const allowedOrigins = parseAllowedOrigins(ENV.CLIENT_ORIGINS || ENV.CLIENT_ORIGIN);
  app.use(cors({ origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  }, credentials: true }));

  // Health/readiness (no version prefix, for load balancers).
  app.use(healthRoutes);

  // API docs.
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  // API v1.
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/admin', adminRoutes);
  // Backend-only, per-app identity endpoints; existing v1 flows unchanged.
  app.use('/api/v2/tenant', tenantRoutes);
  // Opt-in hosted OpenID Connect endpoints; no legacy auth behavior change.
  app.use(oidcRoutes);
  app.use('/dashboard',dashboardRoutes);

  // Route visitors through the dashboard's existing session check.
  // Authenticated operators see the dashboard; others reach its login page.
  app.get('/', (_req, res) => {
    res.redirect(302, '/dashboard');
  });

  // 404 for anything unmatched, then the centralized error handler last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
