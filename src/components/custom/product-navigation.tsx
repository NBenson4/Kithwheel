// @polsia:user-owned — compact coordinator navigation for Workspace and Account.
'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { KithwheelMark } from '@/components/custom/kithwheel-mark';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const productLinks = [
  { href: '/dashboard', label: 'Workspace' },
  { href: '/profile', label: 'Account' },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProductNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="kw-product-header">
      <div className="kw-product-header-inner">
        <Link href="/" className="kw-product-brand" aria-label="Kithwheel home">
          <KithwheelMark className="kw-product-mark" />
          <span>Kithwheel</span>
        </Link>

        <nav className="kw-product-desktop-nav" aria-label="Product navigation">
          {productLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={isActive(pathname, item.href) ? 'kw-product-link-active' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="kw-product-menu-trigger"
              aria-label="Open product navigation"
            >
              <Menu aria-hidden="true" size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="kw-product-mobile-sheet">
            <SheetHeader>
              <SheetTitle>Product navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Navigate between your private Workspace and Account.
              </SheetDescription>
            </SheetHeader>
            <nav aria-label="Product navigation" className="kw-product-mobile-nav">
              {productLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                  className={isActive(pathname, item.href) ? 'kw-product-link-active' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
