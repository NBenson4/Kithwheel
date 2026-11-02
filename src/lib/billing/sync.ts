// Server-only: copies a Stripe subscription's current state onto its co-op.
// Always re-reads the subscription from Stripe, so webhook events can arrive in
// any order or more than once and the co-op still ends up correct.
import 'server-only';
import type Stripe from 'stripe';
import { intervalForLookupKey } from '@/lib/billing/stripe';
import { prisma } from '@/lib/db';

/** Statuses after which a subscription can never become paid again. */
const ENDED_STATUSES = new Set(['canceled', 'incomplete_expired']);

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export async function syncSubscription(
  stripe: Stripe,
  subscriptionId: string,
  hintCoopId?: string | null,
): Promise<string | null> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });
  const customerId = idOf(subscription.customer);
  const metadataCoopId = subscription.metadata?.coopId || hintCoopId || null;

  const coop = metadataCoopId
    ? await prisma.coop.findUnique({ where: { id: metadataCoopId } })
    : customerId
      ? await prisma.coop.findUnique({ where: { stripeCustomerId: customerId } })
      : null;
  if (!coop) return null;

  // Never let an old, ended subscription overwrite a newer one on the same co-op.
  const isCurrent = coop.stripeSubscriptionId === subscription.id;
  if (!isCurrent && coop.stripeSubscriptionId && ENDED_STATUSES.has(subscription.status)) {
    return coop.id;
  }

  const item = subscription.items.data[0];
  await prisma.coop.update({
    where: { id: coop.id },
    data: {
      stripeCustomerId: coop.stripeCustomerId ?? customerId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionInterval:
        intervalForLookupKey(item?.price.lookup_key) ?? item?.price.recurring?.interval ?? null,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
    },
  });
  return coop.id;
}

/** The subscription an invoice belongs to (location differs across API versions). */
export function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details?.subscription;
  return idOf(parent as string | { id: string } | null | undefined);
}
