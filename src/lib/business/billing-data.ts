// Server-only: reads a co-op's billing status in the shape of the BillingStatus contract.
import 'server-only';
import { entitlement } from '@/lib/billing/entitlement';
import { getStripe } from '@/lib/billing/stripe';
import { type BillingStatus, BillingStatus as BillingStatusSchema } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';

export const billingFieldsSelect = {
  id: true,
  name: true,
  trialEndsAt: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  subscriptionStatus: true,
  subscriptionInterval: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
} as const;

export async function readBillingStatus(coopId: string): Promise<BillingStatus | null> {
  const coop = await prisma.coop.findUnique({ where: { id: coopId }, select: billingFieldsSelect });
  if (!coop) return null;
  const access = entitlement(coop);
  const plan =
    coop.subscriptionInterval === 'month' || coop.subscriptionInterval === 'year'
      ? coop.subscriptionInterval
      : null;
  return BillingStatusSchema.parse({
    state: access.state,
    canEdit: access.canEdit,
    trialEndsAt: coop.trialEndsAt.toISOString(),
    trialDaysLeft: access.trialDaysLeft,
    plan: access.state === 'subscribed' || access.state === 'past_due' ? plan : null,
    currentPeriodEnd: coop.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: coop.cancelAtPeriodEnd,
    hasBillingAccount: Boolean(coop.stripeCustomerId),
    billingAvailable: getStripe() !== null,
  });
}
