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

test('a co-op runs grade sections, registration, placement, family pages, fees, hours, announcements and check-in', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const api = page.context().request;
  const lead = await coordinator(page.context(), 'Lead Coordinator');

  // Co-op (with its nine default sections), classes in two sections, both approved.
  const coop = (await json(api, 'POST', '/api/coops', { name: 'Maple Grove Test Co-op' })).body;
  const sectionList = (await json(api, 'GET', `/api/coops/${coop.id}/sections`)).body;
  const sectionId = (name: string) =>
    sectionList.items.find((item: { name: string }) => item.name === name).id as string;
  const kindergarten = sectionId('Kindergarten');
  const firstGrade = sectionId('1st grade');
  const art = (
    await json(api, 'POST', `/api/coops/${coop.id}/classes`, {
      sectionId: kindergarten,
      name: 'Art Studio',
      time: '9:00-9:50',
      room: 'Room 2',
      teacher: 'Ms. Rivera',
      feeCents: 1500,
      materials: 'Sketchbook, colored pencils',
    })
  ).body;
  await json(api, 'POST', `/api/coops/${coop.id}/classes`, {
    sectionId: kindergarten,
    name: 'Music Circle',
    time: '10:00-10:50',
  });
  await json(api, 'POST', `/api/coops/${coop.id}/classes`, {
    sectionId: firstGrade,
    name: 'Science Lab',
    time: '9:00-9:50',
  });
  for (const id of [kindergarten, firstGrade]) {
    expect(
      (await json(api, 'PATCH', `/api/coops/${coop.id}/sections/${id}`, { status: 'approved' }))
        .status,
    ).toBe(200);
  }

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
  // Families give a grade; they don't pick classes.
  await expect(familyPage.getByRole('checkbox', { name: /Art Studio/ })).toHaveCount(0);
  await familyPage.getByRole('combobox', { name: 'Grade' }).selectOption('Kindergarten');
  await familyPage.getByRole('button', { name: 'Register' }).last().click();
  await expect(familyPage.getByRole('heading', { name: 'You’re registered!' })).toBeVisible();
  await expect(
    familyPage.getByText('Your coordinators will place each child in their grade’s classes'),
  ).toBeVisible();
  const familyAUrl = linkIn(firstEmail, /https?:\/\/[^\s<]+\/f\/[A-Za-z0-9_-]+/);

  // A second family; a section id a family sends is ignored.
  const secondEmail = `family-b-${randomUUID()}@example.test`;
  const second = await json(
    familyContext.request,
    'POST',
    `/api/public/coops/${shareToken}/register`,
    {
      parentName: 'Blake Family',
      email: secondEmail,
      children: [{ name: 'Ben', grade: 'Kindergarten', sectionId: firstGrade }],
    },
  );
  expect(second.status).toBe(201);
  const familyBUrl = linkIn(secondEmail, /https?:\/\/[^\s<]+\/f\/[A-Za-z0-9_-]+/);
  const familyBToken = familyBUrl.split('/f/')[1] ?? '';

  // Registering the same email again doesn't duplicate the family.
  const repeat = await json(
    familyContext.request,
    'POST',
    `/api/public/coops/${shareToken}/register`,
    { parentName: 'Blake Family', email: secondEmail, children: [{ name: 'Ben' }] },
  );
  expect(repeat.body.status).toBe('already_registered');

  // Family pages show placement, but families can't change classes.
  await familyPage.goto(new URL(familyAUrl).pathname);
  await expect(familyPage.getByRole('heading', { name: 'Hi, Avery Family' })).toBeVisible();
  await expect(familyPage.getByText('Not placed in a section yet').first()).toBeVisible();
  await expect(familyPage.getByRole('button', { name: 'Drop class' })).toHaveCount(0);

  // The coordinator places everyone in the grade they signed up for.
  await page.goto(`/dashboard?coop=${coop.id}&tab=families`);
  await expect(page.getByRole('heading', { name: 'How families and classes work' })).toBeVisible();
  await expect(page.getByText('Not placed yet').first()).toBeVisible();
  await page.getByRole('button', { name: 'Place everyone in the grade they chose' }).click();
  await page.getByRole('button', { name: 'Place them' }).click();
  await expect(page.getByText('2 children placed')).toBeVisible();

  // A later sign-up: "Select all who signed up for Kindergarten", then move her to 1st grade.
  await json(familyContext.request, 'POST', `/api/public/coops/${shareToken}/register`, {
    parentName: 'Cole Family',
    email: `family-c-${randomUUID()}@example.test`,
    children: [{ name: 'Cora', grade: 'Kindergarten' }],
  });
  await page.reload();
  const placement = page.locator('section', {
    has: page.getByRole('heading', { name: 'Section placement' }),
  });
  await placement.getByRole('button', { name: /^Kindergarten/ }).click();
  const kSidebar = page.getByRole('complementary', { name: 'Who’s in Kindergarten' });
  await kSidebar
    .getByRole('button', { name: 'Select all who signed up for Kindergarten (1)' })
    .click();
  await kSidebar.getByRole('button', { name: 'Save 1 change' }).click();
  await expect(kSidebar.getByRole('button', { name: 'Saved' })).toBeVisible();
  await placement.getByRole('button', { name: /^1st grade/ }).click();
  const firstSidebar = page.getByRole('complementary', { name: 'Who’s in 1st grade' });
  await firstSidebar.getByText('Move a child from another section').click();
  await firstSidebar.getByRole('checkbox', { name: /Cora/ }).check();
  await firstSidebar.getByRole('button', { name: 'Save 1 change' }).click();
  await expect(firstSidebar.getByRole('button', { name: 'Saved' })).toBeVisible();

  // Case-by-case: Ann takes Science Lab from 1st grade (clashes with Art), then skips Art.
  const avery = page.locator('details', { hasText: 'Avery Family' }).last();
  await avery.locator('summary').click();
  await avery
    .getByRole('combobox', { name: 'Add a class from another section for Ann' })
    .selectOption({ label: 'Science Lab (9:00-9:50)' });
  await avery.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(avery.getByText('Time clash: Art Studio and Science Lab')).toBeVisible();
  await avery
    .locator('li', { hasText: 'Art Studio' })
    .getByRole('button', { name: 'Skip this class' })
    .click();
  await expect(avery.getByText('skipped for this child')).toBeVisible();
  await expect(avery.getByText('Time clash')).toHaveCount(0);

  const placed = await json(api, 'GET', `/api/coops/${coop.id}/families`);
  const kids = Object.fromEntries(
    placed.body.families.flatMap(
      (family: {
        children: { name: string; sectionName: string; classes: { className: string }[] }[];
      }) =>
        family.children.map((child) => [
          child.name,
          `${child.sectionName}: ${child.classes.map((item) => item.className).join(', ')}`,
        ]),
    ),
  );
  expect(kids.Ann).toBe('Kindergarten: Music Circle, Science Lab');
  expect(kids.Ben).toBe('Kindergarten: Art Studio, Music Circle');
  expect(kids.Cora).toBe('1st grade: Science Lab');

  // Ann's family page shows her schedule, with the class from 1st grade marked.
  await familyPage.goto(new URL(familyAUrl).pathname);
  await expect(familyPage.getByText('From 1st grade')).toBeVisible();
  await expect(familyPage.getByText('Science Lab').first()).toBeVisible();

  // Family B logs volunteer hours from their page.
  await familyPage.goto(`/f/${familyBToken}`);
  await expect(familyPage.getByText('Art Studio').first()).toBeVisible();
  await familyPage.getByRole('textbox', { name: 'Hours' }).fill('2.5');
  await familyPage.getByLabel('What you did').fill('Set-up crew');
  await familyPage.getByRole('button', { name: 'Log hours' }).click();
  await expect(
    familyPage.getByText('2.5 hours waiting for approval', { exact: false }),
  ).toBeVisible();

  // Coordinator workspace: approve hours, record a payment, send an announcement.
  await page.goto(`/dashboard?coop=${coop.id}&tab=volunteer`);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
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
  await page.getByLabel('Send to').selectOption({ label: 'Families taking Art Studio' });
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
  await expect(
    page.getByText('Checked in', { exact: true }).locator('..').getByText('2', { exact: true }),
  ).toBeVisible();

  // Spreadsheet import into a section.
  await page.getByRole('button', { name: 'Schedules', exact: true }).click();
  await page.getByRole('button', { name: 'Import from a spreadsheet' }).click();
  await page
    .getByLabel('Or paste here')
    .fill('Section,Name,Teacher,Seats,Fee\n1st grade,Nature Walk,Mr. Lee,8,10\n,Chess Club,,,');
  await page.getByRole('button', { name: 'Import 2 classes' }).click();
  await expect(page.getByRole('button', { name: 'Edit Chess Club' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Grade sections' })
    .getByRole('button', { name: /^1st grade/ })
    .click();
  await expect(page.getByRole('button', { name: 'Edit Nature Walk' })).toBeVisible();

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
      children: [{ name: 'Lou', grade: 'Kindergarten' }],
    },
  );
  expect(closed.status).toBe(409);
  expect(
    (await json(familyContext.request, 'POST', `/api/public/coops/${shareToken}/register`, {}))
      .status,
  ).not.toBe(201);
  // Families can't enroll themselves, and strangers can't change a roster.
  const selfEnroll = await json(
    familyContext.request,
    'POST',
    `/api/public/families/${familyBToken}/enrollments`,
    { childId: 'x', classId: art.id },
  );
  expect(selfEnroll.status).toBeGreaterThanOrEqual(400);
  expect(
    (
      await json(
        strangerContext.request,
        'PUT',
        `/api/coops/${coop.id}/sections/${kindergarten}/children`,
        {
          childIds: [],
        },
      )
    ).status,
  ).toBe(403);

  await helperContext.close();
  await strangerContext.close();
  await familyContext.close();
  void lead;
});
