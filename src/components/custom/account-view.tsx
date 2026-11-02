// Account details and the coordinator sign-out action.
'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { signOut, useSession } from '@/lib/auth-client';

export function AccountView() {
  const { data: session } = useSession();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    setSignOutError(null);
    try {
      const result = await signOut();
      if (result.error) {
        setSignOutError('We could not sign you out. Please try again.');
        setPending(false);
        return;
      }
      window.location.assign('/');
    } catch {
      setSignOutError('We could not sign you out. Please try again.');
      setPending(false);
    }
  }

  if (!session?.user) return null;

  return (
    <section className="kw-account" aria-labelledby="account-title">
      <p className="kw-account-kicker">Coordinator account</p>
      <h1 className="kw-account-title" id="account-title">
        Account
      </h1>
      <p className="kw-account-description">
        Your details for signing in to Kithwheel and opening your private workspace.
      </p>

      <dl className="kw-account-details">
        <div>
          <dt>Name</dt>
          <dd>{session.user.name || 'Name not provided'}</dd>
        </div>
        <div>
          <dt>Email address</dt>
          <dd>{session.user.email}</dd>
        </div>
      </dl>

      <p className="kw-account-note">
        This account is for Kithwheel coordinator access. It does not collect or represent any fees
        families may pay their co-op.
      </p>

      {signOutError ? (
        <p className="kw-account-error" role="alert">
          {signOutError}
        </p>
      ) : null}

      <div className="kw-account-actions">
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to Workspace</Link>
        </Button>
        <button
          className="kw-account-signout"
          type="button"
          onClick={handleSignOut}
          disabled={pending}
        >
          <LogOut aria-hidden="true" size={16} />
          {pending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </section>
  );
}
