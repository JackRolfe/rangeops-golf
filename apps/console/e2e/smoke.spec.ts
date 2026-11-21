import { expect, test, type Page } from '@playwright/test';

// A Thursday afternoon in the peak window, so the demo range is busy and robots are out.
const NOW = '2026-11-19T17:10';
const open = (page: Page, route: string) => page.goto(`/?now=${NOW}#/${route}`);

test('Live shows every bay, the robots and today’s takings', async ({ page }) => {
  await open(page, 'live');
  await expect(page.getByRole('heading', { name: 'Live', level: 1 })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Bays now' }).getByRole('listitem')).toHaveCount(20);
  await expect(page.getByRole('list', { name: 'Robots' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('Mulligan-7C2A')).toBeVisible();
  await expect(page.getByTestId('takings-total')).toHaveText(/^\$[\d,]+\.\d\d$/);
});

test('Today lists bookings and bucket orders, and checks a player in', async ({ page }) => {
  await open(page, 'today');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  const bookings = page.getByRole('table', { name: 'Bookings' });
  await expect(bookings.getByRole('row').nth(5)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Bucket orders' }).getByText('PUTT42')).toBeVisible();
  const checkIns = page.getByRole('button', { name: 'Check in' });
  const before = await checkIns.count();
  await checkIns.first().click();
  await expect(checkIns).toHaveCount(before - 1);
});

test('Handover hands a code over once', async ({ page }) => {
  await open(page, 'handover');
  await expect(page.getByRole('heading', { name: 'Handover', level: 1 })).toBeVisible();
  const code = page.getByLabel('Bucket code');
  await code.fill('putt-42');
  await code.press('Enter');
  await expect(page.getByRole('status')).toContainText('Hand over a medium bucket');
  await code.fill('PUTT42');
  await code.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Already handed over');
});

test('Passes sells ball credit and hands out a bucket from it', async ({ page }) => {
  await open(page, 'passes');
  await expect(page.getByRole('heading', { name: 'Passes', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Passes' }).getByText('Grace Tan')).toBeVisible();
  await page.getByLabel("Player's email").fill('smoke@example.com');
  await page.getByLabel('Name (optional)').fill('Smoke Test');
  await page.getByRole('button', { name: 'Sell' }).click();
  await expect(page.getByRole('status')).toContainText('Sold ball credit to Smoke Test: 500 balls now.');
  await page.getByRole('button', { name: 'Hand Smoke Test a medium bucket from their credit' }).click();
  await expect(page.getByRole('status')).toContainText('Hand Smoke Test a medium bucket (80 balls). 420 balls of credit left.');
  await expect(page.getByRole('row', { name: /Smoke Test/ }).getByRole('cell').nth(4)).toHaveText('420 balls of credit');
});

test('Check-in QR shows a code per bay and prints a sheet', async ({ page }) => {
  await open(page, 'check-in');
  await expect(page.getByRole('heading', { name: 'Check-in QR', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '7', exact: true }).click();
  await expect(page.getByRole('img', { name: 'QR code to check in at Bay 7' }).locator('svg')).toBeVisible();
  await expect(page.getByText('https://rangeops.example/app/check-in?range=demo-range&bay=bay-7')).toBeVisible();

  await page.evaluate(() => {
    window.print = () => window.dispatchEvent(new Event('printed'));
  });
  const printed = page.evaluate(() => new Promise<void>((resolve) => window.addEventListener('printed', () => resolve(), { once: true })));
  await page.getByRole('button', { name: /Print all 19 bays/ }).click();
  await printed;
  await expect(page.locator('.print-sheet .bay-card')).toHaveCount(19);
});

test('Setup refuses a price under the floor and saves a good one', async ({ page }) => {
  await open(page, 'setup');
  await expect(page.getByRole('heading', { name: 'Setup', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Bay 20 name')).toHaveValue('Bay 20');
  const offPeak = page.getByRole('textbox', { name: 'Standard off-peak' });
  await offPeak.fill('15');
  await expect(page.getByRole('alert')).toContainText('Standard off-peak ($15.00) is below its floor ($18.00).');
  await offPeak.fill('26');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Unsaved changes')).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Standard off-peak' })).toHaveValue('26.00');
});

test('the nav reaches every screen', async ({ page }) => {
  await open(page, 'live');
  for (const [link, heading] of [['Today', 'Today'], ['Handover', 'Handover'], ['Passes', 'Passes'], ['Check-in QR', 'Check-in QR'], ['Setup', 'Setup'], ['Live', 'Live']]) {
    await page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
});
