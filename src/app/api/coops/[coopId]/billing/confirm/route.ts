// Called when a coordinator returns from Checkout. Syncs the new subscription
// right away, so the workspace unlocks even before Stripe's webhook arrives.
import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripe } from '@/lib/billing/stripe';
import { syncSubscription } from '@/lib/billing/sync';
import { readBillingStatus } from '@/lib/business/billing-data';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';
import { sameOrigin } from '@/lib/same-origin';

type RouteContext = { params: Promise<{ coopId: string }> };

const ConfirmBody = z.object({ sessionId: z.string().startsWith('cs_').max(255) });

export async function POST(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 });

  const parsed = ConfirmBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
    // Only a session started for this co-op may change it.
    if (session.client_reference_id !== coopId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (session.status === 'complete' && subscriptionId) {
      await syncSubscription(stripe, subscriptionId, coopId);
    }
    return NextResponse.json(await readBillingStatus(coopId));
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server diagnostics for billing failures.
    console.error('[billing] confirm failed', error);
    return NextResponse.json({ error: 'We could not confirm your plan yet.' }, { status: 502 });
  }
}
