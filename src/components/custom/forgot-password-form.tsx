// @polsia:user-owned — request a one-time password reset email.
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        setError('We could not send a reset link. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('We could not send a reset link. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="kw-auth-result">
        <output aria-live="polite">
          If this email matches a Kithwheel account, a password reset link is on its way. It expires
          in one hour and can only be used once.
        </output>
        <Link href="/login">Return to sign in</Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <Label htmlFor="reset-request-email">Email address</Label>
      <Input
        id="reset-request-email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'reset-request-error' : undefined}
      />
      {error ? (
        <p id="reset-request-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending link…' : 'Email me a reset link'}
      </Button>
    </form>
  );
}
