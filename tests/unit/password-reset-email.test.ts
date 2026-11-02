import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from '@/lib/email/templates';

describe('password reset email', () => {
  it('uses the exact Better Auth link and explains its one-hour, one-use limit', () => {
    const url =
      'https://kithwheel.example/reset-password/opaque-token?callbackURL=%2Freset-password';
    const email = passwordResetEmail({ url });

    expect(email.subject).toBe('Reset your Kithwheel password');
    expect(email.text).toContain(url);
    expect(email.text).toContain('expires in one hour');
    expect(email.text).toContain('can only be used once');
    expect(email.html).toContain(url.replaceAll('&', '&amp;'));
  });
});
