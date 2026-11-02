# Payments plan (Stripe)

Generated with Stripe's implementation planner (guide `iguide_61VgZ2fWZf0cZP1R941QnOBOChu75`,
sandbox `acct_1UWtmBQnOBOChu75`) and checked against Stripe's docs. Kithwheel has two
separate money flows. Build Flow 1 first.

## Core model: one Stripe Account per co-op (Accounts v2)

Each co-op maps to one Accounts v2 `Account` (`acct_...`), stored on `Coop.stripeAccountId`.
Configurations are added as the co-op needs them:

| Configuration | Added when | Enables |
| --- | --- | --- |
| `customer` | Co-op starts a Kithwheel subscription | Paying Kithwheel (`customer_account` on Checkout, Subscriptions, Portal) |
| `merchant` | Coordinator turns on family payments | Accepting payments from families (direct charges) |

A co-op that only uses scheduling never goes through Stripe identity verification.
Use v2 Accounts everywhere; do not create v1 `Customer` objects or legacy `type` accounts.

## Flow 1: co-ops pay Kithwheel (Billing + Tax + Invoicing)

- **Checkout:** Stripe-hosted Checkout, `mode: subscription`, `customer_account`, flexible billing mode.
  Server route creates the session; the client redirects to `session.url`.
- **Pricing:** one product ("Kithwheel"), flat-rate prices with lookup keys
  `kithwheel_monthly` and `kithwheel_annual`. Product tax code for SaaS.
- **Billing model:** pay up front (trial optional; a config detail if added later).
- **Pay by invoice:** for co-ops that can't use a card, create the subscription with
  `collection_method: send_invoice` and `days_until_due`; they pay on the Hosted Invoice
  Page (card or ACH bank transfer).
- **Self-service:** Customer Portal (`billing_portal.sessions` with `customer_account`) for
  plan changes, payment method, invoices, cancellation (cancel at period end).
- **Failed payments:** Smart Retries + automated emails + automatic card updates (Dashboard settings).
- **Tax:** no registrations yet, so start with Stripe Tax threshold monitoring; set the origin
  address and product tax code; pass `automatic_tax[enabled]=true` so tax is collected
  automatically wherever a registration is added later.
- **Access gating (webhooks):** store subscription id + status on the co-op.
  - `checkout.session.completed` → link subscription to co-op, grant access
  - `customer.subscription.updated` / `.deleted` → sync status, revoke on cancel
  - `invoice.paid` → keep access; `invoice.payment_failed` → notify coordinator, link to Portal
  - Paid features check status server-side (`active` / `trialing`; grace period for `past_due`).

## Flow 2: families pay their co-op (Connect + Invoicing)

- **Platform type:** SaaS platform. The co-op is merchant of record (direct charges); its name
  is on the family's statement.
- **Account responsibilities:** `fees_collector: stripe`, `losses_collector: stripe`,
  `dashboard: full`. Stripe manages fraud on direct charges.
- **Onboarding:** embedded onboarding via `@stripe/connect-js` inside Kithwheel, plus the
  notification banner component so accounts stay enabled as requirements change.
- **Before charging:** check `configuration.merchant.capabilities.card_payments.status` is `active`.
- **Semester fees:** Kithwheel creates invoices on the co-op's account via the API when a
  coordinator issues fees (invoice items, then invoice, `auto_advance: true`), with
  `application_fee_amount` if Kithwheel takes a platform fee. Families pay on the Hosted
  Invoice Page (cards + ACH). Invoices carry the co-op's branding.
- **One-off supply fees:** Checkout in `payment` mode on the connected account (direct charge,
  `application_fee_amount`).
- **Families are customers of the co-op's account**, not of Kithwheel's.
- **Reconciliation (webhooks, Connect endpoint):** `invoice.paid`, `invoice.payment_failed`,
  `charge.refunded`, `credit_note.created`, and for ACH `cash_balance.funds_available` and
  `customer_cash_balance_transaction.created`; update each family's fee status in Kithwheel.
  ACH settles in 1–5 business days.
- **Tax on family fees:** the co-op's responsibility (merchant of record), not Kithwheel's.

## Webhook endpoints

| Route | Source | Events |
| --- | --- | --- |
| `/api/stripe/webhook` | Platform account (snapshot events) | Checkout, subscriptions, invoices for Flow 1 |
| `/api/stripe/connect-webhook` | Connected accounts | Invoices, charges, cash balance for Flow 2 |
| `/api/stripe/v2-webhook` | Accounts v2 (thin events) | `v2.core.account[...]` configuration/capability updates |

Every handler verifies the signature with its own signing secret and is idempotent
(store processed `event.id`s).

## Environment variables

- `STRIPE_SECRET_KEY` (server only, `sk_test_...` until launch)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_...`)
- `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_V2_WEBHOOK_SECRET`

## Dashboard setup (sandbox first, then live)

1. Connect: complete the platform profile (SaaS, Stripe-owned pricing and losses).
2. Tax: set head office address; leave threshold monitoring on.
3. Billing: enable Smart Retries, failed-payment emails, and card updates; configure the Customer Portal.
4. Branding: Kithwheel logo and colors (applies to Checkout, invoices, Portal).
5. Payment methods: cards and ACH Direct Debit / bank transfer for invoices.

## Open decisions

- Prices: monthly amount and annual amount (e.g., two months free).
- Free trial: none, or N days with card on file.
- Platform fee on family payments: none, flat, or percentage.
