import type { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/session.service.js';
import { param } from '../lib/http.js';

export const sessionController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!; // requireAuth guarantees presence
      const sessions = await sessionService.list(user.id, user.jti);
      res.status(200).json({ sessions });
    } catch (err) {
      next(err);
    }
  },

  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      await sessionService.revoke(user.id, param(req, 'id'));
      res.status(200).json({ message: 'Session revoked.' });
    } catch (err) {
      next(err);
    }
  },
};
