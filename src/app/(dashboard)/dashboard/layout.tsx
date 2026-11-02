// @polsia:user-owned

import type { ReactNode } from 'react';
import { ProductShell } from '@/components/custom/dashboard/dashboard-shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <ProductShell>{children}</ProductShell>;
}
