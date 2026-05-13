import { buildApp } from '../../app.js';

export async function buildTestApp() {
  const app = await buildApp();
  return app;
}
