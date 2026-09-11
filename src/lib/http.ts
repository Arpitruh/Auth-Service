import type { Request } from 'express';

/**
 * Reads a single route parameter as a string. Express 5 types params as
 * `string | string[]`; single-segment params are always strings at runtime,
 * so we normalize (taking the first element if an array somehow appears).
 */
export function param(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[
    name
  ];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
