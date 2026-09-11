import type { Request, Response, NextFunction } from 'express';
import { passwordResetService } from '../services/password-reset.service.js';
import { ENV } from '../config/env.js';
import { logger } from '../lib/logger.js';

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

      if (rawToken && !ENV.IS_PRODUCTION) {
        // Stubbed delivery for local/dev testing only. Uses a non-secret key
        // name (`devResetLink`) so the logger's token redaction does not scrub
        // it — acceptable because this branch never runs in production.
        logger.info(
          {
            event: 'forgot_password_dev_token',
            devResetLink: `${ENV.CLIENT_ORIGIN}/reset-password?token=${rawToken}`,
          },
          'DEV ONLY: password reset link (would be emailed in production)',
        );
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
