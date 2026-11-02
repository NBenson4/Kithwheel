// Private-link page (no sign-in). Kept out of search engines and the sitemap.
import type { Metadata } from 'next';
import { InviteView } from '@/components/custom/coop/public/invite-view';

export const metadata: Metadata = {
  title: 'Coordinator invitation',
  description: 'Join a co-op on Kithwheel.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteView token={token} />;
}
