import { createHash } from 'node:crypto';
import { ENV } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Register-success -> Notification Service integration.
 * Each app gets its own notification credential and 'welcome' template.
 * A failure here must never undo an already completed user registration.
 *
 * For tenant registrations WELCOME_NOTIFICATION_APPS is a JSON object keyed
 * by Auth Service tenant UUID:
 * {"tenant-uuid":{"apiKey":"...","appName":"CRM","dashboardUrl":"https://crm.example.com"}}
 *
 * The Notification Service identifies the calling app from its X-API-Key.
 * Do not transmit API keys to browsers, or log the payload/recipient.
 */
type WelcomeConfig = {
  apiKey: string;
  appName: string;
  dashboardUrl: string;
};

function validConfig(config: unknown): config is WelcomeConfig {
  if (!config || typeof config !== 'object') return false;
  const value = config as Partial<WelcomeConfig>;
  if (typeof value.apiKey !== 'string' || value.apiKey.length < 32 ||
      typeof value.appName !== 'string' || !value.appName.trim() ||
      typeof value.dashboardUrl !== 'string') return false;
  try {
    const url = new URL(value.dashboardUrl);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost');
  } catch { return false; }
}

function tenantWelcomeConfig(tenantId: string): WelcomeConfig | null {
  const raw = ENV.WELCOME_NOTIFICATION_APPS;
  if (!raw) return null;
  // Configuration is not trusted input; validate before using a tenant entry.
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const entry = (parsed as Record<string, unknown>)[tenantId];
  if (!validConfig(entry)) return null;
  return entry;
}

export async function notifyRegistration(
  user: { id: string; email: string },
  config: WelcomeConfig | null,
  context: string,
): Promise<void> {
  if (!config || !ENV.NOTIFICATION_SERVICE_URL) {
    logger.warn({ event: 'welcome_email_unconfigured', context }, 'welcome notification integration not configured');
    return;
  }
  try {
    const dedupe = createHash('sha256').update(context + ':' + user.id).digest('hex');
    const response = await fetch(new URL('/api/v1/notifications/send', ENV.NOTIFICATION_SERVICE_URL), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
      body: JSON.stringify({
        recipient: user.email,
        channel: 'email',
        templateId: 'welcome',
        payloadData: {
          // An email address is not reliably a person's display name.
          name: 'there',
          appName: config.appName,
          dashboardUrl: config.dashboardUrl,
        },
        idempotencyKey: 'registration-welcome:' + dedupe,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (response.status !== 202 && response.status !== 200) {
      logger.warn({ event: 'welcome_email_rejected', context, status: response.status }, 'welcome email not queued');
      return;
    }
    logger.info({ event: 'welcome_email_queued', context }, 'welcome email queued');
  } catch (err) {
    const kind = err instanceof Error ? err.name : 'Unknown';
    logger.warn({ event: 'welcome_email_delivery_unavailable', context, kind }, 'welcome email could not be queued');
  }
}

export async function notifyLegacyRegistration(user: { id: string; email: string }): Promise<void> {
  const base = ENV.WELCOME_DASHBOARD_URL || ENV.CLIENT_ORIGIN;
  await notifyRegistration(user, ENV.NOTIFICATION_API_KEY && validConfig({
    apiKey: ENV.NOTIFICATION_API_KEY,
    appName: ENV.WELCOME_APP_NAME,
    dashboardUrl: base,
  }) ? { apiKey: ENV.NOTIFICATION_API_KEY, appName: ENV.WELCOME_APP_NAME, dashboardUrl: base } : null, 'auth-service');
}

export async function notifyTenantRegistration(
  tenantId: string,
  user: { id: string; email: string },
): Promise<void> {
  try {
    await notifyRegistration(user, tenantWelcomeConfig(tenantId), tenantId);
  } catch {
    logger.warn({ event: 'welcome_email_tenant_config_invalid', tenantId }, 'tenant welcome configuration invalid');
  }
}
