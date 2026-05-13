/**
 * Smoke test: Admin Web Dashboard (Vite React)
 * - login username/password → dashboard → stats → trips → conductores
 * Requiere: servidor en http://localhost:5173
 * Credenciales: admin / Admin1234!
 */
import { test, expect } from '@playwright/test';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin1234!';
const WEB_URL = process.env['ADMIN_WEB_URL'] ?? 'http://localhost:5173';

test.describe('Admin Web smoke tests', () => {
  test.use({ baseURL: WEB_URL });

  test('login admin y ver dashboard', async ({ page }) => {
    // Navegar a la app — redirige a /login
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h1')).toBeVisible(); // título depende de VITE_APP_NAME

    // Ingresar credenciales
    await page.fill('input[placeholder="admin"]', ADMIN_USERNAME);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Redirige al dashboard
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('h1').first()).toBeVisible(); // título depende de VITE_APP_NAME

    // Stats cards visibles
    await expect(page.locator('text=Viajes activos')).toBeVisible();
    await expect(page.locator('text=Conductores online')).toBeVisible();
    await expect(page.locator('text=Ingresos hoy')).toBeVisible();
    await expect(page.locator('text=Errores pendientes').first()).toBeVisible();

    // Tabla de viajes visible (aunque vacía)
    await expect(page.locator('text=Viajes recientes')).toBeVisible();

    // Link de configuración visible
    await expect(page.locator('text=Configuración')).toBeVisible();
  });

  test('acceso directo a /admin sin auth redirige a /login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });
});
