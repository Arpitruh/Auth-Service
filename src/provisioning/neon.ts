/** Neon v2 management adapter. Provisioning may cost money: call only after operator approval. */
export interface NeonProject { projectId: string; connectionUrl: string }
interface CreationResponse {
  project?: { id?: string };
  connection_uris?: { connection_uri?: string }[];
  operations?: { status?: string; id?: string }[];
}

/** onProjectCreated is invoked immediately after receiving an ID to persist it for recovery.
 * Do not automatically retry POST project creation: a timeout can still create a project.
 */
export async function createNeonTenantProject(
  name: string, onProjectCreated?: (projectId: string) => Promise<void>,
): Promise<NeonProject> {
  const token = process.env.NEON_API_KEY;
  if (!token) throw new Error('NEON_API_KEY is not configured');
  if (!/^auth-[a-z0-9-]{3,60}$/.test(name)) throw new Error('Invalid Neon project name');
  const endpoint = new URL('https://console.neon.tech/api/v2/projects');
  if (process.env.NEON_ORG_ID) endpoint.searchParams.set('org_id', process.env.NEON_ORG_ID);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: { name, pg_version: 17 } }),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status !== 201) throw new Error('Neon project create failed (' + response.status + ')');
  const data = await response.json() as CreationResponse;
  const projectId = data.project?.id;
  if (!projectId) throw new Error('Neon create response lacked project ID; reconcile manually');
  await onProjectCreated?.(projectId);
  const connectionUrl = data.connection_uris?.find(x=>x.connection_uri)?.connection_uri;
  if (!connectionUrl) throw new Error('Neon project exists but connection metadata missing; reconcile manually');
  // Neon's API can report operations still running immediately after POST.
  // Wait for readiness using PostgreSQL connection retries in tenant migrator.
  return { projectId, connectionUrl };
}
