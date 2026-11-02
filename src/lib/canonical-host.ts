// Production deployments are also reachable at per-deploy *.vercel.app addresses
// (the links in Vercel's dashboard). Sign-in only trusts the public domain, so
// pages opened there would fail with "Invalid origin". This sends those visitors
// to the same path on the public domain instead.
//
// Only production *.vercel.app hosts are redirected: preview deployments keep
// their own address, and unknown hosts are left alone to avoid redirect loops.

/** The URL to redirect to, or null when the request is already on the right host. */
export function canonicalRedirect(
  requestUrl: string,
  host: string | null,
  options: { appUrl: string | undefined; vercelEnv: string | undefined },
): string | null {
  if (options.vercelEnv !== 'production' || !options.appUrl || !host) return null;

  let canonical: URL;
  try {
    canonical = new URL(options.appUrl);
  } catch {
    return null;
  }

  const requestHost = host.toLowerCase().split(':')[0] ?? '';
  if (requestHost === canonical.hostname || !requestHost.endsWith('.vercel.app')) return null;

  const current = new URL(requestUrl);
  return new URL(`${current.pathname}${current.search}`, canonical.origin).toString();
}
