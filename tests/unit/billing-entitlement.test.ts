import { describe, expect, it } from 'vitest';
import {
  type BillingFields,
  entitlement,
  TRIAL_DAYS,
  trialEndFrom,
} from '@/lib/billing/entitlement';

const now = new Date('2026-11-02T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

function fields(overrides: Partial<BillingFields> = {}): BillingFields {
  return {
    trialEndsAt: new Date(now.getTime() + 10 * day),
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    subscriptionInterval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe('billing entitlement', () => {
  it('starts a 30-day trial', () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(trialEndFrom(now).getTime() - now.getTime()).toBe(30 * day);
  });

  it('lets a co-op on its free trial edit and counts the days left', () => {
    expect(entitlement(fields(), now)).toEqual({
      state: 'trial',
      canEdit: true,
      trialDaysLeft: 10,
    });
  });

  it('rounds a partial last day up', () => {
    const result = entitlement(fields({ trialEndsAt: new Date(now.getTime() + 60_000) }), now);
    expect(result.trialDaysLeft).toBe(1);
    expect(result.canEdit).toBe(true);
  });

  it('locks editing once the trial ends without a subscription', () => {
    expect(entitlement(fields({ trialEndsAt: new Date(now.getTime() - 1) }), now)).toEqual({
      state: 'trial_expired',
      canEdit: false,
      trialDaysLeft: 0,
    });
  });

  it.each(['active', 'trialing'])('treats a %s subscription as subscribed', (status) => {
    const result = entitlement(
      fields({
        trialEndsAt: new Date(now.getTime() - day),
        stripeSubscriptionId: 'sub_1',
        subscriptionStatus: status,
      }),
      now,
    );
    expect(result.state).toBe('subscribed');
    expect(result.canEdit).toBe(true);
  });

  it('keeps editing open while a failed payment is retried', () => {
    const result = entitlement(
      fields({
        trialEndsAt: new Date(now.getTime() - day),
        stripeSubscriptionId: 'sub_1',
        subscriptionStatus: 'past_due',
      }),
      now,
    );
    expect(result).toMatchObject({ state: 'past_due', canEdit: true });
  });

  it.each(['canceled', 'unpaid', 'incomplete_expired', 'paused'])(
    'locks a %s subscription after the trial',
    (status) => {
      const result = entitlement(
        fields({
          trialEndsAt: new Date(now.getTime() - day),
          stripeSubscriptionId: 'sub_1',
          subscriptionStatus: status,
        }),
        now,
      );
      expect(result).toEqual({ state: 'inactive', canEdit: false, trialDaysLeft: 0 });
    },
  );

  it('falls back to the free trial when a first payment is still incomplete', () => {
    const result = entitlement(
      fields({ stripeSubscriptionId: 'sub_1', subscriptionStatus: 'incomplete' }),
      now,
    );
    expect(result).toMatchObject({ state: 'trial', canEdit: true });
  });
});
