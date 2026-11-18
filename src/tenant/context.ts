import type { NextFunction, Request, Response } from 'express';
import { verifyApplicationKey, type VerifiedTenant } from './client-credentials.js';

/** Never route a database using the browser-supplied public client ID by itself.
 * This middleware is only for server-to-server callers (BFFs). It must not use
 * any browser-shared client key, nor accept callback redirects as proof.
 */
export async function requireVerifiedTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clientId = req.header('x-auth-client-id');
  const clientKey = req.header('x-auth-client-key');
  res.setHeader('Cache-Control', 'no-store');
  if (!clientId || !clientKey) {
    res.status(401).json({ error: 'Trusted application credentials required' });
    return;
  }
  try {
    const verified = await verifyApplicationKey(clientId, clientKey);
    if (!verified) {
      res.status(401).json({ error: 'Invalid application credentials or inactive application' });
      return;
    }
    res.locals.tenant = verified satisfies VerifiedTenant;
    next();
  } catch {
    res.status(503).json({ error: 'Application registry unavailable' });
  }
}
