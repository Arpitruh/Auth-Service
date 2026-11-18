import type { NextFunction, Request, Response } from 'express';
import { introspectAccessToken } from '../services/introspection.service.js';

export const introspectionController = {
  async introspect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(await introspectAccessToken((req.body as { token: string }).token));
    } catch (error) { next(error); }
  },
};
