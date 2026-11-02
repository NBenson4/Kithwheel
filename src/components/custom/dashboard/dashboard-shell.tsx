// Signed-in shell for Kithwheel coordinator surfaces.
'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { ProductNavigation } from '@/components/custom/product-navigation';
import { useSession } from '@/lib/auth-client';

export interface DashboardShellProps {
  children: ReactNode;
}

export function ProductShell({ children }: DashboardShellProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session?.user) router.replace('/login');
  }, [isPending, router, session?.user]);

  if (isPending || !session?.user) {
    return (
      <main className="kw-product-state">
        <output aria-live="polite">
          {isPending ? 'Opening your Kithwheel account…' : 'Returning to sign in…'}
        </output>
      </main>
    );
  }

  return (
    <div className="kw-product-shell">
      <ProductNavigation />
      <main className="kw-product-content" id="main-content">
        {children}
      </main>
    </div>
  );
}
