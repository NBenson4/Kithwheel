// The selected co-op's plan: free-trial countdown, subscribe, and manage billing.
'use client';

import { CreditCard } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/billing/billing.module.css';
import { apiFetch } from '@/lib/api-client';
import { BillingStatus, RedirectUrl, type BillingStatus as Status } from '@/lib/contracts/coops';

const PLANS = [
  { interval: 'month', label: 'Monthly', price: '$60', unit: '/month', note: null },
  { interval: 'year', label: 'Annual', price: '$600', unit: '/year', note: '2 months free' },
] as const;

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(iso: string | null) {
  return iso ? dateFormat.format(new Date(iso)) : '';
}

function messageOf(error: unknown, fallback: string) {
  const cause = error instanceof Error ? error.cause : null;
  if (
    cause &&
    typeof cause === 'object' &&
    typeof (cause as { error?: unknown }).error === 'string'
  ) {
    return (cause as { error: string }).error;
  }
  return fallback;
}

/** Reads and clears the ?billing= return markers Stripe redirects back with. */
function takeReturnMarker(coopId: string) {
  const url = new URL(window.location.href);
  const billing = url.searchParams.get('billing');
  if (!billing || url.searchParams.get('coop') !== coopId) return null;
  const sessionId = url.searchParams.get('session_id');
  for (const key of ['billing', 'session_id', 'coop']) url.searchParams.delete(key);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return { billing, sessionId };
}

export function BillingPanel({
  coopId,
  onStatusChange,
}: {
  coopId: string;
  onStatusChange?: (status: Status | null) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const apply = useCallback(
    (next: Status | null) => {
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const marker = takeReturnMarker(coopId);
      if (marker?.billing === 'success' && marker.sessionId) {
        const confirmed = await apiFetch(`/api/coops/${coopId}/billing/confirm`, {
          method: 'POST',
          body: JSON.stringify({ sessionId: marker.sessionId }),
          schema: BillingStatus,
        });
        apply(confirmed);
        if (confirmed.state === 'subscribed') toast.success('Your plan is active. Thank you!');
        return;
      }
      if (marker?.billing === 'canceled') toast('Checkout canceled. Nothing was charged.');
      apply(await apiFetch(`/api/coops/${coopId}/billing`, { schema: BillingStatus }));
    } catch {
      setFailed(true);
      apply(null);
    }
  }, [coopId, apply]);

  useEffect(() => {
    setStatus(null);
    void load();
  }, [load]);

  async function redirectTo(path: string, body: Record<string, string> | null, key: string) {
    setPending(key);
    try {
      const { url } = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
        schema: RedirectUrl,
      });
      window.location.assign(url);
    } catch (error) {
      toast.error(messageOf(error, 'Something went wrong. Please try again.'));
      setPending(null);
    }
  }

  if (failed) {
    return (
      <section className={styles.panel} aria-label="Billing">
        <p className={styles.detail}>We couldn’t load billing for this co-op.</p>
        <button className={styles.quietButton} type="button" onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  }

  if (!status) {
    return (
      <section className={styles.panel} aria-label="Billing" aria-busy="true">
        <output className={styles.detail}>Loading billing…</output>
      </section>
    );
  }

  const choosingPlan =
    status.state === 'trial' || status.state === 'trial_expired' || status.state === 'inactive';
  const locked = !status.canEdit;

  let badge: string;
  let headline: string;
  let detail: string;
  switch (status.state) {
    case 'trial':
      badge = 'Free trial';
      headline = `${status.trialDaysLeft} ${status.trialDaysLeft === 1 ? 'day' : 'days'} left in your free trial`;
      detail = `Subscribe any time. Your remaining trial days carry over, so your first charge is on ${formatDate(status.trialEndsAt)}.`;
      break;
    case 'trial_expired':
      badge = 'Trial ended';
      headline = 'Your free trial has ended';
      detail =
        'Your co-op’s records are safe. Choose a plan to keep editing classes and schedules.';
      break;
    case 'inactive':
      badge = 'No plan';
      headline = 'Your plan has ended';
      detail =
        'Your co-op’s records are safe. Choose a plan to keep editing classes and schedules.';
      break;
    case 'past_due':
      badge = 'Payment issue';
      headline = 'Your last payment didn’t go through';
      detail = 'We’ll retry automatically. Update your payment method to avoid any interruption.';
      break;
    default:
      badge = status.plan === 'year' ? 'Annual plan' : 'Monthly plan';
      headline = status.plan === 'year' ? 'Kithwheel Annual' : 'Kithwheel Monthly';
      detail = status.cancelAtPeriodEnd
        ? `Your plan ends on ${formatDate(status.currentPeriodEnd)}.`
        : `Next charge on ${formatDate(status.currentPeriodEnd)}.`;
  }

  return (
    <section
      className={`${styles.panel} ${locked ? styles.panelLocked : ''} ${status.state === 'past_due' ? styles.panelWarning : ''}`}
      aria-labelledby="billing-heading"
      role={locked || status.state === 'past_due' ? 'alert' : undefined}
    >
      <div className={styles.summary}>
        <span className={`${styles.badge} ${locked ? styles.badgeLocked : ''}`}>{badge}</span>
        <div>
          <h2 className={styles.headline} id="billing-heading">
            {headline}
          </h2>
          <p className={styles.detail}>{detail}</p>
        </div>
      </div>

      {!status.billingAvailable ? (
        <p className={styles.detail}>Online billing isn’t available on this site yet.</p>
      ) : (
        <div className={styles.actions}>
          {choosingPlan &&
            PLANS.map((plan) => (
              <button
                key={plan.interval}
                className={plan.interval === 'year' ? styles.button : styles.quietButton}
                type="button"
                disabled={pending !== null}
                onClick={() =>
                  void redirectTo(
                    `/api/coops/${coopId}/billing/checkout`,
                    { interval: plan.interval },
                    plan.interval,
                  )
                }
              >
                {pending === plan.interval
                  ? 'Opening checkout…'
                  : `${plan.label} · ${plan.price}${plan.unit}`}
                {plan.note && pending !== plan.interval ? (
                  <span className={styles.planNote}>{plan.note}</span>
                ) : null}
              </button>
            ))}
          {status.hasBillingAccount && (
            <button
              className={styles.quietButton}
              type="button"
              disabled={pending !== null}
              onClick={() => void redirectTo(`/api/coops/${coopId}/billing/portal`, null, 'portal')}
            >
              <CreditCard aria-hidden="true" size={15} />
              {pending === 'portal' ? 'Opening billing…' : 'Manage billing'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
