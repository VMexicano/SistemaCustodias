import type { APIRequestContext } from '@playwright/test';

export async function checkHealth(api: APIRequestContext) {
  const response = await api.get('/health');
  return response.json();
}

// Helpers adicionales se agregan en Sprint 2+ cuando existen endpoints de auth
