// Private-link page (no sign-in). Kept out of search engines and the sitemap.
import type { Metadata } from 'next';
import { KioskView } from '@/components/custom/coop/public/kiosk-view';

export const metadata: Metadata = {
  title: 'Check-in',
  description: 'Co-op morning check-in.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <KioskView token={token} />;
}
