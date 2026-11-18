/** Neon management API adapter. No API keys or connection URLs are logged. */
export interface NeonProject {
  projectId: string;
  connectionUrl: string;
}
export async function createNeonTenantProject(name: string): Promise<NeonProject> {
  const token = process.env.NEON_API_KEY;
  if (!token) throw new Error('NEON_API_KEY is not configured');
  if (!/^auth-[a-z0-9-]{3,60}$/.test(name)) throw new Error('Invalid Neon project name');
  const orgId = process.env.NEON_ORG_ID;
  const endpoint = new URL('https://console.neon.tech/api/v2/projects');
  if (orgId) endpoint.searchParams.set('org_id', orgId);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: { name, pg_version: 17 } }),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status !== 201) throw new Error('Neon project creation rejected: ' + response.status);
  const data = await response.json() as {
    project?: { id?: string };
    connection_uris?: { connection_uri?: string }[];
  };
  const projectId = data.project?.id;
  const connectionUrl = data.connection_uris?.find(x=>x.connection_uri)?.connection_uri;
  if (!projectId || !connectionUrl) {
    // Unknown/partial response: never retry the non-idempotent create automatically.
    throw new Error('Neon project created but connection metadata unavailable; reconcile manually');
  }
  return { projectId, connectionUrl };
}
