// Announcements: saved for families' pages and emailed to every family, one section, or the
// families of children taking one class.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator, requireCoopEditor } from '@/lib/business/coordinator-auth';
import { childInclude, childSchedule, familyUrl } from '@/lib/business/families';
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
    include: { class: { select: { name: true } }, section: { select: { name: true } } },
  });
  return AnnouncementList.parse({
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      sectionId: item.sectionId,
      sectionName: item.section?.name ?? null,
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
  const sectionId = classId ? null : (body.data.sectionId ?? null);

  try {
    const coop = await prisma.coop.findUniqueOrThrow({
      where: { id: coopId },
      select: { name: true },
    });
    let audience: string | null = null;
    if (classId) {
      const item = await prisma.coopClass.findFirst({
        where: { id: classId, coopId },
        select: { name: true },
      });
      if (!item) return notFound('Class');
      audience = item.name;
    } else if (sectionId) {
      const section = await prisma.coopSection.findFirst({
        where: { id: sectionId, coopId },
        select: { name: true },
      });
      if (!section) return notFound('Section');
      audience = section.name;
    }
    const allFamilies = await prisma.coopFamily.findMany({
      where: { coopId },
      select: {
        email: true,
        accessToken: true,
        children: { include: childInclude },
      },
    });
    const families = allFamilies.filter((family) => {
      if (sectionId) return family.children.some((child) => child.sectionId === sectionId);
      if (classId) {
        return family.children.some((child) =>
          childSchedule(child, { approvedOnly: false }).some(({ item }) => item.id === classId),
        );
      }
      return true;
    });
    const announcement = await prisma.coopAnnouncement.create({
      data: {
        coopId,
        classId,
        sectionId,
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
            audience,
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
