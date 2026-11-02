// Manual end-to-end check of Kithwheel billing against a Stripe SANDBOX.
// Needs: the app running (npm run build && npm start) with STRIPE_SECRET_KEY
// (sk_test_ only), STRIPE_WEBHOOK_SECRET, EMAIL_CAPTURE_FILE, and DATABASE_URL.
//
//   node --env-file=.env.local tests/manual/billing-sandbox.mjs
//
// It signs up a coordinator, creates a co-op, pays in Stripe Checkout with a test
// card, replays Stripe's real events to the webhook (signed with
// STRIPE_WEBHOOK_SECRET), and checks trial expiry, payment-failure email,
// cancellation, and the Customer Portal.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const key = process.env.STRIPE_SECRET_KEY ?? '';
assert.ok(key.startsWith('sk_test_'), 'Use a sandbox (sk_test_) key');
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
assert.ok(webhookSecret, 'STRIPE_WEBHOOK_SECRET is required');
const captureFile = process.env.EMAIL_CAPTURE_FILE ?? '/tmp/kithwheel-email-capture.jsonl';

const stripe = new Stripe(key);
const prisma = new PrismaClient();
const step = (message) => console.log(`\n✔ ${message}`);

async function api(page, path, init = {}) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { path, init },
  );
}

async function deliver(event) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  return { status: res.status, body: await res.json() };
}

/** Real events Stripe recorded for this customer's subscription, oldest first. */
async function eventsFor(customerId, subscriptionId) {
  const types = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
  ];
  const { data } = await stripe.events.list({ types, limit: 100 });
  return data
    .filter((event) => {
      const object = event.data.object;
      return (
        object.customer === customerId ||
        object.id === subscriptionId ||
        object.subscription === subscriptionId
      );
    })
    .reverse();
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();

try {
  // --- Sign up and create a co-op -----------------------------------------
  const email = `billing-${randomUUID()}@example.test`;
  await page.goto(`${BASE}/signup`);
  await page.getByLabel('Name').fill('Billing Coordinator');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(`Kithwheel-${randomUUID()}-9a`);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/dashboard$/);
  const coop = await api(page, '/api/coops', {
    method: 'POST',
    body: JSON.stringify({ name: `Billing Co-op ${randomUUID().slice(0, 6)}` }),
  });
  assert.equal(coop.status, 201);
  const coopId = coop.body.id;
  step(`signed up and created co-op ${coopId}`);

  let billing = await api(page, `/api/coops/${coopId}/billing`);
  assert.equal(billing.body.state, 'trial');
  assert.equal(billing.body.trialDaysLeft, 30);
  assert.equal(billing.body.canEdit, true);
  step('new co-op starts on a 30-day free trial with editing allowed');

  await page.reload();
  await page.getByRole('heading', { name: '30 days left in your free trial' }).waitFor();
  step('workspace shows the trial in the billing panel');

  // --- Subscribe through Stripe Checkout ------------------------------------
  const checkout = await api(page, `/api/coops/${coopId}/billing/checkout`, {
    method: 'POST',
    body: JSON.stringify({ interval: 'year' }),
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
  assert.match(checkout.body.url, /^https:\/\/checkout\.stripe\.com\//);
  await page.goto(checkout.body.url);
  // Checkout lists several payment methods; choose Card to reveal the card fields.
  const cardOption = page.getByTestId('card-accordion-item-button');
  await cardOption.waitFor({ state: 'attached', timeout: 60_000 });
  // Stripe overlays the accordion button with a cover element; dispatch the click directly.
  await cardOption.dispatchEvent('click');
  await page.locator('#cardNumber').waitFor({ timeout: 60_000 });
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  const nameField = page.locator('#billingName');
  if (await nameField.count()) await nameField.fill('Billing Coordinator');
  const zip = page.locator('#billingPostalCode');
  if (await zip.count()) await zip.fill('19104');
  // Opt out of saving the card with Link (it would ask for a phone number).
  const link = page.getByRole('checkbox', { name: /Save my information/i });
  if ((await link.count()) && (await link.isChecked())) await link.uncheck({ force: true });
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 90_000 }).catch(async (error) => {
    await page.screenshot({
      path: process.env.CHECKOUT_SCREENSHOT ?? 'checkout-failure.png',
      fullPage: true,
    });
    throw error;
  });
  await page.getByRole('heading', { name: 'Kithwheel Annual' }).waitFor({ timeout: 30_000 });
  step('paid in Stripe Checkout with a test card and returned to the workspace');

  let row = await prisma.coop.findUniqueOrThrow({ where: { id: coopId } });
  assert.ok(row.stripeCustomerId?.startsWith('cus_'));
  assert.ok(row.stripeSubscriptionId?.startsWith('sub_'));
  assert.equal(row.subscriptionStatus, 'trialing');
  assert.equal(row.subscriptionInterval, 'year');
  const subscription = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
  assert.equal(subscription.trial_end, Math.floor(row.trialEndsAt.getTime() / 1000));
  assert.equal(subscription.metadata.coopId, coopId);
  step('subscription saved; remaining trial carried over (first charge at trial end)');

  const second = await api(page, `/api/coops/${coopId}/billing/checkout`, {
    method: 'POST',
    body: JSON.stringify({ interval: 'month' }),
  });
  assert.equal(second.status, 409);
  step('a second checkout for the same co-op is refused');

  // --- Webhooks: replay Stripe's real events ---------------------------------
  // Clear what the success-page confirmation wrote, so the webhook does the work.
  await prisma.coop.update({
    where: { id: coopId },
    data: { stripeSubscriptionId: null, subscriptionStatus: null, subscriptionInterval: null },
  });
  let events = [];
  for (let attempt = 0; attempt < 10 && events.length < 2; attempt += 1) {
    events = await eventsFor(row.stripeCustomerId, row.stripeSubscriptionId);
    if (events.length < 2) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.ok(events.length >= 2, `expected Stripe events, got ${events.length}`);
  for (const event of events) {
    const result = await deliver(event);
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }
  row = await prisma.coop.findUniqueOrThrow({ where: { id: coopId } });
  assert.equal(row.subscriptionStatus, 'trialing');
  assert.equal(row.subscriptionInterval, 'year');
  step(`webhook synced the subscription from ${events.length} real Stripe events`);

  const again = await deliver(events[0]);
  assert.equal(again.body.duplicate, true);
  step('a redelivered event is recognized and skipped');

  // --- Payment failure email -------------------------------------------------
  const failed = {
    ...events[0],
    id: `evt_test_failed_${randomUUID().replaceAll('-', '')}`,
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_test',
        object: 'invoice',
        customer: row.stripeCustomerId,
        parent: { subscription_details: { subscription: row.stripeSubscriptionId } },
      },
    },
  };
  assert.equal((await deliver(failed)).status, 200);
  const emails = readFileSync(captureFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.ok(emails.some((mail) => mail.to === email && mail.subject.startsWith('Action needed')));
  step('a failed payment emails the coordinator');

  // --- Customer Portal -------------------------------------------------------
  const portal = await api(page, `/api/coops/${coopId}/billing/portal`, {
    method: 'POST',
    body: '{}',
  });
  assert.equal(portal.status, 200, JSON.stringify(portal.body));
  assert.match(portal.body.url, /^https:\/\/billing\.stripe\.com\//);
  step('Manage billing opens the Stripe Customer Portal');

  // --- Cancellation ----------------------------------------------------------
  await stripe.subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: true });
  await deliver({
    ...failed,
    id: `evt_test_upd_${randomUUID()}`,
    type: 'customer.subscription.updated',
    data: { object: { id: row.stripeSubscriptionId, object: 'subscription' } },
  });
  billing = await api(page, `/api/coops/${coopId}/billing`);
  assert.equal(billing.body.cancelAtPeriodEnd, true);
  assert.equal(billing.body.state, 'subscribed');
  step('cancel at period end keeps access and shows the end date');

  await stripe.subscriptions.cancel(row.stripeSubscriptionId);
  await prisma.coop.update({
    where: { id: coopId },
    data: { trialEndsAt: new Date(Date.now() - 1000) },
  });
  await deliver({
    ...failed,
    id: `evt_test_del_${randomUUID()}`,
    type: 'customer.subscription.deleted',
    data: { object: { id: row.stripeSubscriptionId, object: 'subscription' } },
  });
  billing = await api(page, `/api/coops/${coopId}/billing`);
  assert.equal(billing.body.state, 'inactive');
  assert.equal(billing.body.canEdit, false);
  const blocked = await api(page, `/api/coops/${coopId}/classes`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Should be blocked' }),
  });
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.code, 'billing_required');
  const readable = await api(page, `/api/coops/${coopId}/classes`);
  assert.equal(readable.status, 200);
  step('after cancellation with no trial left, editing is blocked (402) but records stay readable');

  await page.reload();
  await page.getByRole('heading', { name: 'Your plan has ended' }).waitFor();
  step('workspace tells the coordinator their plan ended and offers plans again');

  console.log('\nAll billing checks passed.');
} finally {
  await browser.close();
  await prisma.$disconnect();
}
