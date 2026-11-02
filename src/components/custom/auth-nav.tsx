// @polsia:user-owned — seeded by polsia/modules/better-auth; restyle freely.
'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth-client';

export function AuthNav() {
  const { data: session, isPending } = useSession();

  // Render nothing until the session resolves — avoids a Sign-in→Profile flash.
  if (isPending) return null;

  if (!session?.user) {
    return (
      <nav aria-label="Coordinator account" className="kw-auth-nav">
        <Link className="kw-auth-signin" href="/login">
          Sign in
        </Link>
        <Link className="kw-auth-signup" href="/signup">
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Coordinator account" className="kw-auth-nav">
      <Link className="kw-auth-signin" href="/dashboard">
        Workspace
      </Link>
      <Link className="kw-auth-signup" href="/profile">
        Account
      </Link>
    </nav>
  );
}
