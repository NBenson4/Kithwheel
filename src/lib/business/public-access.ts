// Looks up the co-op or family behind a private link.
import 'server-only';
import { NextResponse } from 'next/server';
import { plausibleToken } from '@/lib/business/tokens';
import { prisma } from '@/lib/db';

export const linkNotFound = () =>
  NextResponse.json(
    { error: 'This link isn’t working. Ask your co-op coordinator for a current one.' },
    { status: 404 },
  );

export async function coopByShareToken(token: string) {
  if (!plausibleToken(token)) return null;
  return prisma.coop.findUnique({ where: { shareToken: token } });
}

export async function familyByToken(token: string) {
  if (!plausibleToken(token)) return null;
  return prisma.coopFamily.findUnique({
    where: { accessToken: token },
    include: { coop: true },
  });
}

export const noStore = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
