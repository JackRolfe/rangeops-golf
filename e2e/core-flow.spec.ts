import { expect, test } from '@playwright/test';

async function makeRangeImage(page: import('@playwright/test').Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1600;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');

    const grass = context.createLinearGradient(0, 0, 900, 1600);
    grass.addColorStop(0, '#3e6e43');
    grass.addColorStop(0.55, '#668553');
    grass.addColorStop(1, '#365d3a');
    context.fillStyle = grass;
    context.fillRect(0, 0, 900, 1600);

    for (let x = 0; x < 900; x += 90) {
      context.fillStyle = x % 180 === 0 ? 'rgba(255,255,210,.07)' : 'rgba(0,30,10,.05)';
      context.fillRect(x, 0, 90, 1400);
    }

    context.fillStyle = '#d9c794';
    context.beginPath();
    context.ellipse(750, 580, 70, 125, -0.2, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = 'rgba(255,255,235,.78)';
    context.lineWidth = 8;
    [340, 570, 800, 1040].forEach((y) => {
      context.beginPath();
      context.arc(450, y, 20, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(450, y, 5, 0, Math.PI * 2);
      context.fillStyle = 'rgba(255,255,235,.78)';
      context.fill();
    });

    context.fillStyle = '#d7d4c8';
    context.fillRect(0, 1400, 900, 200);
    for (let x = 24; x < 900; x += 84) {
      context.fillStyle = '#1b4332';
      context.fillRect(x, 1416, 58, 58);
    }

    return canvas.toDataURL('image/png').split(',')[1];
  });

  return Buffer.from(base64, 'base64');
}

async function clickMapAtNormalized(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
): Promise<void> {
  const map = page.getByRole('application', { name: 'Driving range shot map' });
  const box = await map.boundingBox();
  if (!box) throw new Error('Range map has no bounding box.');
  const imageWidth = 900;
  const imageHeight = 1600;
  const scale = Math.min(box.width / imageWidth, box.height / imageHeight);
  const imageLeft = box.x + (box.width - imageWidth * scale) / 2;
  const imageTop = box.y + (box.height - imageHeight * scale) / 2;
  await page.mouse.click(
    imageLeft + imageWidth * scale * x,
    imageTop + imageHeight * scale * y,
  );
}

test('records a session, restores it after reload, and starts offline', async ({ page, context }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveTitle('RangeOps');
  await expect(page.getByRole('heading', { name: 'Set up your range.' })).toBeVisible();

  await page.getByLabel('Range name').fill('Harbour Practice Range');
  await page.locator('#range-image').setInputFiles({
    name: 'harbour-range.png',
    mimeType: 'image/png',
    buffer: await makeRangeImage(page),
  });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Harbour Practice Range' })).toBeVisible();
  await expect(page.getByText('No sessions yet')).toBeVisible();

  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.getByRole('heading', { name: 'What are you hitting?' })).toBeVisible();
  await page.getByLabel('Club').selectOption({ label: '7 iron' });
  await page.getByLabel(/Note/).fill('Tempo drill');
  await page.getByRole('button', { name: 'Set target' }).click();

  await expect(page.getByText('Move and resize the target')).toBeVisible();
  await page.getByRole('button', { name: 'Set target' }).click();
  await expect(page.getByText('Tap where the ball landed', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '7 iron' }).click();
  await page.getByRole('button', { name: 'Save and leave' }).click();
  await expect(page.getByText('Practice in progress')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('Tap where the ball landed', { exact: true })).toBeVisible();
  await expect(page.getByText('0 shots', { exact: true })).toBeVisible();

  await clickMapAtNormalized(page, 0.5, 0.42);
  await expect(page.getByText('1 shot', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '7 iron' }).click();
  await page.getByRole('button', { name: 'Save and leave' }).click();
  await expect(page.getByText('Practice in progress')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Practice in progress')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('1 shot', { exact: true })).toBeVisible();

  await clickMapAtNormalized(page, 0.12, 0.12);
  await expect(page.getByText('2 shots', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/rangeops-practice.png' });
  await page.setViewportSize({ width: 466, height: 968 });
  await page.screenshot({ path: '/tmp/rangeops-practice-native.png' });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: '7 iron' })).toBeVisible();
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go back' }).click();

  await expect(page.getByRole('heading', { name: 'Harbour Practice Range' })).toBeVisible();
  await expect(page.getByText('50%', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: '/tmp/rangeops-home.png' });
  await page.setViewportSize({ width: 466, height: 968 });
  await page.screenshot({ path: '/tmp/rangeops-home-native.png' });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Harbour Practice Range' })).toBeVisible();
  await expect(page.getByText('Tempo drill')).toBeVisible();

  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await expect(page.getByText('50%', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: '/tmp/rangeops-history.png' });
  await page.setViewportSize({ width: 466, height: 968 });
  await page.screenshot({ path: '/tmp/rangeops-history-native.png' });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.setViewportSize({ width: 430, height: 932 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/rangeops-history-430.png' });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => setTimeout(resolve, 250));
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Harbour Practice Range' })).toBeVisible();
  await expect(page.getByText('50%', { exact: true }).first()).toBeVisible();
  await context.setOffline(false);

  expect(consoleErrors).toEqual([]);
});

test.describe('desktop frame', () => {
  test.use({ viewport: { width: 1024, height: 900 }, isMobile: false, hasTouch: false });

  test('centres the mobile app without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Set up your range.' })).toBeVisible();
    const shell = page.locator('.app-shell');
    const box = await shell.boundingBox();
    if (!box) throw new Error('App shell has no bounding box.');
    expect(box.width).toBeLessThanOrEqual(482);
    expect(Math.abs(box.x - (1024 - box.width) / 2)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/rangeops-desktop.png' });
  });
});
