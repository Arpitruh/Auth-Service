import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { Role } from '../schemas/auth.schema.js';

export interface AdminUserSummary {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
}

export const adminService = {
  /** Lists all users (Requirement 8.7). Admin-gated at the route layer. */
  async listUsers(): Promise<AdminUserSummary[]> {
    return prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Updates a user's role. The role value is already validated against the
   * allowed enum by the Zod layer. Logs the change (Requirement 10.1).
   */
  async updateRole(
    actorId: string,
    targetUserId: string,
    role: Role,
  ): Promise<AdminUserSummary> {
    const existing = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound('User not found.');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    logger.warn(
      { actorId, targetUserId, newRole: role, event: 'role_change' },
      'user role changed by admin',
    );
    return updated;
  },
};
