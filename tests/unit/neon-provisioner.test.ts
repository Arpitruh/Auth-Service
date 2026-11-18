import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNeonTenantProject } from '../../src/provisioning/neon.js';

describe('Neon managed project adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEON_API_KEY;
  });
  it('records the project ID from a successful creation response', async () => {
    process.env.NEON_API_KEY = 'ci-only-mock-key';
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({
        project: { id: 'project-example-123' },
        connection_uris: [{ connection_uri: 'postgresql://user:pass@host.neon.tech/db?sslmode=require' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const saved = vi.fn().mockResolvedValue(undefined);
    const created = await createNeonTenantProject('auth-example', saved);
    expect(created.projectId).toBe('project-example-123');
    expect(saved).toHaveBeenCalledOnce();
    expect(saved).toHaveBeenCalledWith(created.projectId);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
  it('fails closed on ambiguous create results and never retries POST', async () => {
    process.env.NEON_API_KEY = 'ci-only-mock-key';
    const fetchMock = vi.fn().mockResolvedValue({ status: 201, json: async () => ({ project: { id: 'neon-id' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const saved = vi.fn().mockResolvedValue(undefined);
    await expect(createNeonTenantProject('auth-example', saved)).rejects.toThrow('connection metadata');
    expect(saved).toHaveBeenCalledWith('neon-id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
