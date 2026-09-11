import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.js';
import { updateRoleSchema } from '../schemas/auth.schema.js';
const router = Router();
// All admin routes require a valid access token AND the ADMIN role.
router.use(requireAuth, requireRole('ADMIN'));
router.get('/users', adminController.listUsers);
router.patch('/users/:id/role', validate(updateRoleSchema), adminController.updateRole);
export const adminRoutes = router;
//# sourceMappingURL=admin.routes.js.map