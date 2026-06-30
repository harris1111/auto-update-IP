import { test, expect } from '@playwright/test';

test.describe('E2E UI Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept APIs to mock responses
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          user: { id: 'test-user', displayName: 'Admin User', role: 'admin', passkeyEnrolled: true }
        }),
      });
    });

    await page.route('**/api/current-ip', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ip: '8.8.8.8', ipVersion: 4, source: 'cf-connecting-ip' }),
      });
    });

    await page.route('**/api/port-groups', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { key: 'postgres', name: 'PostgreSQL', description: 'Port 15432', ports: [15432], enabled: true }
        ]),
      });
    });

    await page.route('**/api/allowlist', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'rule-1',
            ipCidr: '8.8.8.8/32',
            ipVersion: 4,
            label: 'Office WiFi',
            reason: 'Debugging',
            ports: [15432],
            isPersistent: false,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            enabled: true,
            createdBy: 'test-user',
            createdAt: new Date().toISOString(),
            lastAppliedAt: new Date().toISOString(),
          }
        ]),
      });
    });

    await page.route('**/api/audit', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'log-1', action: 'login_success', resourceType: 'user', ip: '8.8.8.8', createdAt: new Date().toISOString() }
        ]),
      });
    });
  });

  test('should log in using mock credentials and load dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email-input', 'admin@0err.com');
    await page.click('#instant-login-btn');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Check if detected IP is loaded
    await expect(page.locator('#detected-ip-val')).toContainText('8.8.8.8');
    
    // Check if the rules are loaded
    await expect(page.locator('table').first()).toContainText('Office WiFi');
  });

  test('should navigate to new rule form and create a rule', async ({ page }) => {
    const mockSession = {
      userId: 'test-user',
      email: 'admin@0err.com',
      role: 'admin',
      sessionId: 'test-session-id',
    };
    await page.context().addCookies([{
      name: 'mock-session',
      value: JSON.stringify(mockSession),
      domain: '127.0.0.1',
      path: '/'
    }]);

    await page.goto('/dashboard');
    await page.click('#new-allow-btn');
    await expect(page).toHaveURL(/\/allowlist\/new/);

    // Fill form
    await page.fill('#label-input', 'Home Office');
    await page.fill('#reason-input', 'Test database access');
    
    // Mock the submission endpoint to succeed
    await page.route('**/api/allowlist', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'rule-2', ipCidr: '8.8.8.8/32', label: 'Home Office' }),
        });
      }
    });

    // Mock step-up verify to succeed
    await page.route('**/api/step-up/otp/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, stepUpToken: 'mock-token' }),
      });
    });

    // Submit
    await page.click('#submit-rule-btn');
    
    // The step-up modal opens, click simulated dev-mode bypass
    await page.click('#mock-bypass-btn');
    
    // It should redirect back to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
