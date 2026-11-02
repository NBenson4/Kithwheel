// The co-op boundary used by every coordinator API route.
import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { entitlement } from '@/lib/billing/entitlement';
import { prisma } from '@/lib/db';

type CoordinatorAccess =
  | { ok: true; userId: string; email: string; name: string }
  | { ok: false; response: NextResponse };

export async function requireCoopCoordinator(coopId: string): Promise<CoordinatorAccess> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }

  // Any coordinator membership grants access, so invited co-coordinators share the co-op.
  const membership = await prisma.coopMembership.findFirst({
    where: { coopId, userId: session.user.id, role: 'coordinator' },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }

  return {
    ok: true,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export const BILLING_REQUIRED_MESSAGE =
  'Your free trial has ended. Choose a plan in Billing to keep editing this co-op.';

/**
 * Coordinator access plus an active trial or subscription. Use it on every route
 * that creates or changes co-op records; reading stays available without a plan.
 * Answers 402 with `code: "billing_required"` when the co-op needs a plan.
 */
export async function requireCoopEditor(coopId: string): Promise<CoordinatorAccess> {
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access;

  const coop = await prisma.coop.findUnique({
    where: { id: coopId },
    select: {
      trialEndsAt: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionInterval: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });
  if (!coop) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  if (!entitlement(coop).canEdit) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: BILLING_REQUIRED_MESSAGE, code: 'billing_required' },
        { status: 402 },
      ),
    };
  }
  return access;
}
