import 'dotenv/config';
export declare const ENV: {
    readonly NODE_ENV: string;
    readonly PORT: number;
    readonly DATABASE_URL: string;
    readonly JWT_ACCESS_SECRET: string;
    readonly JWT_REFRESH_SECRET: string;
    readonly JWT_ACCESS_SECRET_PREVIOUS?: string | undefined;
    readonly JWT_REFRESH_SECRET_PREVIOUS?: string | undefined;
    readonly ACCESS_TOKEN_TTL: string;
    readonly REFRESH_TOKEN_TTL: string;
    readonly CLIENT_ORIGIN: string;
    readonly REFRESH_COOKIE_NAME: string;
    readonly REDIS_URL?: string | undefined;
    readonly PASSWORD_MIN_LENGTH: number;
    readonly PASSWORD_REQUIRE_NUMBER: boolean;
    readonly PASSWORD_REQUIRE_SYMBOL: boolean;
    readonly RATE_LIMIT_MAX: number;
    readonly RATE_LIMIT_WINDOW_MINUTES: number;
    readonly LOCKOUT_THRESHOLD: number;
    readonly LOCKOUT_WINDOW_MINUTES: number;
    readonly RESET_TOKEN_TTL_MINUTES: number;
    readonly DB_POOL_SIZE: number;
    readonly LOG_LEVEL: "debug" | "error" | "fatal" | "info" | "silent" | "trace" | "warn";
    readonly IS_PRODUCTION: boolean;
};
export declare const REFRESH_TOKEN_TTL_DAYS = 7;
//# sourceMappingURL=env.d.ts.map