import type { Request } from 'express';
/**
 * Reads a single route parameter as a string. Express 5 types params as
 * `string | string[]`; single-segment params are always strings at runtime,
 * so we normalize (taking the first element if an array somehow appears).
 */
export declare function param(req: Request, name: string): string;
//# sourceMappingURL=http.d.ts.map