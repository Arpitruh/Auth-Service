import type { Request, Response, NextFunction } from 'express';
import { passwordResetService } from '../services/password-reset.service.js';
import { ENV } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sendPasswordResetEmail } from '../lib/notification-client.js';

export const passwordResetController = {
  /**
   * Always returns 200 regardless of whether the email exists, to avoid
   * leaking which addresses are registered. Delivery is stubbed: in
   * non-production we log the raw token so it can be used in manual testing;
   * a real deployment would send it via email and never log it.
   */
  async forgot(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body as { email: string };
      const rawToken = await passwordResetService.requestReset(email);

      if (rawToken) {
        if (ENV.NOTIFICATION_SERVICE_URL && ENV.NOTIFICATION_API_KEY) {
          try {
            await sendPasswordResetEmail(email, rawToken);
          } catch (err) {
            // Do not leak whether the email exists or whether the provider failed.
            logger.error({ err, event: 'password_reset_delivery_failed' }, 'password reset dispatch failed');
          }
        } else if (!ENV.IS_PRODUCTION) {
          logger.info({
            event: 'forgot_password_dev_token',
            devResetLink: `${ENV.PASSWORD_RESET_BASE_URL ?? ENV.CLIENT_ORIGIN}/reset-password?token=${rawToken}`,
          }, 'DEV ONLY: password reset link');
        } else {
          logger.error({ event: 'password_reset_delivery_unconfigured' }, 'password reset delivery is not configured');
        }
      }

      res.status(200).json({
        message:
          'If an account exists for that email, a reset link has been sent.',
      });
    } catch (err) {
      next(err);
    }
  },

  async reset(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = req.body as { token: string; password: string };
      await passwordResetService.resetPassword(token, password);
      res.status(200).json({
        message: 'Password updated. Please log in again.',
      });
    } catch (err) {
      next(err);
    }
  },
};
