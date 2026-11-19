import { ENV } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Each application's backend sends one registration event.
 * Notification Garden chooses the published template, branding and destination URL.
 * The only per-app secret here is the backend's Notification API key.
 */
export type WelcomeConfig = { apiKey: string };

function validConfig(config: unknown): config is WelcomeConfig {
  return !!config && typeof config === 'object' &&
    'apiKey' in config && typeof config.apiKey === 'string' && config.apiKey.length >= 32;
}
export function tenantWelcomeConfig(tenantId: string): WelcomeConfig | null {
  if (!ENV.WELCOME_NOTIFICATION_APPS) return null;
  const all: unknown = JSON.parse(ENV.WELCOME_NOTIFICATION_APPS);
  if (!all || typeof all !== 'object' || Array.isArray(all)) return null;
  const config = (all as Record<string, unknown>)[tenantId];
  return validConfig(config) ? config : null;
}
export async function notifyRegistration(
  user: { id: string; email: string },
  config: WelcomeConfig | null,
  context: string,
): Promise<void> {
  if (!config || !ENV.NOTIFICATION_SERVICE_URL) {
    logger.warn({ event: 'welcome_event_unconfigured', context }, 'registration notification not configured');
    return;
  }
  try {
    const response = await fetch(
      new URL('/api/v1/notifications/events/user.registered', ENV.NOTIFICATION_SERVICE_URL), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
        body: JSON.stringify({ userId: user.id, email: user.email }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (response.status === 202) {
      logger.info({ event: 'welcome_event_queued', context }, 'welcome email queued');
    } else if (response.status === 200) {
      logger.info({ event: 'welcome_event_skipped', context }, 'welcome notifications disabled or already handled');
    } else {
      logger.warn({ event: 'welcome_event_rejected', context, status: response.status }, 'welcome event rejected');
    }
  } catch (err) {
    logger.warn({ event: 'welcome_event_unavailable', context,
      kind: err instanceof Error ? err.name : 'Unknown' }, 'welcome event could not be dispatched');
  }
}
export async function notifyLegacyRegistration(user: { id: string; email: string }): Promise<void> {
  await notifyRegistration(user, ENV.NOTIFICATION_API_KEY ? { apiKey: ENV.NOTIFICATION_API_KEY } : null, 'auth-service');
}
export async function notifyTenantRegistration(tenantId: string, user: { id: string; email: string }): Promise<void> {
  try { await notifyRegistration(user, tenantWelcomeConfig(tenantId), tenantId); }
  catch { logger.warn({ event: 'welcome_event_config_invalid', tenantId }, 'tenant welcome settings invalid'); }
}
