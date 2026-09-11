import type { Request, Response, NextFunction } from 'express';
export declare const passwordResetController: {
    /**
     * Always returns 200 regardless of whether the email exists, to avoid
     * leaking which addresses are registered. Delivery is stubbed: in
     * non-production we log the raw token so it can be used in manual testing;
     * a real deployment would send it via email and never log it.
     */
    forgot(req: Request, res: Response, next: NextFunction): Promise<void>;
    reset(req: Request, res: Response, next: NextFunction): Promise<void>;
};
//# sourceMappingURL=password-reset.controller.d.ts.map