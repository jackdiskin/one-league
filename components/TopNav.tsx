'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { formatWeekLong } from '@/lib/format';

interface Props {
  user: { name: string; email: string };
  currentWeek: number;
  logoUri: string;
}

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Transfers', href: '/transfers' },
  { label: 'My Team',   href: '/team' },
  { label: 'Market',    href: '/market' },
  { label: 'Leagues',   href: '/leagues' },
];

function isNavActive(pathname: string, href: string) {
  // /league (a specific league's detail view) belongs to the Leagues section.
  return href === '/leagues' ? pathname.startsWith('/league') : pathname === href;
}

export default function TopNav({ user, currentWeek, logoUri }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close both menus on navigation — reset during render (not an effect) so
  // there's no extra render with a stale open menu after a route change.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMenuOpen(false);
    setMobileNavOpen(false);
  }

  const initial = user.name?.[0]?.toUpperCase() ?? '?';
  const seasonParam = searchParams.get('season');
  const seasonSuffix = seasonParam ? `?season=${seasonParam}` : '';

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/auth/sign-in');
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-6 py-3">
        <div className="flex min-w-0 items-center gap-7">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-control border border-line bg-surface">
              <Image src={logoUri} alt="" fill className="object-contain p-1" />
            </div>
            <span className="text-body font-semibold tracking-tight text-ink">One League</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map(item => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={`${item.href}${seasonSuffix}`}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'rounded-control px-3 py-1.5 text-label font-medium',
                    'transition-colors duration-150 ease-out-quart',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
                    active ? 'bg-surface-sunken text-ink' : 'text-ink-2 hover:text-ink',
                  ].join(' ')}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden font-mono tabular-nums text-label text-ink-3 md:inline">
            NFL {formatWeekLong(currentWeek)}
          </span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={[
                'flex h-8 w-8 items-center justify-center rounded-pill bg-ink text-eyebrow text-surface',
                'transition-opacity duration-150 ease-out-quart hover:opacity-85',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
              ].join(' ')}
            >
              {initial}
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div
                  role="menu"
                  className="motion-safe:animate-slot-in absolute right-0 top-[calc(100%+8px)] z-40 w-48 overflow-hidden rounded-card border border-line bg-surface shadow-lg"
                >
                  <div className="border-b border-line px-3 py-2.5">
                    <p className="truncate text-label font-medium text-ink">{user.name}</p>
                    <p className="truncate text-eyebrow text-ink-3">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="w-full px-3 py-2.5 text-left text-label text-down transition-colors duration-150 ease-out-quart hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(o => !o)}
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            className="flex h-8 w-8 items-center justify-center rounded-control border border-line text-ink-2 transition-colors duration-150 ease-out-quart hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        </div>
      </div>

      {mobileNavOpen && (
        <nav className="flex flex-col gap-3 border-t border-line px-4 py-3 md:hidden">
          <span className="font-mono tabular-nums text-label text-ink-3">
            NFL {formatWeekLong(currentWeek)}
          </span>
          {NAV.map(item => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={`${item.href}${seasonSuffix}`}
                aria-current={active ? 'page' : undefined}
                className={[
                  'rounded-control px-3 py-2 text-label font-medium',
                  active ? 'bg-surface-sunken text-ink' : 'text-ink-2',
                ].join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
