'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GoogleSignInButton } from '@/components/custom/google-sign-in-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from '@/lib/auth-client';

// Email + password sign-in. Composes the template's base shadcn primitives
// (Button/Input/Label) styled through the theme tokens. Restyle freely — this
// file is user-owned. Calls better-auth's authClient.signIn.email; on success
// the session cookie is set by the catch-all route handler and the page reloads.
export function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const { error: signInError } = await signIn.email({
        email,
        password,
        callbackURL: '/dashboard',
      });
      if (signInError) {
        setError('That email and password do not match. Please try again.');
        return;
      }
      window.location.assign('/dashboard');
    } catch {
      setError('We could not sign you in. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Label htmlFor="sign-in-email">Email address</Label>
      <Input
        id="sign-in-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'sign-in-error' : undefined}
      />
      <Label htmlFor="sign-in-password">Password</Label>
      <Input
        id="sign-in-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'sign-in-error' : undefined}
      />
      <Link
        className="self-end text-sm text-primary underline underline-offset-4"
        href="/forgot-password"
      >
        Forgot password?
      </Link>
      {error ? (
        <p
          id="sign-in-error"
          className="text-sm text-destructive"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <GoogleSignInButton />
    </form>
  );
}
