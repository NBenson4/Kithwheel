// Creates or updates Kithwheel's Stripe catalog and Customer Portal settings.
// Safe to run repeatedly (idempotent). Run once per Stripe environment
// (sandbox, then live) with that environment's secret key:
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//   (or: npm run stripe:setup, which reads .env.local)
//
// Prices are looked up by lookup_key at runtime, so this script is the single
// place where amounts are defined.
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY is not set');
  process.exit(1);
}
const stripe = new Stripe(key);

const PRODUCT_ID = 'kithwheel';
// Software as a service, business use. https://docs.stripe.com/tax/tax-codes
const SAAS_TAX_CODE = 'txcd_10103001';
const PRICES = [
  { lookupKey: 'kithwheel_monthly', unitAmount: 6000, interval: 'month', nickname: 'Monthly' },
  { lookupKey: 'kithwheel_annual', unitAmount: 60000, interval: 'year', nickname: 'Annual' },
];

async function ensureProduct() {
  const fields = {
    name: 'Kithwheel',
    description: 'Co-op management for homeschool co-ops: schedules, rotations, and more.',
    tax_code: SAAS_TAX_CODE,
    statement_descriptor: 'KITHWHEEL',
  };
  try {
    const existing = await stripe.products.retrieve(PRODUCT_ID);
    const product = await stripe.products.update(PRODUCT_ID, { ...fields, active: true });
    console.log(`product ${existing.id}: updated`);
    return product;
  } catch (error) {
    if (error?.code !== 'resource_missing') throw error;
    const product = await stripe.products.create({ id: PRODUCT_ID, ...fields });
    console.log(`product ${product.id}: created`);
    return product;
  }
}

async function ensurePrice(product, spec) {
  const found = await stripe.prices.list({
    lookup_keys: [spec.lookupKey],
    expand: ['data.product'],
  });
  const current = found.data[0];
  const matches =
    current?.active &&
    current.unit_amount === spec.unitAmount &&
    current.currency === 'usd' &&
    current.recurring?.interval === spec.interval &&
    current.tax_behavior === 'exclusive' &&
    (typeof current.product === 'string' ? current.product : current.product.id) === product.id;
  if (matches) {
    console.log(`price ${spec.lookupKey}: ok (${current.id})`);
    return current;
  }
  // Prices are immutable: create a new one and move the lookup key to it.
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: spec.unitAmount,
    recurring: { interval: spec.interval },
    tax_behavior: 'exclusive',
    nickname: spec.nickname,
    lookup_key: spec.lookupKey,
    transfer_lookup_key: true,
  });
  if (current) await stripe.prices.update(current.id, { active: false });
  console.log(
    `price ${spec.lookupKey}: created ${price.id}${current ? ` (replaced ${current.id})` : ''}`,
  );
  return price;
}

async function ensurePortal(prices) {
  const config = {
    business_profile: { headline: 'Manage your Kithwheel subscription' },
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products: [{ product: PRODUCT_ID, prices: prices.map((p) => p.id) }],
      },
    },
    metadata: { kithwheel: 'default' },
  };
  const list = await stripe.billingPortal.configurations.list({ limit: 100 });
  const ours = list.data.find((c) => c.metadata?.kithwheel === 'default');
  if (ours) {
    await stripe.billingPortal.configurations.update(ours.id, config);
    console.log(`portal ${ours.id}: updated`);
    return ours.id;
  }
  const created = await stripe.billingPortal.configurations.create(config);
  console.log(`portal ${created.id}: created`);
  return created.id;
}

const product = await ensureProduct();
const prices = [];
for (const spec of PRICES) prices.push(await ensurePrice(product, spec));
const portalId = await ensurePortal(prices);
console.log(`\nDone. Optional: set STRIPE_PORTAL_CONFIGURATION_ID=${portalId}`);
