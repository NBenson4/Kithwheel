// Starts a Stripe Checkout Session for the co-op's Kithwheel subscription.
// Any free-trial time left carries over, so subscribing early never costs extra.
import 'server-only';
import { NextResponse } from 'next/server';
import { entitlement } from '@/lib/billing/entitlement';
import { getStripe, priceIdFor } from '@/lib/billing/stripe';
import { billingFieldsSelect } from '@/lib/business/billing-data';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';
import { CheckoutStart, RedirectUrl } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { sameOrigin } from '@/lib/same-origin';
import { siteUrl } from '@/lib/site';

type RouteContext = { params: Promise<{ coopId: string }> };

/** Stripe Checkout requires a trial end at least 48 hours away. */
const MIN_TRIAL_REMAINING_MS = 49 * 60 * 60 * 1000;

export async function POST(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 });
  }

  const parsed = CheckoutStart.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    let coop = await prisma.coop.findUnique({ where: { id: coopId }, select: billingFieldsSelect });
    if (!coop) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const state = entitlement(coop).state;
    if (state === 'subscribed' || state === 'past_due') {
      return NextResponse.json(
        { error: 'This co-op already has a plan. Use Manage billing to change it.' },
        { status: 409 },
      );
    }

    if (!coop.stripeCustomerId) {
      const customer = await stripe.customers.create(
        { name: coop.name, email: access.email, metadata: { coopId } },
        // Concurrent clicks reuse the same customer instead of creating two.
        { idempotencyKey: `kithwheel-coop-customer-${coopId}` },
      );
      await prisma.coop.updateMany({
        where: { id: coopId, stripeCustomerId: null },
        data: { stripeCustomerId: customer.id },
      });
      coop = await prisma.coop.findUnique({ where: { id: coopId }, select: billingFieldsSelect });
      if (!coop?.stripeCustomerId) throw new Error('Stripe customer was not saved');
    }

    const price = await priceIdFor(stripe, parsed.data.interval);
    const trialRemaining = coop.trialEndsAt.getTime() - Date.now();
    const automaticTax = env.STRIPE_AUTOMATIC_TAX === 'true';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: coop.stripeCustomerId,
      client_reference_id: coopId,
      line_items: [{ price, quantity: 1 }],
      payment_method_collection: 'always',
      allow_promotion_codes: true,
      metadata: { coopId },
      subscription_data: {
        metadata: { coopId },
        billing_mode: { type: 'flexible' },
        ...(trialRemaining >= MIN_TRIAL_REMAINING_MS
          ? { trial_end: Math.floor(coop.trialEndsAt.getTime() / 1000) }
          : {}),
      },
      ...(automaticTax
        ? {
            automatic_tax: { enabled: true },
            billing_address_collection: 'required' as const,
            customer_update: { address: 'auto' as const, name: 'auto' as const },
          }
        : {}),
      success_url: `${siteUrl}/dashboard?billing=success&coop=${encodeURIComponent(coopId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/dashboard?billing=canceled&coop=${encodeURIComponent(coopId)}`,
    });
    if (!session.url) throw new Error('Checkout Session has no URL');
    return NextResponse.json(RedirectUrl.parse({ url: session.url }));
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server diagnostics for billing failures.
    console.error('[billing] checkout failed', error);
    return NextResponse.json(
      { error: 'We could not open checkout. Please try again.' },
      { status: 502 },
    );
  }
}
