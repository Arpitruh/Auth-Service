export interface AccessTokenPayload {
    sub: string;
    email: string;
    role: string;
    jti: string;
    iat?: number;
    exp?: number;
}
export interface RefreshTokenPayload {
    sub: string;
    jti: string;
    iat?: number;
    exp?: number;
}
/** Fields the caller supplies; jti is generated here. */
export type AccessTokenClaims = Omit<AccessTokenPayload, 'jti'>;
/**
 * Signs an access token, generating a unique `jti` claim so the token can be
 * individually revoked via the denylist on logout (Requirement 4.1).
 */
export declare function signAccessToken(claims: AccessTokenClaims): {
    token: string;
    jti: string;
};
export declare function signRefreshToken(payload: RefreshTokenPayload): string;
export declare function verifyAccessToken(token: string): AccessTokenPayload;
export declare function verifyRefreshToken(token: string): RefreshTokenPayload;
/**
 * Remaining lifetime of a decoded token in seconds (>= 0). Used to set the
 * denylist TTL so an entry expires exactly when the token would have.
 */
export declare function remainingTtlSeconds(payload: {
    exp?: number;
}): number;
//# sourceMappingURL=jwt.d.ts.map