'use client';

import Link from 'next/link';

export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 12, fontWeight: 600, color: '#64748b', textDecoration: 'none',
      transition: 'color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#0f172a'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#64748b'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </Link>
  );
}
