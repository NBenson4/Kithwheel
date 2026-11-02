import { describe, expect, it } from 'vitest';
import { canonicalRedirect } from '@/lib/canonical-host';

const production = { appUrl: 'https://kithwheel.org', vercelEnv: 'production' };

describe('canonicalRedirect', () => {
  it('sends production deployment URLs to the public domain, keeping path and query', () => {
    expect(
      canonicalRedirect(
        'https://kithwheel-abc123-nbenson4.vercel.app/forgot-password?x=1',
        'kithwheel-abc123-nbenson4.vercel.app',
        production,
      ),
    ).toBe('https://kithwheel.org/forgot-password?x=1');
  });

  it('leaves the public domain alone', () => {
    expect(canonicalRedirect('https://kithwheel.org/signup', 'kithwheel.org', production)).toBe(
      null,
    );
  });

  it('leaves preview deployments and local development alone', () => {
    const url = 'https://kithwheel-git-feature-nbenson4.vercel.app/';
    const host = 'kithwheel-git-feature-nbenson4.vercel.app';
    expect(canonicalRedirect(url, host, { ...production, vercelEnv: 'preview' })).toBe(null);
    expect(canonicalRedirect(url, host, { ...production, vercelEnv: undefined })).toBe(null);
  });

  it('never redirects hosts that are not *.vercel.app', () => {
    expect(canonicalRedirect('https://example.com/', 'example.com', production)).toBe(null);
  });

  it('does nothing without a valid public URL', () => {
    const url = 'https://kithwheel-abc.vercel.app/';
    expect(
      canonicalRedirect(url, 'kithwheel-abc.vercel.app', { ...production, appUrl: undefined }),
    ).toBe(null);
    expect(
      canonicalRedirect(url, 'kithwheel-abc.vercel.app', { ...production, appUrl: 'nope' }),
    ).toBe(null);
  });
});
