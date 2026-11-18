import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ENV } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';

/** Multiple independent backend credentials permit zero-downtime key rotation. */
export function parseServiceKeys(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const keys = raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (keys.some((key) => key.length < 32) || new Set(keys).size !== keys.length) {
    throw new Error('INTROSPECTION_API_KEYS must be unique keys of at least 32 characters.');
  }
  return keys;
}

export function validServiceKey(candidate: unknown, keys: readonly string[]): boolean {
  if (typeof candidate !== 'string' || candidate.length > 1024 || !keys.length) return false;
  const given = createHash('sha256').update(candidate).digest();
  let valid = 0;
  for (const key of keys) {
    const expected = createHash('sha256').update(key).digest();
    valid |= Number(timingSafeEqual(given, expected));
  }
  return valid !== 0;
}

const serviceKeys = parseServiceKeys(ENV.INTROSPECTION_API_KEYS);

export function requireServiceKey(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  if (!serviceKeys.length) {
    res.status(503).json({ error: { code: 'UNAVAILABLE', message: 'Introspection is not configured.', requestId: req.id } });
    return;
  }
  if (!validServiceKey(req.header('x-auth-service-key'), serviceKeys)) {
    next(unauthorized('Invalid service credentials.'));
    return;
  }
  next();
}
