import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { API_LOG, API_PORT } from '../playwright.api.config';

const API = `http://127.0.0.1:${API_PORT}`;

/** The API writes sign-in links to its log instead of emailing them. */
async function linkFromLog(email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(() => {
      const log = readFileSync(API_LOG, 'utf8');
      const at = log.lastIndexOf(`Mail to ${email}`);
      link = at >= 0 ? /(https?:\/\/\S+\/signin\?token=[\w-]+)/.exec(log.slice(at))?.[1] : undefined;
      return link;
    }, { timeout: 10_000 })
    .toBeTruthy();
  return link!;
}

async function staffCheckInUrl(request: APIRequestContext, bayNumber: number): Promise<string> {
  await request.post(`${API}/auth/email-link`, { data: { email: 'staff@rangeops.test' } });
  const token = new URL(await linkFromLog('staff@rangeops.test')).searchParams.get('token');
  const session = await (await request.post(`${API}/auth/verify`, { data: { token } })).json();
  const { bays } = await (
    await request.get(`${API}/ranges/demo/bays`, { headers: { Authorization: `Bearer ${session.sessionToken}` } })
  ).json();
  return bays.find((bay: { number: number }) => bay.number === bayNumber).checkInUrl;
}

test('signs in by email link, books a bay with a robot, drives from it, buys a bucket and checks in', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `family-${Date.now()}@example.test`;

  // Practice still needs no account: a fresh phone opens on Games, and the other tabs work.
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Set up your range.' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText(`We’ve sent a sign-in link to ${email}`)).toBeVisible();
  await expect(page.getByText('Demo mode')).toHaveCount(0);

  // The link from the "email", opened on this phone.
  const link = await linkFromLog(email);
  expect(link).toContain('/app/signin?token=');
  await page.goto(link);
  await expect(page.getByText(`You’re signed in as ${email}.`)).toBeVisible();
  await expect(page).toHaveURL(/\/app\/$/);

  // Book tomorrow's first free time, with a robot.
  await page.getByRole('button', { name: 'Book' }).click();
  await page.getByRole('button', { name: 'Tomorrow' }).click();
  const times = page.getByRole('group', { name: 'Time' });
  await times.getByRole('button').first().click();
  const bay = (await page.getByRole('group', { name: 'Bay' }).getByRole('button', { pressed: true }).textContent())!;
  await page.getByRole('checkbox', { name: /Mulligan robot/ }).check();
  await page.getByRole('button', { name: /^Pay \$/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re booked' })).toBeVisible();
  await expect(page.getByText(new RegExp(`${bay}, `)).first()).toBeVisible();
  await page.screenshot({ path: '/tmp/rangeops-e2e-booked.png' });

  // Drive from the booking: the simulator checks the API's real Ed25519 key, and the hire is tomorrow.
  await page.getByRole('button', { name: /^Drive Mulligan/ }).first().click();
  await expect(page.getByText(new RegExp(`is hired for ${bay}`))).toBeVisible();
  await page.getByRole('button', { name: 'Connect to Mulligan' }).click();
  await expect(page.getByRole('alert')).toHaveText('This hire hasn’t started yet. Try again at your booking time.');

  // The booking is listed, from the API.
  await page.getByRole('button', { name: 'Book' }).click();
  const yours = page.getByRole('region', { name: 'Your bookings' });
  await expect(yours.getByText(new RegExp(`${bay} · `))).toBeVisible();

  // Balls: a bucket by card, and its code.
  await page.getByRole('button', { name: 'Balls' }).click();
  const small = page.getByRole('listitem').filter({ hasText: /^Small bucket/ });
  await small.getByRole('button', { name: 'Buy' }).click();
  await page.getByRole('button', { name: /^Pay \$/ }).click();
  const code = page.getByLabel(/^Bucket code /);
  await expect(code).toHaveText(/\S{4,}/);
  const codeText = (await code.textContent())!;
  await expect(page.getByRole('region', { name: 'Your balls and passes' }).getByText(codeText)).toBeVisible();
  await page.screenshot({ path: '/tmp/rangeops-e2e-bucket.png' });

  // A bay's QR code: the app posts the check-in; there's no booking at bay 8 now, and the API says so.
  const checkInUrl = await staffCheckInUrl(request, 8);
  expect(checkInUrl).toContain('/app/check-in/');
  await page.goto(checkInUrl);
  await expect(page.getByRole('heading', { name: 'Check in' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('You have no booking at Bay 8 right now.');

  // A hire link straight from the API's booking opens Drive with that key.
  const stored = await page.evaluate(() => localStorage.getItem('rangeops.session'));
  const sessionToken = JSON.parse(stored!).sessionToken as string;
  const { bookings } = await (await request.get(`${API}/me/bookings`, { headers: { Authorization: `Bearer ${sessionToken}` } })).json();
  await page.goto(bookings[0].hire.link);
  await expect(page.getByText(new RegExp(`Mulligan-${bookings[0].hire.robot.serial} is hired for Bay ${bookings[0].bay.number}`))).toBeVisible();

  expect(errors).toEqual([]);
});
