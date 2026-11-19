import { describe, expect, it } from 'vitest';
import { dashboardUiScript, layout, loginPage, recoveryPage } from '../../src/dashboard/views.js';

describe('Auth Garden operator UI', () => {
  it('renders a CSRF-protected POST logout form when authenticated', () => {
    const html = layout('Dashboard', 'content', 'applications', 'test-csrf-token');
    expect(html).toContain('method="post" action="/dashboard/logout"');
    expect(html).toContain('name="_csrf" value="test-csrf-token"');
    expect(html).toContain('Sign out securely');
    expect(html).toContain('script src="/dashboard/ui.js" defer');
    expect(html).not.toContain('onsubmit=');
  });
  it('does not show a logout form without an authenticated session token', () => {
    expect(layout('Dashboard', 'content')).not.toContain('action="/dashboard/logout"');
  });
  it('offers operator-assisted recovery without collecting reset secrets', () => {
    expect(loginPage()).toContain('href="/dashboard/recover"');
    const html = recoveryPage();
    expect(html).toContain('DASHBOARD_OPERATOR_PASSWORD_HASH');
    expect(html).not.toContain('name="password"');
  });
  it('uses external safe submit feedback', () => {
    expect(dashboardUiScript).toContain('is-submitting');
    expect(dashboardUiScript).toContain('submitter.disabled');
  });
});
