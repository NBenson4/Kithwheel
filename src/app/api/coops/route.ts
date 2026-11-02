// Coordinator-owned co-op workspaces.
import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { trialEndFrom } from '@/lib/billing/entitlement';
import { CoopCreate, CoopList, CoopRecord } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const coops = await prisma.coop.findMany({
    where: { memberships: { some: { userId: session.user.id, role: 'coordinator' } } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(CoopList.parse({ items: coops }));
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const parsed = CoopCreate.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const coop = await prisma.coop.create({
      data: {
        name: parsed.data.name,
        createdByUserId: session.user.id,
        trialEndsAt: trialEndFrom(new Date()),
        memberships: { create: { userId: session.user.id, role: 'coordinator' } },
      },
      select: { id: true, name: true },
    });
    return NextResponse.json(CoopRecord.parse(coop), { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
