// Private-link page (no sign-in). Kept out of search engines and the sitemap.
import type { Metadata } from 'next';
import { FamilyHomeView } from '@/components/custom/coop/public/family-home-view';

export const metadata: Metadata = {
  title: 'Your family page',
  description: 'Your family’s classes, announcements, fees and volunteer hours.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FamilyHomeView token={token} />;
}
