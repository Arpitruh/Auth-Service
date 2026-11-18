import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { introspectionController } from '../controllers/introspection.controller.js';
import { requireServiceKey } from '../middlewares/service-auth.middleware.js';
import { sessionController } from '../controllers/session.controller.js';
import { passwordResetController } from '../controllers/password-reset.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  introspectionSchema,
} from '../schemas/auth.schema.js';
import { loginRateLimiter, registerRateLimiter } from '../middlewares/rate-limit.js';

const router = Router();

// Public endpoints
router.post(
  '/register',
  registerRateLimiter,
  validate(registerSchema),
  authController.register,
);
router.post(
  '/login',
  loginRateLimiter,
  validate(loginSchema),
  authController.login,
);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Server-side consumers verify access tokens without sharing the signing secret.
router.post('/introspect', requireServiceKey, validate(introspectionSchema), introspectionController.introspect);

// Password reset (public; forgot is rate-limited + always 200)
router.post(
  '/forgot-password',
  registerRateLimiter,
  validate(forgotPasswordSchema),
  passwordResetController.forgot,
);
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  passwordResetController.reset,
);

// Protected endpoints
router.get('/me', requireAuth, authController.me);
router.get('/sessions', requireAuth, sessionController.list);
router.delete('/sessions/:id', requireAuth, sessionController.revoke);

export const authRoutes = router;
