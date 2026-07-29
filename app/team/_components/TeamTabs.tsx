'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export type TeamTab = 'roster' | 'transfers';

const TABS: { key: TeamTab; label: string }[] = [
  { key: 'roster',    label: 'My Roster' },
  { key: 'transfers', label: 'Transfers' },
];

export default function TeamTabs({ active }: { active: TeamTab }) {
  const router       = useRouter();
  const pathname      = usePathname();
  const searchParams = useSearchParams();

  function urlForTab(tab: TeamTab): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div style={{
      display: 'flex', gap: 2,
      background: '#f1f5f9', borderRadius: 10, padding: 3,
      width: 'fit-content',
    }}>
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => router.push(urlForTab(tab.key))}
          style={{
            fontSize: 12, fontWeight: 700,
            padding: '6px 16px', borderRadius: 8,
            border: 'none', cursor: 'pointer',
            background: active === tab.key ? '#fff' : 'transparent',
            color: active === tab.key ? '#0f172a' : '#94a3b8',
            boxShadow: active === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
