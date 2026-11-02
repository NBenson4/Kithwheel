// Next.js config: security headers, image policy, and composition with
// next.user-config.ts.
//   - Security headers ship on every response; every header below is explicit.
//   - Cache Components stay OFF. Do not add `cacheComponents: true` without
//     reviewing per-request CSP nonces and auth-dependent rendering first.

import type { NextConfig } from 'next';
import { version as nextVersion } from 'next/package.json';

// Eager-load so @t3-oss validates env on every build (relative path: @/ won't resolve here).
import './src/lib/env';

// User-owned bits (remote image hosts, package options, and one-off config plugins)
// live in next.user-config.ts; customize there, not here. Keys below
// always win, and the security headers are re-asserted after plugin composition.
import {
  appCapabilities,
  userConfigPlugins,
  userNextConfig,
  userRemotePatterns,
} from './next.user-config';
// Builds the Permissions-Policy value from appCapabilities (relative path: @/ won't resolve here).
import { buildPermissionsPolicy } from './src/lib/permissions-policy';

// Next 16.3+ `next dev` would otherwise generate an AGENTS.md file; older Next rejects the key.
const [nextMajor = 0, nextMinor = 0] = nextVersion.split('.').map(Number);
const agentRulesOff =
  nextMajor > 16 || (nextMajor === 16 && nextMinor >= 3) ? { agentRules: false } : {};

const nextConfig: NextConfig = {
  ...userNextConfig,
  reactStrictMode: true,
  poweredByHeader: false,
  ...agentRulesOff,

  // Cache Components stay off (the default).

  // Image security.
  images: {
    // Allowed remote image hosts come from next.user-config.ts.
    remotePatterns: [...userRemotePatterns],
    localPatterns: [{ pathname: '/assets/**', search: '' }],
    dangerouslyAllowLocalIP: false,
    qualities: [75],
  },

  // Security headers — MUST pass on day 1.
  // CSP is set in `proxy.ts` because the nonce is per-request.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // X-Frame-Options is obsoleted by CSP frame-ancestors per OWASP, but
          // we ship both for defense in depth across older browsers.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // Locked-down by default; apps opt features in via appCapabilities
            // (next.user-config.ts). browsing-topics stays hard-off.
            key: 'Permissions-Policy',
            value: buildPermissionsPolicy(appCapabilities),
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

// Compose the user's config plugins (next.user-config.ts) outermost, then re-assert
// the security keys so a plugin can extend the build (webpack/turbopack/etc.) but
// never drop the day-1 security headers or re-enable the powered-by header.
const withConfigPlugins = userConfigPlugins.reduce((config, plugin) => plugin(config), nextConfig);

export default {
  ...withConfigPlugins,
  headers: nextConfig.headers,
  poweredByHeader: false,
} satisfies NextConfig;
