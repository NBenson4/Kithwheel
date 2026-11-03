// Family registration from the co-op's family link. No account needed: the family gets
// a private link to their own page by email.
import 'server-only';
import { NextResponse } from 'next/server';
import {
  coopIsActive,
  coordinatorEmails,
  familyUrl,
  PAUSED_MESSAGE,
  registerFamily,
  sendFamilyWelcome,
} from '@/lib/business/families';
import { coopByShareToken, linkNotFound } from '@/lib/business/public-access';
import { allow, clientKey } from '@/lib/business/rate-limit';
import { guardOrigin, readBody, serverError } from '@/lib/business/route-helpers';
import { FamilyCreate, RegistrationResult } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { familyLinkEmail, notificationEmail } from '@/lib/email/templates';
import { siteUrl } from '@/lib/site';

type RouteContext = { params: Promise<{ token: string }> };

const DAILY_LIMIT_PER_COOP = 300;

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  if (!allow(clientKey(request, 'register'), 40, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many registrations from this connection. Try again in an hour.' },
      { status: 429 },
    );
  }
  const { token } = await context.params;
  const coop = await coopByShareToken(token);
  if (!coop) return linkNotFound();
  if (!coop.registrationOpen) {
    return NextResponse.json({ error: 'Registration is closed right now.' }, { status: 409 });
  }
  if (!(await coopIsActive(coop.id))) {
    return NextResponse.json({ error: PAUSED_MESSAGE }, { status: 402 });
  }
  const body = await readBody(request, FamilyCreate);
  if (!body.ok) return body.response;
  // Families give a grade; only coordinators put children into sections.
  const input = {
    ...body.data,
    sendEmail: undefined,
    children: body.data.children.map((child) => ({ ...child, sectionId: null })),
  };

  // Bots fill in the hidden "website" field; pretend it worked.
  if (input.website) {
    return NextResponse.json(RegistrationResult.parse({ status: 'registered' }), { status: 201 });
  }
  const today = await prisma.coopFamily.count({
    where: { coopId: coop.id, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (today >= DAILY_LIMIT_PER_COOP) {
    return NextResponse.json(
      { error: 'Registration is very busy right now. Please try again tomorrow.' },
      { status: 429 },
    );
  }

  try {
    const outcome = await registerFamily(coop.id, input, { source: 'public' });
    if (outcome.status === 'invalid') {
      return NextResponse.json({ error: outcome.message }, { status: 400 });
    }
    const coordinators = await coordinatorEmails(coop.id);
    if (outcome.status === 'already_registered') {
      // Email the link to the address on file (not to whoever submitted), so the page stays private.
      await sendEmail({
        to: input.email,
        replyTo: coordinators[0],
        ...familyLinkEmail({
          coopName: coop.name,
          parentName: outcome.parentName,
          url: familyUrl(outcome.accessToken),
        }),
      }).catch(() => undefined);
      return NextResponse.json(RegistrationResult.parse({ status: 'already_registered' }));
    }
    await sendFamilyWelcome(coop.name, input, outcome, coordinators[0]).catch(() => undefined);
    await Promise.allSettled(
      coordinators.map((to) =>
        sendEmail({
          to,
          replyTo: input.email,
          ...notificationEmail({
            subject: `New registration: ${input.parentName}`,
            title: `${input.parentName} registered with ${coop.name}`,
            lines: [
              `${input.children.length} ${input.children.length === 1 ? 'child' : 'children'}: ${input.children.map((child) => child.name).join(', ')}.`,
              'Place them in their sections on the Families tab.',
            ],
            cta: {
              label: 'Open Families',
              url: `${siteUrl}/dashboard?coop=${coop.id}&tab=families`,
            },
          }),
        }),
      ),
    );
    return NextResponse.json(RegistrationResult.parse({ status: 'registered' }), { status: 201 });
  } catch {
    return serverError();
  }
}
