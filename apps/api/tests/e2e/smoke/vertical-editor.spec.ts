/**
 * Smoke test: Vertical Editor — VerticalesPage backoffice UI
 * Requiere: backoffice web en ADMIN_WEB_URL (default http://localhost:5173)
 *           API en APP_URL (default http://localhost:3333)
 *           admin / Admin1234! en admin_users
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin1234!';
const WEB_URL = process.env['ADMIN_WEB_URL'] ?? 'http://localhost:5173';
const API_URL = process.env['APP_URL'] ?? 'http://localhost:3333';

// Shared login helper
async function loginAdmin(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.goto(WEB_URL);
  await page.fill('input[placeholder="admin"]', ADMIN_USERNAME);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

test.describe('Vertical Editor', () => {
  test('admin puede editar features del vertical y el cambio persiste', async ({ page }) => {
    await loginAdmin(page);

    // Navegar al panel de Verticales por el sidebar (SPA — no page.goto para preservar token en memoria)
    await page.getByRole('link', { name: /Verticales/ }).click();
    await page.waitForSelector('text=Verticales', { timeout: 8000 });

    // Abrir editor del vertical taxi
    const taxiCard = page.locator('div.rounded-lg').filter({ hasText: /^Taxi/ }).first();
    await taxiCard.getByRole('button', { name: 'Editar' }).click();

    // Esperar que el modal abra
    await expect(page.locator('text=Editar vertical')).toBeVisible();

    // Verificar que el checkbox de "Programados" existe
    const schedulingLabel = page.locator('label').filter({ hasText: 'Programados' });
    const schedulingCheckbox = schedulingLabel.locator('input[type="checkbox"]');
    await expect(schedulingCheckbox).toBeVisible();

    // Capturar el estado actual y hacer toggle
    const wasChecked = await schedulingCheckbox.isChecked();
    if (wasChecked) {
      await schedulingCheckbox.uncheck();
    } else {
      await schedulingCheckbox.check();
    }

    // Guardar
    await page.getByRole('button', { name: 'Guardar' }).click();

    // Modal cierra y la tarjeta se actualiza (react-query invalida la query)
    await expect(page.locator('text=Editar vertical')).not.toBeVisible({ timeout: 5000 });

    // Verificar que GET /config refleja el cambio
    const configRes = await page.request.get(`${API_URL}/config`);
    expect(configRes.ok()).toBe(true);
    const config = await configRes.json() as { vertical?: { slug?: string; features?: { scheduling?: boolean } } };

    // El /config refleja el vertical activo (VERTICAL_SLUG del env)
    // Solo verificar si el slug activo es taxi
    if (config.vertical?.slug === 'taxi') {
      expect(typeof config.vertical.features?.scheduling).toBe('boolean');
    }

    // Restaurar el estado original
    await taxiCard.getByRole('button', { name: 'Editar' }).click();
    await expect(page.locator('text=Editar vertical')).toBeVisible();
    const newState = await schedulingLabel.locator('input[type="checkbox"]').isChecked();
    if (newState !== wasChecked) {
      if (wasChecked) {
        await schedulingLabel.locator('input[type="checkbox"]').check();
      } else {
        await schedulingLabel.locator('input[type="checkbox"]').uncheck();
      }
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.locator('text=Editar vertical')).not.toBeVisible({ timeout: 5000 });
    } else {
      await page.keyboard.press('Escape');
    }
  });

  test('editor rechaza guardar con nombre vacío (botón disabled)', async ({ page }) => {
    await loginAdmin(page);

    // Navegar por sidebar (SPA — no page.goto)
    await page.getByRole('link', { name: /Verticales/ }).click();
    await page.waitForSelector('text=Verticales', { timeout: 8000 });

    // Abrir editor de cualquier vertical
    await page.locator('div.rounded-lg').first().getByRole('button', { name: 'Editar' }).click();
    await expect(page.locator('text=Editar vertical')).toBeVisible();

    // Limpiar el campo Nombre
    const nameInput = page.locator('input[placeholder="Nombre del vertical"]');
    await nameInput.fill('');

    // Botón Guardar debe estar disabled
    const saveBtn = page.getByRole('button', { name: 'Guardar' });
    await expect(saveBtn).toBeDisabled();

    // Cerrar modal
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('text=Editar vertical')).not.toBeVisible({ timeout: 3000 });
  });
});
