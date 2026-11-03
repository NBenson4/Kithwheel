// Grade sections: each section's schedule, approval, ordering, and what families see.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, test } from '@playwright/test';
import { CoopList, SectionList } from '@/lib/contracts/coops';

type CapturedEmail = { to?: unknown; body?: unknown };
const emailCapturePath = '/tmp/kithwheel-email-capture.jsonl';
const origin = 'http://localhost:3000';

test.use({ actionTimeout: 15_000 });

function verificationLink(recipient: string) {
  const captured = readFileSync(emailCapturePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CapturedEmail)
    .find((item) => item.to === recipient && typeof item.body === 'string');
  const match =
    typeof captured?.body === 'string' ? captured.body.match(/https?:\/\/[^\s<]+/) : null;
  if (!match?.[0]) throw new Error(`No verification link was captured for ${recipient}`);
  return match[0].replaceAll('&amp;', '&');
}

async function coordinator(context: BrowserContext) {
  const email = `coordinator-${randomUUID()}@example.test`;
  const password = `Kithwheel-${randomUUID()}-9a`;
  const response = await context.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'Section Coordinator', email, password },
  });
  expect(response.status()).toBe(200);
  expect(
    (await context.request.get(verificationLink(email), { headers: { origin } })).status(),
  ).toBeLessThan(400);
}

test('landing page links work, including at 320px wide', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Get in touch' })).toHaveAttribute(
    'href',
    'mailto:hello@kithwheel.org?subject=Hello%20Kithwheel',
  );
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByRole('link', { name: 'Contact Kithwheel' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('coordinator builds and approves grade-section schedules that families can see', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  await coordinator(page.context());
  await page.goto('/dashboard');
  await page.getByLabel('Co-op name').fill('Cedar Grove Co-op');
  await page.getByRole('button', { name: 'Create co-op' }).click();

  // Nine default sections, Pre-K first.
  const nav = page.getByRole('navigation', { name: 'Grade sections' });
  for (const name of [
    'Pre-K',
    'Kindergarten',
    '1st grade',
    '5th grade',
    '6th–7th grade',
    '8th–12th grade',
  ]) {
    await expect(nav.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(page.getByText('No classes in Pre-K yet. Add the first one below.')).toBeVisible();

  // Build 2nd grade's schedule.
  await nav.getByRole('button', { name: /^2nd grade/ }).click();
  await expect(page.getByRole('heading', { name: '2nd grade schedule' })).toBeVisible();
  for (const [name, time] of [
    ['Math', '9:00-9:50'],
    ['Reading', '10:00-10:50'],
  ]) {
    await page.getByRole('button', { name: 'Add a class to 2nd grade' }).click();
    await page.getByLabel('Class name').fill(name as string);
    await page.getByLabel('Time (e.g. 9:00-9:50)').fill(time as string);
    await page.getByLabel('Teacher').fill('Ms. Erin');
    await page.getByRole('button', { name: 'Add class', exact: true }).click();
    await expect(page.getByRole('button', { name: `Edit ${name}` })).toBeVisible();
  }
  // Reorder: Reading first.
  await page.getByRole('button', { name: 'Move Reading up' }).click();
  await expect(page.locator('ol li').first()).toContainText('Reading');

  // Draft until approved.
  await expect(page.getByText('Draft. Families can’t see it until you approve it.')).toBeVisible();
  await page.getByRole('button', { name: 'Approve schedule' }).click();
  await expect(page.getByText(/^Approved .*Families can see it\./)).toBeVisible();
  await expect(nav.getByRole('button', { name: /^2nd grade/ })).toContainText('Approved');

  // 3rd grade gets a class but stays a draft.
  await nav.getByRole('button', { name: /^3rd grade/ }).click();
  await page.getByRole('button', { name: 'Add a class to 3rd grade' }).click();
  await page.getByLabel('Class name').fill('Fractions');
  await page.getByRole('button', { name: 'Add class', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Fractions' })).toBeVisible();

  // Sections are adjustable: add one, then remove it while it's empty.
  await page.getByText('Add a section').click();
  await page.getByLabel('Section name', { exact: true }).fill('Teen electives');
  await page.getByRole('button', { name: 'Add section' }).click();
  await nav.getByRole('button', { name: /^Teen electives/ }).click();
  await page.getByText('Section settings').click();
  await page.getByRole('button', { name: 'Remove section' }).click();
  await page.getByRole('button', { name: 'Yes, remove Teen electives' }).click();
  await expect(nav.getByRole('button', { name: /^Teen electives/ })).toHaveCount(0);

  // A section with classes can't be removed.
  const coop = CoopList.parse(await (await page.context().request.get('/api/coops')).json())
    .items[0];
  if (!coop) throw new Error('Co-op missing');
  const sections = SectionList.parse(
    await (await page.context().request.get(`/api/coops/${coop.id}/sections`)).json(),
  );
  const second = sections.items.find((item) => item.name === '2nd grade');
  if (!second) throw new Error('2nd grade missing');
  const refused = await page
    .context()
    .request.delete(`/api/coops/${coop.id}/sections/${second.id}`, {
      headers: { origin },
    });
  expect(refused.status()).toBe(409);
  expect(second.classes.map((item) => item.name)).toEqual(['Reading', 'Math']);

  // Families see approved sections only.
  const share = await page
    .context()
    .request.post(`/api/coops/${coop.id}/share`, { headers: { origin } });
  const shareUrl = ((await share.json()) as { shareUrl: string }).shareUrl;
  const family = await browser.newContext();
  const familyPage = await family.newPage();
  await familyPage.goto(new URL(shareUrl).pathname);
  await expect(familyPage.getByRole('heading', { name: 'Schedules by grade' })).toBeVisible();
  await expect(familyPage.getByText('2nd grade', { exact: true })).toBeVisible();
  await expect(familyPage.getByText('Reading')).toBeVisible();
  await expect(familyPage.getByText('Fractions')).toHaveCount(0);

  // Moving a class to another section.
  await nav.getByRole('button', { name: /^2nd grade/ }).click();
  await page.getByRole('button', { name: 'Edit Math' }).click();
  await page
    .getByRole('combobox', { name: 'Section', exact: true })
    .selectOption({ label: '3rd grade' });
  await page.getByRole('button', { name: 'Save class' }).click();
  await expect(page.getByRole('button', { name: 'Edit Math' })).toHaveCount(0);
  await nav.getByRole('button', { name: /^3rd grade/ }).click();
  await expect(page.getByRole('button', { name: 'Edit Math' })).toBeVisible();

  // Phone width: no sideways scrolling on the Schedules tab.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await family.close();
});
