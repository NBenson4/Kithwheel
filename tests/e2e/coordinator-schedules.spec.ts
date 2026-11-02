// @polsia:user-owned — coordinator schedule journey and server authorization.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';
import { CoopClassList, CoopList, ScheduleList } from '@/lib/contracts/coops';

type CapturedEmail = { to?: unknown; body?: unknown };

const emailCapturePath = '/tmp/kithwheel-email-capture.jsonl';

function findVerificationLink(recipient: string) {
  const lines = readFileSync(emailCapturePath, 'utf8').split('\n').filter(Boolean);
  const captured = lines
    .map((line) => {
      try {
        return JSON.parse(line) as CapturedEmail;
      } catch {
        return null;
      }
    })
    .find((item) => item?.to === recipient && typeof item.body === 'string');
  const match = typeof captured?.body === 'string'
    ? captured.body.match(/https?:\/\/[^\s<]+/)
    : null;
  if (!match?.[0]) throw new Error(`No verification link was captured for ${recipient}`);
  return match[0].replaceAll('&amp;', '&');
}

async function createVerifiedCoordinator(context: BrowserContext, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const email = `coordinator-${randomUUID()}@example.test`;
  const password = `Kithwheel-${randomUUID()}-9a`;
  const response = await context.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'Synthetic Coordinator', email, password },
  });
  expect(response.status()).toBe(200);

  const verificationResponse = await context.request.get(findVerificationLink(email), { headers: { origin } });
  expect(verificationResponse.status()).toBeLessThan(400);
  const sessionResponse = await context.request.get('/api/auth/get-session', { headers: { origin } });
  const session = await sessionResponse.json() as { user?: { email?: string; emailVerified?: boolean } };
  expect(session.user?.email).toBe(email);
  expect(session.user?.emailVerified).toBe(true);
  return { context, email, origin };
}

test('coordinator composes, publishes, withdraws, and scopes a saved schedule', async ({ browser, page, baseURL }) => {
  const resolvedBaseURL = baseURL ?? process.env.BASE_URL ?? 'http://localhost:3000';
  const originalViewport = page.viewportSize();
  await page.goto('/');
  const contactLink = page.getByRole('link', { name: 'Get in touch' });
  await expect(contactLink).toHaveAttribute('href', 'mailto:kithwheel@polsia.app?subject=Hello%20Kithwheel');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  if (originalViewport?.width === 390) {
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(page.getByRole('link', { name: 'Get in touch' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contact Kithwheel' })).toBeVisible();
    await page.screenshot({ path: '/tmp/kithwheel-home-mobile-320.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.setViewportSize(originalViewport);
  }
  const coordinator = await createVerifiedCoordinator(page.context(), resolvedBaseURL);
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { name: 'Start with your co-op' })).toBeVisible();
  await page.getByLabel('Co-op name').fill('Cedar Grove Co-op');
  await page.getByRole('button', { name: 'Create co-op' }).click();
  await expect(page.getByRole('heading', { name: 'Schedule desk' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Cedar Grove Co-op' })).toBeAttached();

  const coopResponse = await coordinator.context.request.get('/api/coops');
  const coops = CoopList.parse(await coopResponse.json());
  const coop = coops.items[0];
  expect(coop).toBeDefined();
  if (!coop) throw new Error('The created co-op was not returned to its coordinator');

  await page.getByRole('button', { name: 'Add a class' }).click();
  await page.getByLabel('Class name').fill('Nature Lab');
  await page.getByLabel('Teacher, if supplied').fill('Riley Morgan');
  await page.getByLabel('Time, if supplied').fill('9:20 AM');
  await page.getByRole('button', { name: 'Create class' }).click();
  await expect(page.getByRole('button', { name: 'Edit Nature Lab' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Nature Lab' }).click();
  await page.getByLabel('Class name').fill('Garden Lab');
  await page.getByRole('button', { name: 'Save class details' }).click();
  await expect(page.getByRole('button', { name: 'Edit Garden Lab' })).toBeVisible();

  await page.getByRole('button', { name: 'Add a class' }).click();
  await page.getByLabel('Class name').fill('Number Circle');
  await page.getByRole('button', { name: 'Create class' }).click();
  await expect(page.getByRole('button', { name: 'Edit Number Circle' })).toBeVisible();

  await page.getByLabel('Schedule name').fill('Spring rotation plan');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { name: 'Spring rotation plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Add age-group rotation' }).click();
  await page.getByRole('button', { name: 'Add age-group rotation' }).click();

  const ageGroups = page.getByLabel('Age group');
  await ageGroups.nth(0).fill('Ages 6–9');
  await ageGroups.nth(1).fill('Ages 10–13');
  const classSelects = page.getByLabel('Add a class from this co-op');
  await classSelects.nth(0).selectOption({ label: 'Garden Lab' });
  await page.getByRole('button', { name: 'Add class', exact: true }).nth(0).click();
  await classSelects.nth(1).selectOption({ label: 'Number Circle' });
  await page.getByRole('button', { name: 'Add class', exact: true }).nth(1).click();

  await page.getByRole('button', { name: 'Move rotation 2 up' }).click();
  await page.getByRole('button', { name: 'Save arrangement' }).click();
  await expect(page.getByRole('heading', { name: '1. Ages 10–13' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2. Ages 6–9' })).toBeVisible();
  await expect(page.getByText('Teacher · Riley Morgan')).toBeVisible();
  await expect(page.getByText('9:20 AM', { exact: true })).toBeVisible();
  await expect(page.getByText(/Room ·/)).toHaveCount(0);

  const classesResponse = await coordinator.context.request.get(`/api/coops/${coop.id}/classes`);
  const classes = CoopClassList.parse(await classesResponse.json());
  expect(classes.items.map((item) => item.name)).toEqual(['Garden Lab', 'Number Circle']);
  const scheduleResponse = await coordinator.context.request.get(`/api/coops/${coop.id}/schedules`);
  const schedules = ScheduleList.parse(await scheduleResponse.json());
  const schedule = schedules.items.find((item) => item.title === 'Spring rotation plan');
  expect(schedule?.rotations.map((rotation) => rotation.ageGroup)).toEqual(['Ages 10–13', 'Ages 6–9']);
  expect(schedules.currentScheduleId).toBeNull();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Spring rotation plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. Ages 10–13' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Garden Lab' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish schedule' }).click();
  await expect(page.getByRole('region', { name: 'Current schedule' })).toContainText('Spring rotation plan');
  await expect(page.getByText('published', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByText('withdrawn', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current schedule' })).toContainText('No schedule is current for this co-op.');
  await page.reload();
  await expect(page.getByText('withdrawn', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current schedule' })).toContainText('No schedule is current for this co-op.');

  const savedScheduleResponse = await coordinator.context.request.get(`/api/coops/${coop.id}/schedules`);
  const savedSchedules = ScheduleList.parse(await savedScheduleResponse.json());
  const saved = savedSchedules.items.find((item) => item.id === schedule?.id);
  expect(saved?.status).toBe('withdrawn');
  expect(savedSchedules.currentScheduleId).toBeNull();

  const strangerContext = await browser.newContext({ baseURL: resolvedBaseURL });
  const stranger = await createVerifiedCoordinator(strangerContext, resolvedBaseURL);
  const strangerCoopsResponse = await stranger.context.request.get('/api/coops');
  expect(CoopList.parse(await strangerCoopsResponse.json()).items).toHaveLength(0);
  const [foreignClasses, foreignSchedules] = await Promise.all([
    stranger.context.request.get(`/api/coops/${coop.id}/classes`),
    stranger.context.request.get(`/api/coops/${coop.id}/schedules`),
  ]);
  expect([foreignClasses.status(), foreignSchedules.status()]).toEqual([403, 403]);

  const scheduleId = saved?.id;
  const classId = classes.items[0]?.id;
  if (!scheduleId || !classId) throw new Error('The saved schedule fixture is incomplete');
  const headers = { origin: stranger.origin };
  const forbiddenMutations = await Promise.all([
    stranger.context.request.post(`/api/coops/${coop.id}/schedules`, { headers, data: { title: 'Unauthorized draft' } }),
    stranger.context.request.patch(`/api/coops/${coop.id}/schedules/${scheduleId}`, { headers, data: { title: 'Changed by stranger' } }),
    stranger.context.request.post(`/api/coops/${coop.id}/schedules/${scheduleId}/publish`, { headers, data: {} }),
    stranger.context.request.post(`/api/coops/${coop.id}/schedules/${scheduleId}/withdraw`, { headers, data: {} }),
    stranger.context.request.post(`/api/coops/${coop.id}/classes`, { headers, data: { name: 'Unauthorized class' } }),
    stranger.context.request.patch(`/api/coops/${coop.id}/classes/${classId}`, { headers, data: { name: 'Changed by stranger' } }),
  ]);
  expect(forbiddenMutations.map((response) => response.status())).toEqual([403, 403, 403, 403, 403, 403]);

  const anonymous = await browser.newContext({ baseURL: resolvedBaseURL });
  const anonymousRead = await anonymous.request.get(`/api/coops/${coop.id}/schedules`);
  expect(anonymousRead.status()).toBe(401);
  await anonymous.close();

  const strangerPage = await stranger.context.newPage();
  await strangerPage.goto('/dashboard');
  await expect(strangerPage.getByRole('heading', { name: 'Start with your co-op' })).toBeVisible();
  await expect(strangerPage.getByRole('button', { name: 'Publish schedule' })).toHaveCount(0);
  await strangerPage.close();
  await stranger.context.close();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Spring rotation plan' })).toBeVisible();
  await expect(page.getByText('withdrawn', { exact: true }).first()).toBeVisible();
  if (originalViewport?.width === 390) {
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(page.getByRole('button', { name: 'Publish schedule' })).toBeVisible();
    await page.screenshot({ path: '/tmp/kithwheel-workspace-mobile-320.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.setViewportSize(originalViewport);
  }
  await page.screenshot({
    path: `/tmp/kithwheel-workspace-${test.info().project.name}.png`,
    fullPage: true,
  });
});
