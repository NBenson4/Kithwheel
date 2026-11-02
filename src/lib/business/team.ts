// Coordinators of a co-op and their invitations.
import 'server-only';
import { Team } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

export const INVITE_DAYS = 14;

export async function readTeam(coopId: string, viewerId: string) {
  const [coop, memberships, invites] = await Promise.all([
    prisma.coop.findUniqueOrThrow({ where: { id: coopId }, select: { createdByUserId: true } }),
    prisma.coopMembership.findMany({
      where: { coopId, role: 'coordinator' },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.coopInvite.findMany({
      where: { coopId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: memberships.map((item) => item.userId) } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  return Team.parse({
    members: memberships.map((item) => ({
      id: item.id,
      name: byId.get(item.userId)?.name ?? 'Coordinator',
      email: byId.get(item.userId)?.email ?? '',
      isCreator: item.userId === coop.createdByUserId,
      isYou: item.userId === viewerId,
    })),
    invites: invites.map((item) => ({
      id: item.id,
      email: item.email,
      createdAt: item.createdAt.toISOString(),
      expiresAt: item.expiresAt.toISOString(),
    })),
  });
}
