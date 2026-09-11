import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  updateRoleSchema,
} from '../../src/schemas/auth.schema.js';

describe('registerSchema', () => {
  it('normalizes email to trimmed lowercase', () => {
    const parsed = registerSchema.parse({
      email: '  User@Example.COM ',
      password: 'abcdef1!',
    });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects a password below the minimum length', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.com',
      password: 'a1!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password with no number when required', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.com',
      password: 'abcdefgh!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password with no symbol when required', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.com',
      password: 'abcdefg1',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a compliant password', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.com',
      password: 'abcdefg1!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'abcdefg1!',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('does not enforce the password policy, only presence', () => {
    // A short legacy password must still be accepted for login.
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'x' });
    expect(result.success).toBe(true);
  });
});

describe('updateRoleSchema', () => {
  it('accepts allowed roles', () => {
    expect(updateRoleSchema.safeParse({ role: 'ADMIN' }).success).toBe(true);
    expect(updateRoleSchema.safeParse({ role: 'USER' }).success).toBe(true);
  });

  it('rejects unknown roles', () => {
    expect(updateRoleSchema.safeParse({ role: 'SUPERUSER' }).success).toBe(false);
  });
});
