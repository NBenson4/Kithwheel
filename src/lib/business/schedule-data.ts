// @polsia:user-owned — server-only response shaping for co-op schedule routes.
import 'server-only';
import { ScheduleList } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';

export async function readScheduleList(coopId: string) {
  const [coop, schedules] = await Promise.all([
    prisma.coop.findUnique({ where: { id: coopId }, select: { currentScheduleId: true } }),
    prisma.coopSchedule.findMany({
      where: { coopId },
      include: {
        rotations: {
          orderBy: { position: 'asc' },
          include: {
            entries: {
              orderBy: { position: 'asc' },
              include: {
                class: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    teacher: true,
                    room: true,
                    time: true,
                    coopId: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);
  const items = schedules.map((schedule) => ({
    ...schedule,
    status: schedule.status.toLowerCase(),
    publishedAt: schedule.publishedAt?.toISOString() ?? null,
    withdrawnAt: schedule.withdrawnAt?.toISOString() ?? null,
    rotations: schedule.rotations.map((rotation) => ({
      ...rotation,
      entries: rotation.entries.map((entry) => ({ ...entry, class: entry.class })),
    })),
  }));
  return ScheduleList.parse({ items, currentScheduleId: coop?.currentScheduleId ?? null });
}
