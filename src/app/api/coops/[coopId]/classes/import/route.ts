// Bulk-create classes from a spreadsheet (parsed and previewed in the browser).
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, readBody, serverError } from '@/lib/business/route-helpers';
import { ClassImport, ImportResult } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, ClassImport);
  if (!body.ok) return body.response;
  const existing = await prisma.coopClass.count({ where: { coopId } });
  if (existing + body.data.classes.length > 500) {
    return NextResponse.json({ error: 'A co-op can have up to 500 classes.' }, { status: 409 });
  }
  try {
    const result = await prisma.coopClass.createMany({
      data: body.data.classes.map((item) => ({
        coopId,
        name: item.name,
        description: item.description || null,
        teacher: item.teacher || null,
        room: item.room || null,
        time: item.time || null,
        capacity: item.capacity ?? null,
        feeCents: item.feeCents ?? 0,
        materials: item.materials || null,
      })),
    });
    return NextResponse.json(ImportResult.parse({ created: result.count }), { status: 201 });
  } catch {
    return serverError();
  }
}
