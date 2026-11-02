// Private-link page (no sign-in). Kept out of search engines and the sitemap.
import type { Metadata } from 'next';
import { PublicCoopView } from '@/components/custom/coop/public/public-coop-view';

export const metadata: Metadata = {
  title: 'Co-op schedule',
  description: 'The co-op’s class schedule and registration.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicCoopView token={token} />;
}
