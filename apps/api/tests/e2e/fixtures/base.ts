import { test as base, type APIRequestContext } from '@playwright/test';

interface UberFixtures {
  apiContext: APIRequestContext;
}

export const test = base.extend<UberFixtures>({
  apiContext: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: process.env['APP_URL'] ?? 'http://localhost:3333',
    });
    await use(context);
    await context.dispose();
  },
});

export { expect } from '@playwright/test';
