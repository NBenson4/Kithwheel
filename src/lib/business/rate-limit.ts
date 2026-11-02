// Best-effort per-instance rate limit for the public (no sign-in) family endpoints.
// Serverless instances don't share memory, so this slows abuse rather than stopping it;
// the honeypot field and per-co-op checks do the rest.
import 'server-only';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${scope}:${forwarded || request.headers.get('x-real-ip') || 'unknown'}`;
}

/** True when the caller is still under `limit` requests per `windowMs`. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > 10_000) {
    for (const [entry, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(entry);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
