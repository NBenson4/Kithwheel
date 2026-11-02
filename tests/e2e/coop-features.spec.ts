// Families, registration, waitlists, family pages, fees, hours, announcements,
// co-coordinators, calendar feed and the check-in tablet, end to end.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type APIRequestContext, type BrowserContext, expect, test } from '@playwright/test';

type CapturedEmail = { to?: string; subject?: string; body?: string };
const emailCapturePath = '/tmp/kithwheel-email-capture.jsonl';

test.use({ actionTimeout: 15_000 });

function emails(): CapturedEmail[] {
  try {
    return readFileSync(emailCapturePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedEmail);
  } catch {
    return [];
  }
}

function linkIn(recipient: string, pattern: RegExp, subject?: RegExp) {
  const found = emails()
    .reverse()
    .find(
      (item) =>
        item.to === recipient &&
        (!subject || subject.test(item.subject ?? '')) &&
        pattern.test(item.body ?? ''),
    );
  const match = found?.body?.match(pattern);
  if (!match?.[0]) throw new Error(`No email matching ${pattern} for ${recipient}`);
  return match[0].replaceAll('&amp;', '&');
}

async function coordinator(context: BrowserContext, name = 'Synthetic Coordinator') {
  const email = `coordinator-${randomUUID()}@example.test`;
  const password = `Kithwheel-${randomUUID()}-9a`;
  const origin = 'http://localhost:3000';
  const response = await context.request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name, email, password },
  });
  expect(response.status()).toBe(200);
  const verify = linkIn(email, /https?:\/\/[^\s<]+verify[^\s<]*/);
  expect((await context.request.get(verify, { headers: { origin } })).status()).toBeLessThan(400);
  return { email, origin };
}

async function json(request: APIRequestContext, method: string, path: string, data?: unknown) {
  const response = await request.fetch(path, {
    method,
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    data: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status(), body };
}

test('a co-op runs registration, waitlists, family pages, fees, hours, announcements and check-in', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const api = page.context().request;
  const lead = await coordinator(page.context(), 'Lead Coordinator');

  // Co-op, classes (one with a single seat), and a published schedule.
  const coop = (await json(api, 'POST', '/api/coops', { name: 'Maple Grove Test Co-op' })).body;
  const art = (
    await json(api, 'POST', `/api/coops/${coop.id}/classes`, {
      name: 'Art Studio',
      time: '9:00-9:50',
      room: 'Room 2',
      teacher: 'Ms. Rivera',
      capacity: 1,
      feeCents: 1500,
      materials: 'Sketchbook, colored pencils',
    })
  ).body;
  const music = (
    await json(api, 'POST', `/api/coops/${coop.id}/classes`, {
      name: 'Music Circle',
      time: '10:00-10:50',
    })
  ).body;
  const created = await json(api, 'POST', `/api/coops/${coop.id}/schedules`, {
    title: 'Spring 2027',
  });
  const scheduleId = created.body.items[0].id;
  expect(
    (
      await json(api, 'PATCH', `/api/coops/${coop.id}/schedules/${scheduleId}`, {
        rotations: [{ ageGroup: 'Ages 5-7', classIds: [art.id, music.id] }],
      })
    ).status,
  ).toBe(200);
  expect(
    (await json(api, 'POST', `/api/coops/${coop.id}/schedules/${scheduleId}/publish`, {})).status,
  ).toBe(200);

  // Settings: family link, calendar, fees, volunteer requirement, registration.
  const share = await json(api, 'POST', `/api/coops/${coop.id}/share`, {});
  const shareUrl: string = share.body.shareUrl;
  const shareToken = shareUrl.split('/c/')[1] ?? '';
  const settings = await json(api, 'PATCH', `/api/coops/${coop.id}/settings`, {
    meetingDay: 2,
    termStart: '2027-01-04',
    termEnd: '2027-05-11',
    familyFeeCents: 5000,
    childFeeCents: 2000,
    volunteerMinutesRequired: 600,
    paymentInstructions: 'Venmo @maple-grove-test',
    registrationOpen: true,
  });
  expect(settings.status).toBe(200);
  expect(settings.body.registrationOpen).toBe(true);

  // Calendar feed.
  const ics = await api.get(`/api/public/coops/${shareToken}/calendar.ics`);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  const icsText = await ics.text();
  expect(icsText).toContain('SUMMARY:Art Studio');
  expect(icsText).toContain('DTSTART;TZID=America/New_York:20270105T090000');

  // A family registers through the family link in a fresh browser (no account).
  const familyContext = await browser.newContext();
  const familyPage = await familyContext.newPage();
  await familyPage.goto(`/c/${shareToken}`);
  await expect(familyPage.getByRole('heading', { name: 'Maple Grove Test Co-op' })).toBeVisible();
  await expect(familyPage.getByText('Sketchbook, colored pencils').first()).toBeVisible();
  await expect(familyPage.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
  const firstEmail = `family-a-${randomUUID()}@example.test`;
  await familyPage.getByLabel('Parent or guardian name').fill('Avery Family');
  await familyPage.getByLabel('Email').fill(firstEmail);
  await familyPage.getByLabel('Name', { exact: true }).fill('Ann');
  await familyPage.getByRole('checkbox', { name: /Art Studio/ }).check();
  await familyPage.getByRole('button', { name: 'Register' }).last().click();
  await expect(familyPage.getByRole('heading', { name: 'You’re registered!' })).toBeVisible();
  await expect(familyPage.getByText('Ann: Art Studio')).toBeVisible();
  const familyAUrl = linkIn(firstEmail, /https?:\/\/[^\s<]+\/f\/[A-Za-z0-9_-]+/);

  // A second family wants the same one-seat class and lands on the waitlist.
  const secondEmail = `family-b-${randomUUID()}@example.test`;
  const second = await json(
    familyContext.request,
    'POST',
    `/api/public/coops/${shareToken}/register`,
    {
      parentName: 'Blake Family',
      email: secondEmail,
      children: [{ name: 'Ben', ageGroup: 'Ages 5-7', classIds: [art.id, music.id] }],
    },
  );
  expect(second.status).toBe(201);
  expect(second.body.waitlisted).toEqual([{ childName: 'Ben', className: 'Art Studio' }]);
  const familyBUrl = linkIn(secondEmail, /https?:\/\/[^\s<]+\/f\/[A-Za-z0-9_-]+/);
  const familyBToken = familyBUrl.split('/f/')[1] ?? '';

  // Registering the same email again doesn't duplicate the family.
  const repeat = await json(
    familyContext.request,
    'POST',
    `/api/public/coops/${shareToken}/register`,
    {
      parentName: 'Blake Family',
      email: secondEmail,
      children: [{ name: 'Ben', classIds: [music.id] }],
    },
  );
  expect(repeat.body.status).toBe('already_registered');

  // Family A drops Art; Ben moves off the waitlist and is emailed.
  await familyPage.goto(new URL(familyAUrl).pathname);
  await expect(familyPage.getByRole('heading', { name: 'Hi, Avery Family' })).toBeVisible();
  await familyPage.getByRole('button', { name: 'Drop class' }).click();
  await familyPage.getByRole('button', { name: 'Yes, drop it' }).click();
  await expect(familyPage.getByText('No classes yet.')).toBeVisible();
  await expect
    .poll(() =>
      emails().some((item) => item.to === secondEmail && /A seat opened/.test(item.subject ?? '')),
    )
    .toBe(true);

  // Family B logs volunteer hours from their page.
  await familyPage.goto(`/f/${familyBToken}`);
  await expect(familyPage.getByText('Enrolled').first()).toBeVisible();
  await familyPage.getByRole('textbox', { name: 'Hours' }).fill('2.5');
  await familyPage.getByLabel('What you did').fill('Set-up crew');
  await familyPage.getByRole('button', { name: 'Log hours' }).click();
  await expect(
    familyPage.getByText('2.5 hours waiting for approval', { exact: false }),
  ).toBeVisible();

  // Coordinator workspace: approve hours, record a payment, send an announcement.
  await page.goto(`/dashboard?coop=${coop.id}&tab=volunteer`);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Nothing waiting.')).toBeVisible();

  await page.getByRole('button', { name: 'Fees', exact: true }).click();
  await page.getByText('Blake Family').click();
  // $50 family + $20 child + $15 Art = $85
  await expect(page.getByText('$85.00 due')).toBeVisible();
  const blake = page.locator('details', { hasText: 'Blake Family' });
  await blake.getByLabel('Amount ($)').first().fill('85');
  await blake.getByRole('button', { name: 'Record payment' }).click();
  await expect(blake.getByText('Paid up')).toBeVisible();

  await page.getByRole('button', { name: 'Announcements', exact: true }).click();
  await page.getByLabel('Send to').selectOption({ label: 'Families in Art Studio' });
  await page.getByLabel('Subject').fill('Bring smocks');
  await page.getByLabel('Message').fill('Please send a smock on Tuesday.');
  await page.getByRole('button', { name: 'Send announcement' }).click();
  await page.getByRole('button', { name: 'Yes, send it' }).click();
  await expect(page.getByText('1 emailed')).toBeVisible();
  expect(
    emails().some((item) => item.to === secondEmail && /Bring smocks/.test(item.subject ?? '')),
  ).toBe(true);
  expect(
    emails().some((item) => item.to === firstEmail && /Bring smocks/.test(item.subject ?? '')),
  ).toBe(false);

  // Family B sees the announcement, the payment and approved hours.
  await familyPage.goto(`/f/${familyBToken}`);
  await expect(familyPage.getByText('Bring smocks')).toBeVisible();
  await expect(familyPage.getByText('2.5 hours approved of 10 hours')).toBeVisible();
  await expect(familyPage.getByText('Venmo @maple-grove-test')).toBeVisible();

  // Check-in: create the tablet link, check Ben in on the tablet, see it in the workspace.
  await page.getByRole('button', { name: 'Check-in', exact: true }).click();
  await page.getByRole('button', { name: 'Create tablet link' }).click();
  const kioskUrl = (await page.locator('[title*="/k/"]').first().getAttribute('title')) ?? '';
  const kioskPage = await familyContext.newPage();
  await kioskPage.goto(new URL(kioskUrl).pathname);
  await kioskPage.getByRole('button', { name: /Ben/ }).click();
  await expect(kioskPage.getByText(/Here since/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/in .*\(tablet\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Check in' }).first().click();
  await expect(page.getByText('Not marked yet').locator('..').getByText('0')).toBeVisible();

  // Spreadsheet import and copying a schedule.
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Import from a spreadsheet' }).click();
  await page
    .getByLabel('Or paste here')
    .fill('Name,Teacher,Seats,Fee\nNature Walk,Mr. Lee,8,10\nChess Club,,,');
  await page.getByRole('button', { name: 'Import 2 classes' }).click();
  await expect(page.getByRole('button', { name: 'Edit Nature Walk' })).toBeVisible();
  await page.getByRole('button', { name: /Copy “Spring 2027” to a new draft/ }).click();
  await expect(page.getByText('Spring 2027 (copy)').first()).toBeVisible();

  // Co-coordinator invitation.
  await page.getByRole('button', { name: 'Settings & team' }).click();
  const helperContext = await browser.newContext();
  const helper = await coordinator(helperContext, 'Helper Coordinator');
  await page.getByLabel('Invite a co-coordinator by email').fill(helper.email);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(helper.email, { exact: true })).toBeVisible();
  const inviteUrl = linkIn(helper.email, /https?:\/\/[^\s<]+\/invite\/[A-Za-z0-9_-]+/);
  const helperPage = await helperContext.newPage();
  await helperPage.goto(new URL(inviteUrl).pathname);
  await helperPage.getByRole('button', { name: 'Join Maple Grove Test Co-op' }).click();
  await helperPage.waitForURL(/\/dashboard/);
  const helperCoops = await json(helperContext.request, 'GET', '/api/coops');
  expect(helperCoops.body.items.map((item: { id: string }) => item.id)).toContain(coop.id);
  expect((await json(helperContext.request, 'GET', `/api/coops/${coop.id}/families`)).status).toBe(
    200,
  );

  // Boundaries: a stranger coordinator, bad links, closed registration.
  const strangerContext = await browser.newContext();
  await coordinator(strangerContext, 'Stranger');
  expect(
    (await json(strangerContext.request, 'GET', `/api/coops/${coop.id}/families`)).status,
  ).toBe(403);
  expect(
    (
      await json(strangerContext.request, 'POST', `/api/coops/${coop.id}/announcements`, {
        title: 'x',
        body: 'y',
      })
    ).status,
  ).toBe(403);
  expect(
    (await json(strangerContext.request, 'GET', `/api/public/families/${'x'.repeat(43)}`)).status,
  ).toBe(404);
  await json(api, 'PATCH', `/api/coops/${coop.id}/settings`, { registrationOpen: false });
  const closed = await json(
    familyContext.request,
    'POST',
    `/api/public/coops/${shareToken}/register`,
    {
      parentName: 'Late Family',
      email: `late-${randomUUID()}@example.test`,
      children: [{ name: 'Lou', classIds: [music.id] }],
    },
  );
  expect(closed.status).toBe(409);
  expect(
    (await json(familyContext.request, 'POST', `/api/public/coops/${shareToken}/register`, {}))
      .status,
  ).not.toBe(201);
  // A family link can't drop another family's class.
  const homeB = await json(familyContext.request, 'GET', `/api/public/families/${familyBToken}`);
  const familyAToken = new URL(familyAUrl).pathname.split('/f/')[1] ?? '';
  const benEnrollment = homeB.body.children[0].enrollments[0].id;
  expect(
    (
      await json(
        familyContext.request,
        'DELETE',
        `/api/public/families/${familyAToken}/enrollments/${benEnrollment}`,
      )
    ).status,
  ).toBe(404);

  await helperContext.close();
  await strangerContext.close();
  await familyContext.close();
  void lead;
});
