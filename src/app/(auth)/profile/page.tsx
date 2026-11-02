// The signed-in coordinator's Account page.
import type { Metadata } from 'next';
import { AccountView } from '@/components/custom/account-view';
import { ProductShell } from '@/components/custom/dashboard/dashboard-shell';

export const metadata: Metadata = {
  title: 'Account | Kithwheel',
  description: 'View your Kithwheel coordinator account and sign out securely.',
};

export default function AccountPage() {
  return (
    <ProductShell>
      <AccountView />
    </ProductShell>
  );
}
