// Member workspace navigation.
'use client';

import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashboardNav() {
  const pathname = usePathname();
  const active = pathname === '/dashboard' || pathname.startsWith('/dashboard/');

  return (
    <nav className="kw-dashboard-nav" aria-label="Co-op workspace">
      <Link
        href="/dashboard"
        aria-current={active ? 'page' : undefined}
        className={active ? 'kw-dashboard-nav-active' : undefined}
      >
        <CalendarDays aria-hidden="true" size={17} />
        <span>Workspace</span>
      </Link>
    </nav>
  );
}
