import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '../..');

/**
 * Fail-fast config (Requirement 10.2): importing the env module with a required
 * variable missing must exit the process non-zero, not boot silently.
 */
describe('env fail-fast', () => {
  it('exits non-zero when a required var is missing', () => {
    const env = { ...process.env };
    // Remove required vars.
    delete env.DATABASE_URL;
    delete env.JWT_ACCESS_SECRET;
    delete env.JWT_REFRESH_SECRET;
    env.NODE_ENV = 'test';
    // Point dotenv at a nonexistent file so the project's .env does not
    // silently repopulate the vars we just removed.
    env.DOTENV_CONFIG_PATH = resolve(projectRoot, '.env.nonexistent-for-test');

    const tsx = resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs');
    const result = spawnSync(
      process.execPath,
      [tsx, resolve(projectRoot, 'src/config/env.ts')],
      { cwd: projectRoot, env, encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
  });
});
