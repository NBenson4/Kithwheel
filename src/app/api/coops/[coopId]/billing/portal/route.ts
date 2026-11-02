// Opens Stripe's Customer Portal for the co-op: change plan, update card,
// download invoices, or cancel at the end of the period.
import 'server-only';
import { NextResponse } from 'next/server';
import { getStripe, portalConfigurationIdFor } from '@/lib/billing/stripe';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';
import { RedirectUrl } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';
import { siteUrl } from '@/lib/site';

type RouteContext = { params: Promise<{ coopId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 });

  const coop = await prisma.coop.findUnique({
    where: { id: coopId },
    select: { stripeCustomerId: true },
  });
  if (!coop?.stripeCustomerId) {
    return NextResponse.json({ error: 'Choose a plan first.' }, { status: 409 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: coop.stripeCustomerId,
      configuration: await portalConfigurationIdFor(stripe),
      return_url: `${siteUrl}/dashboard?billing=portal&coop=${encodeURIComponent(coopId)}`,
    });
    return NextResponse.json(RedirectUrl.parse({ url: session.url }));
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: server diagnostics for billing failures.
    console.error('[billing] portal failed', error);
    return NextResponse.json(
      { error: 'We could not open billing. Please try again.' },
      { status: 502 },
    );
  }
}
