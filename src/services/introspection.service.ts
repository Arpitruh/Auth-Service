import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { denylist } from '../lib/store.js';

export type IntrospectionResult =
  | { active: false }
  | { active: true; sub: string; email: string; role: string; token_type: 'access_token'; exp: number; iat?: number };

/** RFC 7662-inspired (not full OAuth) server-only token introspection. */
export async function introspectAccessToken(token: string): Promise<IntrospectionResult> {
  let claims;
  try { claims = verifyAccessToken(token); }
  catch { return { active: false }; }
  if (await denylist.has(claims.jti)) return { active: false };
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, role: true },
  });
  if (!user) return { active: false };
  return {
    active: true, sub: user.id, email: user.email, role: user.role,
    token_type: 'access_token', exp: claims.exp!,
    ...(typeof claims.iat === 'number' ? { iat: claims.iat } : {}),
  };
}
