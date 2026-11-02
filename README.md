# Kithwheel

Co-op management for homeschool co-ops: class rotations, schedules, family
sign-ups, announcements, payments, and volunteer hours in one place.

## Stack

- Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4
- PostgreSQL with Prisma 6
- Better Auth for email/password accounts, password reset, and an admin role
- Resend for transactional email
- Stripe Billing for co-op subscriptions (Checkout, Customer Portal, webhooks)
- Vitest (unit), Playwright (end-to-end), Biome (lint and format)

## Getting started

Requirements: Node 20.18.1 or newer, and a PostgreSQL 13+ database.

```bash
npm install
cp .env.example .env.local      # then fill in DATABASE_URL and BETTER_AUTH_SECRET
npm run db:migrate:deploy       # create the tables
npm run dev                     # http://localhost:3000
```

Without `RESEND_API_KEY`, emails (verification, password reset) are printed to
the dev server's console instead of being sent, so you can follow the links
locally.

To make yourself an admin, set `OWNER_EMAIL` to your address, sign up with it,
and verify the email.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run lint:fix` | Biome lint and format check |
| `npm run typecheck` | TypeScript check (run after a build so route types exist) |
| `npm test` | Unit tests |
| `npm run test:e2e` | Playwright end-to-end tests against a running app |
| `npm run test:postgres` | Database connection-pool test (needs `TEST_DATABASE_URL`) |
| `npm run db:migrate:dev` | Create a new migration after editing `prisma/schema/*.prisma` |
| `npm run db:migrate:deploy` | Apply pending migrations (run on every deploy, before `npm start`) |
| `npm run db:studio` | Browse the database |
| `npm run stripe:setup` | Create or update the Stripe product, prices, and Customer Portal (reads `.env.local`) |

## Project layout

```text
prisma/
  schema/            _base.prisma (datasource + generator), auth.prisma, coops.prisma
  migrations/        SQL migrations, applied in order by `prisma migrate deploy`
src/
  app/
    (setup)/page.tsx     Public landing page at /
    (auth)/              Sign-up, sign-in, password reset, account
    (dashboard)/         Coordinator workspace (/dashboard) and admin (/admin)
    api/coops/           Co-op, class, and schedule route handlers
    api/auth/            Better Auth endpoints
  components/
    ui/                  shadcn/ui primitives
    custom/              Kithwheel components (scheduling, navigation, auth forms)
  lib/
    auth.ts, auth-config.ts   Server auth setup
    business/            Server-side business logic (coordinator access checks, schedule shaping)
    contracts/           Shared zod schemas used by both routes and the client
    email/               Email transport (send.ts) and templates
    env.ts               Typed environment variables
tests/
  unit/  integration/  e2e/
```

## Conventions

- Data flows through `/api/*` route handlers; client pages call them with
  `apiFetch` from `src/lib/api-client.ts`. No Server Actions.
- Each resource has one zod contract in `src/lib/contracts/`, used to validate
  both the request and the response.
- Every mutating route calls `sameOrigin(request)` first (CSRF guard), then the
  relevant access check, such as `requireCoopCoordinator(coopId)`.
- Validation errors return `{ errors: { field: 'Message' } }` with status 400.
- Request-time security headers and the per-request CSP nonce live in
  `proxy.ts`, `next.config.ts`, and `src/lib/csp.ts`.

## Billing

Co-ops get a 30-day free trial, then subscribe for $60/month or $600/year through
Stripe Checkout. See [docs/payments.md](docs/payments.md) for the design, the webhook
events to register, and the Stripe Dashboard settings. To check billing end to end
against a Stripe sandbox, run the app and then
`node --env-file=.env.local tests/manual/billing-sandbox.mjs`.

## Deploying

Any Node host with PostgreSQL works. On each deploy:

1. Set the variables from `.env.example` (production needs `RESEND_API_KEY`
   and a verified `EMAIL_FROM` domain).
2. Build: `npm ci && npm run build`
3. Release: `npm run db:migrate:deploy`
4. Start: `npm start`

`GET /health` returns 200 for health checks.

## History

The first version was generated with Polsia and migrated off it. See
`database/polsia-export/` for the original schema export and
`THIRD_PARTY_NOTICES.md` for the template's license.
