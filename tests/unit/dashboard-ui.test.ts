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
  it('shows a clear no-applications state without fabricating projects', async () => {
    const { appListPage } = await import('../../src/dashboard/views.js');
    const html = appListPage([], '', 'test-csrf-token');
    expect(html).toContain('No Auth Garden applications are registered');
    expect(html).toContain('Create your first application');
    expect(html).toContain('Notification Service');
    expect(html).toContain('0 projects');
    expect(html).not.toContain('data-application-row');
  });
  it('provides a website footer on authenticated and sign-in pages', () => {
    for (const html of [layout('Dashboard', 'content'), loginPage()]) {
      expect(html).toContain('aria-label="Website footer"');
      expect(html).toContain('API documentation');
      expect(html).toContain('github.com/Arpitruh/Auth-Service');
    }
  });
  it('adds accessible skeleton navigation and prevents duplicate submissions', () => {
    expect(dashboardUiScript).toContain('nav-progress');
    expect(dashboardUiScript).toContain('loading-bar');
    expect(dashboardUiScript).toContain('aria-live');
    expect(dashboardUiScript).toContain('event.preventDefault()');
    expect(dashboardUiScript).toContain('setAttribute("aria-busy", "true")');
    expect(dashboardUiScript).toContain('pageshow');
  });
  it('keeps the sidebar pinned while only main content scrolls', () => {
    const html = layout('Applications', 'content', 'applications', 'csrf-token');
    expect(html).toContain('id="auth-shell"');
    expect(html).toContain('id="auth-sidebar"');
    expect(html).toContain('class="sidebar-toggle"');
    expect(html).toContain('class="mobile-sidebar-toggle"');
    expect(html).toContain('class="sidebar-backdrop"');
    expect(html).toContain('aria-controls="auth-sidebar"');
    expect(html).toContain('class="main"');
  });
  it('supports collapsing navigation and accessible mobile dismissal', () => {
    expect(dashboardUiScript).toContain('auth-garden-sidebar');
    expect(dashboardUiScript).toContain('window.localStorage.setItem');
    expect(dashboardUiScript).toContain('shell.dataset.sidebar');
    expect(dashboardUiScript).toContain('shell.dataset.mobileSidebar');
    expect(dashboardUiScript).toContain('aria-expanded');
    expect(dashboardUiScript).toContain('event.key === "Escape"');
    expect(dashboardUiScript).toContain('syncSidebar()');
  });
  it('uses external safe submit feedback', () => {
    expect(dashboardUiScript).toContain('is-submitting');
    expect(dashboardUiScript).toContain('submitter.disabled');
  });
});
