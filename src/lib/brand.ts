// @polsia:user-owned — brand identity. Edit freely. `site.ts` re-exports
// siteName/siteDescription; `manifest.ts` + `opengraph-image.tsx` read `brandVisual`.

export const siteName = 'Kithwheel';
export const siteDescription =
  'The co-op management app that keeps every moving part in sync. Schedules, sign-ups, class announcements, payments and volunteer hours for homeschool co-ops.';

// PWA + social-share colors. HEX only (CSS variables aren't readable here) — set
// them to match the theme you define in src/app/brand-theme.css. The starter
// values are achromatic placeholders, not a palette.
export const brandVisual = {
  /** PWA browser-UI / status-bar color — usually your background or primary. */
  themeColor: '#f7f5ed',
  /** PWA splash + install background. */
  backgroundColor: '#f7f5ed',
  /** Social-share (OG/Twitter) image. */
  og: {
    background: '#f7f5ed',
    foreground: '#23392f',
    /** Second line under the site name; '' hides it. */
    tagline: 'The co-op management app that keeps every moving part in sync.',
    /** Optional https PNG/JPEG background photo; '' keeps the plain-color card. */
    image: '',
  },
} as const;
