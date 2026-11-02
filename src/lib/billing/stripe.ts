// Server-only Stripe client and catalog lookups for Kithwheel's own billing
// (co-ops paying Kithwheel). The catalog is created by scripts/stripe-setup.mjs.
import 'server-only';
import Stripe from 'stripe';
import { env } from '@/lib/env';

export const PLAN_LOOKUP_KEYS = {
  month: 'kithwheel_monthly',
  year: 'kithwheel_annual',
} as const;
export type PlanInterval = keyof typeof PLAN_LOOKUP_KEYS;

/** Tag on the Customer Portal configuration created by the setup script. */
const PORTAL_CONFIG_TAG = 'default';

let client: Stripe | null = null;

/** The Stripe client, or null when STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    appInfo: { name: 'Kithwheel', url: env.NEXT_PUBLIC_APP_URL },
  });
  return client;
}

// Small in-process caches: prices and the portal configuration rarely change,
// and a cold start simply looks them up again.
const priceIds = new Map<PlanInterval, string>();
let portalConfigurationId: string | null = null;

export async function priceIdFor(stripe: Stripe, interval: PlanInterval): Promise<string> {
  const cached = priceIds.get(interval);
  if (cached) return cached;
  const lookupKey = PLAN_LOOKUP_KEYS[interval];
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = data[0];
  if (!price)
    throw new Error(
      `No active Stripe price with lookup key ${lookupKey}; run npm run stripe:setup`,
    );
  priceIds.set(interval, price.id);
  return price.id;
}

/** The interval ("month" / "year") of a Kithwheel price, from its lookup key. */
export function intervalForLookupKey(lookupKey: string | null | undefined): PlanInterval | null {
  if (lookupKey === PLAN_LOOKUP_KEYS.month) return 'month';
  if (lookupKey === PLAN_LOOKUP_KEYS.year) return 'year';
  return null;
}

export async function portalConfigurationIdFor(stripe: Stripe): Promise<string | undefined> {
  if (portalConfigurationId) return portalConfigurationId;
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const ours = list.data.find((config) => config.metadata?.kithwheel === PORTAL_CONFIG_TAG);
  portalConfigurationId = ours?.id ?? null;
  // Falls back to the account's default portal configuration when none is tagged.
  return ours?.id;
}
