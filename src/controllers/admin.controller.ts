import type { Request, Response, NextFunction } from 'express';
import { adminService } from '../services/admin.service.js';
import { param } from '../lib/http.js';
import type { Role } from '../schemas/auth.schema.js';

export const adminController = {
  async listUsers(_req: Request, res: Response, next: NextFunction) {
    try {
      const users = await adminService.listUsers();
      res.status(200).json({ users });
    } catch (err) {
      next(err);
    }
  },

  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = req.user!;
      const { role } = req.body as { role: Role };
      const user = await adminService.updateRole(
        actor.id,
        param(req, 'id'),
        role,
      );
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
};
