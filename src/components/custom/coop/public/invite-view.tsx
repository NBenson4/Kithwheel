// Accept an invitation to coordinate a co-op.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { z } from 'zod';
import authStyles from '@/components/custom/auth-pages.module.css';
import { errorMessage, post } from '@/components/custom/coop/shared';
import { KithwheelMark } from '@/components/custom/kithwheel-mark';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { InviteAccepted, InviteInfo } from '@/lib/contracts/coop-features';

type InviteInfoType = z.infer<typeof InviteInfo>;

export function InviteView({ token }: { token: string }) {
  const { data: session, isPending } = useSession();
  const [invite, setInvite] = useState<InviteInfoType | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const next = encodeURIComponent(`/invite/${token}`);

  useEffect(() => {
    apiFetch(`/api/invites/${token}`, { schema: InviteInfo })
      .then(setInvite)
      .catch(() => setMissing(true));
  }, [token]);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      const result = await apiFetch(`/api/invites/${token}`, {
        ...post({}),
        schema: InviteAccepted,
      });
      window.location.assign(`/dashboard?coop=${result.coopId}`);
    } catch (err) {
      setError(errorMessage(err));
      setAccepting(false);
    }
  }

  return (
    <main className={authStyles.page}>
      <Link href="/" className={authStyles.brand} aria-label="Kithwheel home">
        <KithwheelMark className={authStyles.mark} />
        Kithwheel
      </Link>
      <section className={authStyles.card}>
        <p className={authStyles.eyebrow}>Coordinator invitation</p>
        {missing ? (
          <>
            <h1 className={authStyles.title}>This invitation isn’t valid</h1>
            <p className={authStyles.description}>
              Ask the coordinator who invited you to send a new one.
            </p>
          </>
        ) : !invite || isPending ? (
          <p className={authStyles.description}>Loading…</p>
        ) : (
          <>
            <h1 className={authStyles.title}>Join {invite.coopName}</h1>
            <p className={authStyles.description}>
              {invite.invitedBy} invited {invite.email} to help coordinate {invite.coopName}.
            </p>
            {invite.status === 'expired' && (
              <p className={base.error}>This invitation has expired. Ask for a new one.</p>
            )}
            {invite.status === 'accepted' && (
              <p className={authStyles.description}>
                This invitation was already accepted.{' '}
                <Link href="/dashboard">Open your workspace</Link>.
              </p>
            )}
            {invite.status === 'valid' &&
              (session?.user ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <p className={authStyles.description} style={{ margin: 0 }}>
                    Signed in as {session.user.email}.
                  </p>
                  <button
                    className={base.button}
                    type="button"
                    disabled={accepting}
                    onClick={() => void accept()}
                  >
                    {accepting ? 'Joining…' : `Join ${invite.coopName}`}
                  </button>
                  {error && (
                    <p className={base.error} role="alert">
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <Link className={base.button} href={`/signup?next=${next}`}>
                    Create an account with {invite.email}
                  </Link>
                  <Link className={base.quietButton} href={`/login?next=${next}`}>
                    I already have an account
                  </Link>
                </div>
              ))}
          </>
        )}
      </section>
    </main>
  );
}
