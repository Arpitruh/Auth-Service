export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}
export interface PublicUser {
    id: string;
    email: string;
    role: string;
}
/** Optional request metadata captured at token issuance. */
export interface IssueContext {
    device?: string | undefined;
    ip?: string | undefined;
}
export declare const authService: {
    register(email: string, password: string, ctx?: IssueContext): Promise<{
        user: PublicUser;
        tokens: AuthTokens;
    }>;
    login(email: string, password: string, ctx?: IssueContext): Promise<{
        user: PublicUser;
        tokens: AuthTokens;
    }>;
    /**
     * Rotates a refresh token with reuse detection (Requirements 2 & 3).
     *
     * The presented token is hashed and matched against its DB row (by jti). If
     * the row is missing, already revoked, or the hash does not match, this is a
     * reuse/compromise signal: the ENTIRE token family for that user is revoked
     * and the attempt is rejected. Otherwise the row is marked revoked and a new
     * pair is issued.
     */
    refresh(presentedToken: string | undefined, ctx?: IssueContext): Promise<{
        user: PublicUser;
        tokens: AuthTokens;
    }>;
    /**
     * Logout: revokes the presented refresh token's row and adds the presented
     * access token's jti to the denylist so it cannot be used for its remaining
     * lifetime (Requirement 4).
     */
    logout(refreshTokenValue: string | undefined, accessTokenValue: string | undefined): Promise<void>;
};
//# sourceMappingURL=auth.service.d.ts.map