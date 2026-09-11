import type { Role } from '../schemas/auth.schema.js';
export interface AdminUserSummary {
    id: string;
    email: string;
    role: string;
    createdAt: Date;
}
export declare const adminService: {
    /** Lists all users (Requirement 8.7). Admin-gated at the route layer. */
    listUsers(): Promise<AdminUserSummary[]>;
    /**
     * Updates a user's role. The role value is already validated against the
     * allowed enum by the Zod layer. Logs the change (Requirement 10.1).
     */
    updateRole(actorId: string, targetUserId: string, role: Role): Promise<AdminUserSummary>;
};
//# sourceMappingURL=admin.service.d.ts.map