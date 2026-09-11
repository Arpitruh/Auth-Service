import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Unit tests run anywhere; integration tests that need a live DB are
    // guarded at runtime and skip themselves when DATABASE_URL is unreachable.
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // argon2 hashing is slow; give tests headroom.
    testTimeout: 20_000,
    globals: false,
  },
});
