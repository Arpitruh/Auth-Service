import { adminService } from '../services/admin.service.js';
import { param } from '../lib/http.js';
export const adminController = {
    async listUsers(_req, res, next) {
        try {
            const users = await adminService.listUsers();
            res.status(200).json({ users });
        }
        catch (err) {
            next(err);
        }
    },
    async updateRole(req, res, next) {
        try {
            const actor = req.user;
            const { role } = req.body;
            const user = await adminService.updateRole(actor.id, param(req, 'id'), role);
            res.status(200).json({ user });
        }
        catch (err) {
            next(err);
        }
    },
};
//# sourceMappingURL=admin.controller.js.map