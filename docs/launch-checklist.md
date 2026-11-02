# Launch checklist

Kithwheel runs at https://kithwheel.org on Vercel (Neon Postgres, Resend email,
Stripe **sandbox**). These are the remaining steps before taking real payments.

## Done

- [x] Hosting on Vercel, database on Neon, migrations run on every deploy
- [x] Domain kithwheel.org (www and kithwheel.vercel.app redirect to it)
- [x] Sending email (Resend, domain verified) and receiving hello@kithwheel.org (ImprovMX)
- [x] Stripe sandbox: product, $60/month and $600/year prices, Customer Portal,
      webhook at https://kithwheel.org/api/stripe/webhook (8 events)
- [x] Stripe Tax defaults: SaaS tax code `txcd_10103001`, tax-exclusive prices

## Business (before activating Stripe)

- [ ] Form the LLC and get an EIN
- [ ] Business bank account
- [ ] Terms of service and privacy policy, linked from the site and the registration form.
      Kithwheel now stores children's names, attendance, family contact details and payment
      records, so this matters before real co-ops sign up.
- [ ] Recommended: DMARC record `_dmarc` → `v=DMARC1; p=none;` (if not added yet)

## Stripe go-live (after the LLC)

1. Activate the live account: business type LLC, legal name + EIN, address, website
   `https://kithwheel.org`, description, public name **Kithwheel**, statement
   descriptor **KITHWHEEL**, payout bank account, representative identity.
2. Settings → Tax: head office address. Add registrations when Stripe's threshold
   monitoring says you need them, then set `STRIPE_AUTOMATIC_TAX=true` in Vercel.
3. Settings → Payment methods: cards, Apple/Google Pay, Link, ACH Direct Debit;
   turn off Klarna, Affirm, Cash App Pay, Amazon Pay.
4. Settings → Branding: logo and Kithwheel green.
5. Live mode: run `STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs`
   once (creates the product, prices, and portal configuration in live mode).
6. Live mode: Developers → Webhooks → add `https://kithwheel.org/api/stripe/webhook`
   with the same 8 events as the sandbox (see docs/payments.md).
7. Vercel → Environment Variables: replace `STRIPE_SECRET_KEY` (sk_live_...) and
   `STRIPE_WEBHOOK_SECRET` (live whsec_...), then redeploy.
8. Test with a real card and a real (small) subscription, then refund and cancel it.

## When ready to be found on Google

- [ ] Vercel: `SEO_INDEXABLE=true`, redeploy

## Demo

- Demo account on kithwheel.org: `demo@kithwheel.org` (sample co-op "Maple Grove
  Homeschool Co-op"). Its free trial ends 30 days after 2026-11-02.
- The demo co-op has 10 sample families (filled by `scripts/seed-demo.mjs`) with fees,
  payments, volunteer hours, attendance, a waitlist and one announcement. Their emails are
  Resend test addresses (`delivered+…@resend.dev`), so announcements in a demo succeed
  without emailing anyone. The family link and check-in tablet link are on the Families
  and Check-in tabs.
- Test data from setup checks: accounts and co-ops named "(delete me)" can be removed.
