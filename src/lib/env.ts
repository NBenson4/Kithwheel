// Typed environment variables via @t3-oss/env-nextjs.
//
// Every variable the app reads is declared here, and documented in .env.example.
// Server-only values must never be prefixed NEXT_PUBLIC_ (those are inlined into
// the browser bundle).
//
// SKIP_ENV_VALIDATION=1 bypasses validation for env-less builds (lint, CI, local
// builds without a database).

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Postgres connection string. Use sslmode=require in production.
    DATABASE_URL: z.string().url(),

    // Email (Resend). Optional in development: without a key, emails are printed
    // to the server console instead of being sent. Required in production.
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default('Kithwheel <onboarding@resend.dev>'),
    EMAIL_REPLY_TO: z.string().email().optional(),

    // Authentication (Better Auth).
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    // Extra exact origins the app is served on (comma-separated), e.g. a www host.
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
    // The verified account with this email is granted the admin role.
    OWNER_EMAIL: z.string().email().optional(),
    // Optional "Continue with Google": both must be set to enable it.
    GOOGLE_SIGNIN_CLIENT_SECRET: z.string().min(1).optional(),

    // Billing (Stripe). Without a secret key, billing routes answer 503 and
    // co-ops simply stay on their free trial; set it everywhere billing is used.
    STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
    // Turn on once Stripe Tax has a head office address and at least one registration.
    STRIPE_AUTOMATIC_TAX: z.enum(['true', 'false']).default('false'),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    // Base for @/lib/api-client and proxy.ts connect-src. Unset means same-origin `/api`.
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_GOOGLE_SIGNIN_CLIENT_ID: z.string().min(1).optional(),
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    GOOGLE_SIGNIN_CLIENT_SECRET: process.env.GOOGLE_SIGNIN_CLIENT_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_AUTOMATIC_TAX: process.env.STRIPE_AUTOMATIC_TAX,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_GOOGLE_SIGNIN_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_SIGNIN_CLIENT_ID,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
