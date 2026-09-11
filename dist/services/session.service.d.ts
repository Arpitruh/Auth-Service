export interface SessionSummary {
    id: string;
    createdAt: Date;
    expiresAt: Date;
    device: string | null;
    ip: string | null;
    current: boolean;
}
export declare const sessionService: {
    /**
     * Lists the user's active (non-revoked, unexpired) sessions. `currentJti`
     * flags the session backing the request, so a UI can label "this device".
     */
    list(userId: string, currentJti?: string): Promise<SessionSummary[]>;
    /**
     * Revokes one session by id, but only if it belongs to the requesting user
     * (Requirement 8.4). Ownership is enforced in the WHERE clause so a user can
     * never revoke another user's session, and a non-owned/absent id yields 404
     * (indistinguishable from "not yours").
     */
    revoke(userId: string, sessionId: string): Promise<void>;
};
//# sourceMappingURL=session.service.d.ts.map