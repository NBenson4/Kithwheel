// @polsia:user-owned — set a new password with the one-time Better Auth token.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('token');
    if (resetToken) setToken(resetToken);
    else setInvalidLink(true);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setInvalidLink(true);
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError('This reset link is invalid or has expired. Request a new link to continue.');
        return;
      }
      setComplete(true);
    } catch {
      setError('This reset link is invalid or has expired. Request a new link to continue.');
    } finally {
      setPending(false);
    }
  }

  if (invalidLink) {
    return (
      <div className="kw-auth-result">
        <p role="alert">This reset link is invalid, expired, or already used.</p>
        <Link href="/forgot-password">Request a new link</Link>
      </div>
    );
  }

  if (!token) {
    return (
      <output className="kw-auth-loading" aria-live="polite">
        Checking your reset link…
      </output>
    );
  }

  if (complete) {
    return (
      <div className="kw-auth-result">
        <output aria-live="polite">
          Your password has been updated. Sign in with your new password.
        </output>
        <Link href="/login">Continue to sign in</Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <Label htmlFor="new-password">New password</Label>
      <Input
        id="new-password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'new-password-error' : undefined}
      />
      <Label htmlFor="confirm-password">Confirm new password</Label>
      <Input
        id="confirm-password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'new-password-error' : undefined}
      />
      {error ? (
        <p id="new-password-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Updating password…' : 'Save new password'}
      </Button>
    </form>
  );
}
