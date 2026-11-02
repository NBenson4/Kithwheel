// Pure billing rules: what a co-op's billing fields mean for access.
// No I/O here, so the rules are easy to unit test and safe to import anywhere.

export const TRIAL_DAYS = 30;

/** Stripe statuses that keep paid access on. `past_due` is a grace period while Stripe retries. */
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

export type BillingFields = {
  trialEndsAt: Date;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionInterval: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type BillingState =
  /** On the free trial, no subscription yet. */
  | 'trial'
  /** Free trial over and never subscribed. */
  | 'trial_expired'
  /** Subscribed (Stripe `active`, or `trialing` until the free trial's end date). */
  | 'subscribed'
  /** Subscribed, but the latest payment failed and Stripe is retrying. */
  | 'past_due'
  /** Had a subscription that ended (canceled, unpaid, or never completed) after the trial. */
  | 'inactive';

export type Entitlement = {
  state: BillingState;
  /** Whether coordinators may create and change records. Reading is always allowed. */
  canEdit: boolean;
  /** Whole days left on the free trial (0 once it has ended). */
  trialDaysLeft: number;
};

export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function entitlement(fields: BillingFields, now: Date = new Date()): Entitlement {
  const msLeft = fields.trialEndsAt.getTime() - now.getTime();
  const trialDaysLeft = msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0;
  const status = fields.subscriptionStatus;

  if (fields.stripeSubscriptionId && status && PAID_STATUSES.has(status)) {
    return {
      state: status === 'past_due' ? 'past_due' : 'subscribed',
      canEdit: true,
      trialDaysLeft,
    };
  }

  // No usable subscription: the free trial decides.
  if (trialDaysLeft > 0) return { state: 'trial', canEdit: true, trialDaysLeft };
  return {
    state: fields.stripeSubscriptionId ? 'inactive' : 'trial_expired',
    canEdit: false,
    trialDaysLeft: 0,
  };
}
