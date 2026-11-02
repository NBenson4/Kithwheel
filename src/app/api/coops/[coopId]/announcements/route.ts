// Announcements: saved for families' pages and emailed to every family (or one class).
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator, requireCoopEditor } from '@/lib/business/coordinator-auth';
import { familyUrl } from '@/lib/business/families';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { AnnouncementCreate, AnnouncementList } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';
import { sendEmailBatch } from '@/lib/email/send';
import { announcementEmail } from '@/lib/email/templates';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

async function readAnnouncements(coopId: string) {
  const items = await prisma.coopAnnouncement.findMany({
    where: { coopId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { class: { select: { name: true } } },
  });
  return AnnouncementList.parse({
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      classId: item.classId,
      className: item.class?.name ?? null,
      recipientCount: item.recipientCount,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  return NextResponse.json(await readAnnouncements(coopId));
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, AnnouncementCreate);
  if (!body.ok) return body.response;
  const classId = body.data.classId ?? null;

  try {
    const coop = await prisma.coop.findUniqueOrThrow({
      where: { id: coopId },
      select: { name: true },
    });
    let className: string | null = null;
    if (classId) {
      const item = await prisma.coopClass.findFirst({
        where: { id: classId, coopId },
        select: { name: true },
      });
      if (!item) return notFound('Class');
      className = item.name;
    }
    const families = await prisma.coopFamily.findMany({
      where: {
        coopId,
        ...(classId
          ? { children: { some: { enrollments: { some: { classId, status: 'ENROLLED' } } } } }
          : {}),
      },
      select: { email: true, accessToken: true },
    });
    const announcement = await prisma.coopAnnouncement.create({
      data: {
        coopId,
        classId,
        title: body.data.title,
        body: body.data.body,
        createdByUserId: access.userId,
        recipientCount: families.length,
      },
    });
    try {
      await sendEmailBatch(
        families.map((family) => ({
          to: family.email,
          replyTo: access.email,
          ...announcementEmail({
            coopName: coop.name,
            title: body.data.title,
            body: body.data.body,
            className,
            url: familyUrl(family.accessToken),
          }),
        })),
      );
    } catch {
      await prisma.coopAnnouncement.update({
        where: { id: announcement.id },
        data: { recipientCount: 0 },
      });
      return NextResponse.json(
        {
          error:
            'The announcement was saved to families’ pages, but the emails couldn’t be sent. Try again later.',
        },
        { status: 502 },
      );
    }
    return NextResponse.json(await readAnnouncements(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
