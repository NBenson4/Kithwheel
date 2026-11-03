// Coordinator account, recovery, and workspace access journey.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { CoopClassList, CoopClassRecord, CoopList, SectionList } from '@/lib/contracts/coops';

const prisma = new PrismaClient();
const emailCapturePath = '/tmp/kithwheel-email-capture.jsonl';
const passwordResetSubject = 'Reset your Kithwheel password';

type CapturedEmail = {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  html?: unknown;
};

function latestResetLink(recipient: string) {
  const entries = readFileSync(emailCapturePath, 'utf8').split('\n').filter(Boolean);
  for (const entry of entries.reverse()) {
    let captured: CapturedEmail | null = null;
    try {
      captured = JSON.parse(entry) as CapturedEmail;
    } catch {
      continue;
    }
    if (captured?.to !== recipient || captured.subject !== passwordResetSubject) continue;
    const content = [captured.body, captured.html]
      .filter((item) => typeof item === 'string')
      .join('\n');
    const match = content.match(/https?:\/\/[^\s<>"']+/);
    if (match?.[0]) return match[0].replaceAll('&amp;', '&');
  }
  throw new Error(`No password reset email was captured for ${recipient}`);
}

function tokenFromResetLink(link: string) {
  const token = new URL(link).pathname.split('/').filter(Boolean).at(-1);
  if (!token) throw new Error('The captured password reset link did not contain a token');
  return token;
}

async function submitSignIn(
  request: APIRequestContext,
  origin: string,
  email: string,
  password: string,
) {
  let response = await request.post('/api/auth/sign-in/email', {
    headers: { origin },
    data: { email, password },
  });
  for (let attempt = 0; response.status() === 429 && attempt < 2; attempt += 1) {
    const retryAfter = Number(response.headers()['x-retry-after']) || 10;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    response = await request.post('/api/auth/sign-in/email', {
      headers: { origin },
      data: { email, password },
    });
  }
  return response;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('a coordinator signs up, creates a private workspace, uses Account, signs out, and returns', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? process.env.BASE_URL ?? 'http://localhost:3000').origin;
  const email = `coordinator-${randomUUID()}@example.test`;
  const password = `Kithwheel-${randomUUID()}-9a`;

  await page.goto('/');
  await expect(page.locator('#hero-title')).toContainText('A co-op week,');
  await expect(page.locator('#toolkit-title')).toContainText('The details that make');
  await expect(page.locator('#together-title')).toContainText('More room for the');
  await expect(page.locator('#contact-title')).toHaveText('Tell us about your co-op.');
  await expect(page.locator('.kw-header')).toHaveCount(1);
  await expect(page.locator('.kw-footer')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(
    page.getByText(/separate from any fees families may pay their co-op/i),
  ).toBeVisible();

  await page.getByLabel('Name').fill('Cedar Grove Coordinator');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const signedUpSession = await page.request.get('/api/auth/get-session', { headers: { origin } });
  const signedUpBody = (await signedUpSession.json()) as {
    user?: { email?: string; emailVerified?: boolean };
  };
  expect(signedUpBody.user?.email).toBe(email);
  expect(signedUpBody.user?.emailVerified).toBe(false);

  await expect(page.getByRole('heading', { name: 'Start with your co-op' })).toBeVisible();

  await page.getByLabel('Co-op name').fill('Cedar Grove Co-op');
  await page.getByRole('button', { name: 'Create co-op' }).click();
  await expect(page.getByRole('heading', { name: 'Co-op workspace' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Cedar Grove Co-op' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await expect(page.locator('.kw-product-header')).toHaveCSS('position', 'sticky');

  await page.setViewportSize({ width: 1440, height: 900 });
  const productNav = page.getByRole('navigation', { name: 'Product navigation' });
  await expect(productNav.getByRole('link')).toHaveCount(2);
  await expect(productNav.getByRole('link', { name: 'Workspace' })).toBeVisible();
  await expect(productNav.getByRole('link', { name: 'Account' })).toBeVisible();

  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 844 });
  const menuButton = page.getByRole('button', { name: 'Open product navigation' });
  await expect(menuButton).toBeVisible();
  await menuButton.focus();
  await page.keyboard.press('Enter');
  const mobileNavigation = page.getByRole('dialog').getByRole('navigation', {
    name: 'Product navigation',
  });
  await expect(mobileNavigation.getByRole('link')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await menuButton.click();
  await mobileNavigation.getByRole('link', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(/does not collect or represent any fees/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin area' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.getByRole('button', { name: 'Open product navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Co-op workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Open product navigation' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();

  if (originalViewport) await page.setViewportSize(originalViewport);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  const signedOutSession = await page.request.get('/api/auth/get-session', { headers: { origin } });
  expect(await signedOutSession.json()).toBeNull();
  expect((await page.request.get('/api/coops')).status()).toBe(401);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('option', { name: 'Cedar Grove Co-op' })).toBeAttached();
  await page
    .getByRole('navigation', { name: 'Product navigation' })
    .getByRole('link', { name: 'Account' })
    .click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
});

test('a second authenticated coordinator cannot read or change another coordinator’s workspace', async ({
  browser,
  page,
  baseURL,
}) => {
  const resolvedBaseURL = baseURL ?? process.env.BASE_URL ?? 'http://localhost:3000';
  const origin = new URL(resolvedBaseURL).origin;
  const ownerEmail = `workspace-owner-${randomUUID()}@example.test`;
  const ownerPassword = `Kithwheel-${randomUUID()}-9a`;
  const secondEmail = `workspace-second-${randomUUID()}@example.test`;
  const secondPassword = `Kithwheel-${randomUUID()}-9a`;
  const workspaceName = `Private Co-op ${randomUUID().slice(0, 8)}`;
  const secondContext = await browser.newContext({ baseURL: resolvedBaseURL });

  try {
    await page.goto('/signup');
    await page.getByLabel('Name').fill('Workspace Owner Coordinator');
    await page.getByLabel('Email address').fill(ownerEmail);
    await page.getByLabel('Password').fill(ownerPassword);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByLabel('Co-op name').fill(workspaceName);
    await page.getByRole('button', { name: 'Create co-op' }).click();
    await expect(page.getByRole('heading', { name: 'Co-op workspace' })).toBeVisible();
    await expect(page.getByRole('option', { name: workspaceName })).toBeAttached();

    const ownerSessionResponse = await page.request.get('/api/auth/get-session', {
      headers: { origin },
    });
    const ownerSession = (await ownerSessionResponse.json()) as {
      user?: { id?: string; email?: string };
    };
    expect(ownerSession.user?.email).toBe(ownerEmail);
    const ownerUserId = ownerSession.user?.id;
    if (!ownerUserId) throw new Error('The workspace owner session was not established');

    const ownerWorkspacesResponse = await page.request.get('/api/coops', { headers: { origin } });
    const ownerWorkspaces = CoopList.parse(await ownerWorkspacesResponse.json());
    expect(ownerWorkspaces.items).toHaveLength(1);
    const workspace = ownerWorkspaces.items[0];
    if (!workspace) throw new Error('The owner workspace was not returned');
    expect(workspace.name).toBe(workspaceName);

    const sectionsResponse = await page.request.get(`/api/coops/${workspace.id}/sections`, {
      headers: { origin },
    });
    const ownerSections = SectionList.parse(await sectionsResponse.json());
    expect(ownerSections.items.map((item) => item.name)).toEqual([
      'Pre-K',
      'Kindergarten',
      '1st grade',
      '2nd grade',
      '3rd grade',
      '4th grade',
      '5th grade',
      '6th–7th grade',
      '8th–12th grade',
    ]);
    const ownerSection = ownerSections.items[3];
    if (!ownerSection) throw new Error('The owner section fixture was not returned');

    const classCreation = await page.request.post(`/api/coops/${workspace.id}/classes`, {
      headers: { origin },
      data: { name: 'Owner-only class record', sectionId: ownerSection.id },
    });
    expect(classCreation.status()).toBe(201);
    const ownerClass = CoopClassRecord.parse(await classCreation.json());

    const ownerClassesBeforeResponse = await page.request.get(
      `/api/coops/${workspace.id}/classes`,
      { headers: { origin } },
    );
    const ownerClassesBefore = CoopClassList.parse(await ownerClassesBeforeResponse.json());
    expect(ownerClassesBefore.items).toEqual([ownerClass]);

    const secondSignup = await secondContext.request.post('/api/auth/sign-up/email', {
      headers: { origin },
      data: { name: 'Second Coordinator', email: secondEmail, password: secondPassword },
    });
    expect(secondSignup.status()).toBe(200);
    const secondSessionResponse = await secondContext.request.get('/api/auth/get-session', {
      headers: { origin },
    });
    const secondSession = (await secondSessionResponse.json()) as {
      user?: { id?: string; email?: string };
    };
    expect(secondSession.user?.email).toBe(secondEmail);
    const secondUserId = secondSession.user?.id;
    expect(secondUserId).toBeTruthy();
    expect(secondUserId).not.toBe(ownerUserId);

    const secondWorkspaceListResponse = await secondContext.request.get('/api/coops', {
      headers: { origin },
    });
    expect(CoopList.parse(await secondWorkspaceListResponse.json()).items).toEqual([]);

    const foreignReads = await Promise.all([
      secondContext.request.get(`/api/coops/${workspace.id}/classes`, { headers: { origin } }),
      secondContext.request.get(`/api/coops/${workspace.id}/sections`, { headers: { origin } }),
    ]);
    expect(foreignReads.map((response) => response.status())).toEqual([403, 403]);

    const foreignMutations = await Promise.all([
      secondContext.request.post(`/api/coops/${workspace.id}/classes`, {
        headers: { origin },
        data: { name: 'Unauthorized class', sectionId: ownerSection.id },
      }),
      secondContext.request.patch(`/api/coops/${workspace.id}/classes/${ownerClass.id}`, {
        headers: { origin },
        data: { name: 'Changed by second coordinator' },
      }),
      secondContext.request.post(`/api/coops/${workspace.id}/sections`, {
        headers: { origin },
        data: { name: 'Unauthorized section' },
      }),
      secondContext.request.patch(`/api/coops/${workspace.id}/sections/${ownerSection.id}`, {
        headers: { origin },
        data: { name: 'Changed by second coordinator' },
      }),
      secondContext.request.patch(`/api/coops/${workspace.id}/sections/${ownerSection.id}`, {
        headers: { origin },
        data: { status: 'approved' },
      }),
    ]);
    expect(foreignMutations.map((response) => response.status())).toEqual([
      403, 403, 403, 403, 403,
    ]);

    const [ownerClassesAfterResponse, ownerSectionsAfterResponse] = await Promise.all([
      page.request.get(`/api/coops/${workspace.id}/classes`, { headers: { origin } }),
      page.request.get(`/api/coops/${workspace.id}/sections`, { headers: { origin } }),
    ]);
    const ownerClassesAfter = CoopClassList.parse(await ownerClassesAfterResponse.json());
    const ownerSectionsAfter = SectionList.parse(await ownerSectionsAfterResponse.json());
    expect(ownerClassesAfter).toEqual(ownerClassesBefore);
    expect(ownerClassesAfter.items.map((item) => item.name)).toEqual(['Owner-only class record']);
    expect(ownerSectionsAfter.items).toHaveLength(9);
    const sectionAfter = ownerSectionsAfter.items.find((item) => item.id === ownerSection.id);
    expect(sectionAfter?.name).toBe('2nd grade');
    expect(sectionAfter?.status).toBe('draft');
  } finally {
    await secondContext.close();
  }
});

test('Workspace explains denied record reads and recovers when ownership is restored', async ({
  page,
}) => {
  const email = `workspace-retry-${randomUUID()}@example.test`;
  const password = `Kithwheel-${randomUUID()}-9a`;
  const firstCoop = `First Co-op ${randomUUID().slice(0, 8)}`;
  const secondCoop = `Second Co-op ${randomUUID().slice(0, 8)}`;

  await page.goto('/signup');
  await page.getByLabel('Name').fill('Workspace Retry Coordinator');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByLabel('Co-op name').fill(firstCoop);
  await page.getByRole('button', { name: 'Create co-op' }).click();
  await expect(page.getByRole('heading', { name: 'Co-op workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Add co-op' }).click();
  await page.getByLabel('Co-op name', { exact: true }).fill(secondCoop);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('option', { name: secondCoop })).toBeAttached();
  await expect(page.getByText('No classes in Pre-K yet. Add the first one below.')).toBeVisible();

  const firstWorkspace = await prisma.coop.findFirst({
    where: { name: firstCoop },
    select: { id: true },
  });
  const secondWorkspace = await prisma.coop.findFirst({
    where: { name: secondCoop },
    select: { id: true, createdByUserId: true },
  });
  expect(firstWorkspace).not.toBeNull();
  expect(secondWorkspace).not.toBeNull();
  if (!firstWorkspace || !secondWorkspace) throw new Error('Workspace fixtures were not saved');

  const coopPicker = page.locator('#selected-coop');
  const firstRead = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/coops/${firstWorkspace.id}/sections`) &&
      response.status() === 200,
  );
  await coopPicker.selectOption({ label: firstCoop });
  await firstRead;
  await expect(page.getByText('No classes in Pre-K yet. Add the first one below.')).toBeVisible();

  // Access comes from coordinator membership, so revoking it means changing the role.
  const setRole = (role: string) =>
    prisma.coopMembership.updateMany({
      where: { coopId: secondWorkspace.id, userId: secondWorkspace.createdByUserId },
      data: { role },
    });
  await setRole('former');
  try {
    const forbiddenRead = await page.request.get(`/api/coops/${secondWorkspace.id}/sections`);
    expect(forbiddenRead.status()).toBe(403);

    const deniedClassRead = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/coops/${secondWorkspace.id}/sections`) &&
        response.status() === 403,
    );
    await coopPicker.selectOption({ label: secondCoop });
    await deniedClassRead;
    const recordError = page.getByText(/We couldn’t load this co-op/);
    await expect(recordError).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    await setRole('coordinator');
    const retryClassRead = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/coops/${secondWorkspace.id}/sections`) &&
        response.status() === 200,
    );
    await page.getByRole('button', { name: 'Try again' }).click();
    await retryClassRead;
    await expect(recordError).toHaveCount(0);
    await expect(page.getByText('No classes in Pre-K yet. Add the first one below.')).toBeVisible();
  } finally {
    await setRole('coordinator');
  }
});

test('invalid email and password stay signed out with accessible feedback', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? process.env.BASE_URL ?? 'http://localhost:3000').origin;
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`missing-${randomUUID()}@example.test`);
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const error = page.locator('#sign-in-error');
  await expect(error).toHaveText('That email and password do not match. Please try again.');
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
  const session = await page.request.get('/api/auth/get-session', { headers: { origin } });
  expect(await session.json()).toBeNull();
});

test('password reset links expire, work once, and allow sign-in with the new password', async ({
  page,
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? process.env.BASE_URL ?? 'http://localhost:3000').origin;
  const email = `recovery-${randomUUID()}@example.test`;
  const password = `Kithwheel-${randomUUID()}-9a`;
  const signup = await request.post('/api/auth/sign-up/email', {
    headers: { origin },
    data: { name: 'Recovery Coordinator', email, password },
  });
  expect(signup.status()).toBe(200);

  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a reset link' }).click();
  await expect(page.getByRole('status')).toContainText('expires in one hour');

  const expiredLink = latestResetLink(email);
  const expiredToken = tokenFromResetLink(expiredLink);
  const expiredVerification = await prisma.verification.findFirst({
    where: { identifier: `reset-password:${expiredToken}` },
    select: { id: true },
  });
  expect(expiredVerification).not.toBeNull();
  if (!expiredVerification) throw new Error('The reset token was not saved in the database');
  await prisma.verification.update({
    where: { id: expiredVerification.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });

  await page.goto(expiredLink);
  await expect(page.locator('.kw-auth-result [role="alert"]')).toContainText(
    'invalid, expired, or already used',
  );
  const expiredAttempt = await request.post('/api/auth/reset-password', {
    headers: { origin },
    data: { newPassword: `Rejected-${randomUUID()}-9a`, token: expiredToken },
  });
  expect(expiredAttempt.status()).toBe(400);
  const oldPasswordStillWorks = await submitSignIn(request, origin, email, password);
  expect(oldPasswordStillWorks.status()).toBe(200);
  await request.post('/api/auth/sign-out', { headers: { origin }, data: {} });

  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a reset link' }).click();
  await expect(page.getByRole('status')).toContainText('expires in one hour');
  const validLink = latestResetLink(email);
  const validToken = tokenFromResetLink(validLink);

  await page.goto(validLink);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  const newPassword = `New-Kithwheel-${randomUUID()}-9a`;
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been updated');

  const usedAttempt = await request.post('/api/auth/reset-password', {
    headers: { origin },
    data: { newPassword: `Rejected-${randomUUID()}-9a`, token: validToken },
  });
  expect(usedAttempt.status()).toBe(400);

  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Start with your co-op' })).toBeVisible();
});
