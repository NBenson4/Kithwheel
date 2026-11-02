// Stripe webhook for Kithwheel's own billing (co-ops paying Kithwheel).
//
// Register <APP_URL>/api/stripe/webhook in the Stripe Dashboard (Developers >
// Webhooks) for these events and put its signing secret in STRIPE_WEBHOOK_SECRET:
//   checkout.session.completed
//   customer.subscription.created, .updated, .deleted, .paused, .resumed
//   invoice.paid, invoice.payment_failed
//
// Every handler re-reads the subscription from Stripe, so events may arrive out
// of order or twice. Processed event ids are recorded so side effects such as
// emails happen once. A handler error answers 500 and Stripe retries later.
import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/billing/stripe';
import { subscriptionIdOfInvoice, syncSubscription } from '@/lib/billing/sync';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { paymentFailedEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

async function notifyPaymentFailed(coopId: string) {
  const coop = await prisma.coop.findUnique({
    where: { id: coopId },
    select: { name: true, createdByUserId: true },
  });
  if (!coop) return;
  const user = await prisma.user.findUnique({
    where: { id: coop.createdByUserId },
    select: { email: true },
  });
  if (!user) return;
  await sendEmail({
    to: user.email,
    ...paymentFailedEmail({
      coopName: coop.name,
      url: `${siteUrl}/dashboard?coop=${encodeURIComponent(coopId)}`,
    }),
  });
}

async function handle(stripe: Stripe, event: Stripe.Event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (session.mode === 'subscription' && subscriptionId) {
      await syncSubscription(stripe, subscriptionId, session.client_reference_id);
    }
    return;
  }

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const subscription = event.data.object as Stripe.Subscription;
    await syncSubscription(stripe, subscription.id);
    return;
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const subscriptionId = subscriptionIdOfInvoice(event.data.object);
    if (!subscriptionId) return;
    const coopId = await syncSubscription(stripe, subscriptionId);
    if (event.type === 'invoice.payment_failed' && coopId) await notifyPaymentFailed(coopId);
  }
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'Billing webhooks are not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    // The signature covers the exact raw body, so read it as text, unparsed.
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handle(stripe, event);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server diagnostics; Stripe retries on 500.
    console.error(`[billing] webhook ${event.type} ${event.id} failed`, error);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    // A concurrent delivery already recorded it; nothing else to do.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      throw error;
    }
  }
  return NextResponse.json({ received: true });
}
