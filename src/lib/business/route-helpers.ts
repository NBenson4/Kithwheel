// Small helpers shared by the co-op route handlers.
import 'server-only';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { sameOrigin } from '@/lib/same-origin';

export const forbiddenOrigin = () => NextResponse.json({ error: 'forbidden' }, { status: 403 });
export const notFound = (what: string) =>
  NextResponse.json({ error: `${what} not found` }, { status: 404 });
export const serverError = () =>
  NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });

/** Reads and validates a JSON body. Returns the data, or a 400 response with field errors. */
export async function readBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  const flat = parsed.error.flatten();
  const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;
  const first = flat.formErrors[0] ?? Object.values(fieldErrors).flat()[0];
  return {
    ok: false,
    response: NextResponse.json(
      { error: first ?? 'Check the form and try again.', errors: fieldErrors },
      { status: 400 },
    ),
  };
}

export function guardOrigin(request: Request): NextResponse | null {
  return sameOrigin(request) ? null : forbiddenOrigin();
}

/** YYYY-MM-DD → a Date at UTC midnight, for @db.Date columns. */
export const dateOnly = (value: string) => new Date(`${value}T00:00:00Z`);
