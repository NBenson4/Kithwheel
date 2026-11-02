// Where to go after signing in or up: a same-site `?next=` path, or the dashboard.
// Only plain app paths are accepted, so the parameter can't send people off-site.

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/dashboard';
  }
  return value;
}

export function nextPath(): string {
  if (typeof window === 'undefined') return '/dashboard';
  return safeNextPath(new URL(window.location.href).searchParams.get('next'));
}
