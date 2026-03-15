'use client';

import { formatWeek } from '@/lib/format';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import LeagueHubModal from './CreateLeagueModal';

export interface SidebarLeague {
  id: number;
  name: string;
  season_year: number;
  team_name: string | null;
  rank: number | null;
  member_count: number;
}

interface Props {
  user: { name: string; email: string };
  leagues: SidebarLeague[];
  currentWeek: number;
  season: number;
  logoUri: string;
}

const NAV = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: 'Market',
    href: '/market',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    label: 'Players',
    href: '/players',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'My Team',
    href: '/team',  // My Team page
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
];

function rankLabel(r: number | null) {
  if (!r) return null;
  return r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`;
}

export default function Sidebar({ user, leagues, currentWeek, season, logoUri }: Props) {
  const [leaguesOpen, setLeaguesOpen]   = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initials = user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const selectedLeagueId = Number(searchParams.get('leagueId')) || leagues[0]?.id || null;
  const seasonParam = searchParams.get('season');
  const seasonSuffix = seasonParam ? `?season=${seasonParam}` : '';

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/auth/sign-in');
  }

  return (
    <aside style={{
      width: 248,
      flexShrink: 0,
      height: '100vh',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#ffffff',
      borderRight: '1px solid #e2e8f0',
      overflowY: 'auto',
      zIndex: 30,
    }}>

      {/* ── Brand ── */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid #f1f5f9' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
            border: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', position: 'relative', flexShrink: 0,
          }}>
            <Image src={logoUri} alt="One League" fill style={{ objectFit: 'contain', padding: 4 }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>
              One League
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>
              {season} · {formatWeek(currentWeek)}
            </div>
          </div>
        </Link>
      </div>

      {/* ── Nav ── */}
      <div style={{ padding: '10px 10px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 8px 4px' }}>
          Navigate
        </div>
        {NAV.map(item => {
          const isActive = pathname === item.href;
          return (
          <Link key={item.href} href={`${item.href}${seasonSuffix}`} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 10,
              color: isActive ? '#0f172a' : '#475569', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
              background: isActive ? '#f8fafc' : 'transparent',
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                (e.currentTarget as HTMLElement).style.color = '#0f172a';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = isActive ? '#f8fafc' : 'transparent';
                (e.currentTarget as HTMLElement).style.color = isActive ? '#0f172a' : '#475569';
              }}
            >
              <span style={{ color: isActive ? '#059669' : '#94a3b8', flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </div>
          </Link>
        )})}
      </div>

      {/* ── Divider ── */}
      <div style={{ margin: '10px 16px', height: 1, background: '#f1f5f9' }} />

      {/* ── My Leagues ── */}
      <div style={{ padding: '0 10px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 6px' }}>
          <button
            onClick={() => setLeaguesOpen(o => !o)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              My Leagues
            </span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
              style={{ transform: leaguesOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            title="Create a league"
            style={{
              width: 22, height: 22, borderRadius: 6, border: '1px solid #e2e8f0',
              background: '#f8fafc', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748b', transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = '#0f172a';
              (e.currentTarget as HTMLElement).style.color = '#fff';
              (e.currentTarget as HTMLElement).style.borderColor = '#0f172a';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = '#f8fafc';
              (e.currentTarget as HTMLElement).style.color = '#64748b';
              (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        {leaguesOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
            {leagues.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 12, color: '#94a3b8' }}>
                No leagues yet
              </div>
            )}
            {leagues.map(league => {
              const isActive = pathname === '/league' && league.id === selectedLeagueId;
              const rl = rankLabel(league.rank);
              return (
                <Link
                  key={league.id}
                  href={`/league?leagueId=${league.id}`}
                  style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0, textDecoration: 'none', display: 'block',
                  }}
                >
                  <div style={{
                    padding: '9px 10px',
                    borderRadius: 12,
                    background: isActive ? '#f0fdf4' : 'transparent',
                    border: isActive ? '1px solid #bbf7d0' : '1px solid transparent',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                    onMouseEnter={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <div style={{
                        position: 'absolute', left: 0, top: '20%', bottom: '20%',
                        width: 3, borderRadius: 2, background: '#10b981',
                      }} />
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700,
                          color: isActive ? '#065f46' : '#1e293b',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          lineHeight: 1.2,
                        }}>
                          {league.name}
                        </div>
                        {league.team_name && (
                          <div style={{
                            fontSize: 10, color: isActive ? '#059669' : '#64748b',
                            marginTop: 2, fontWeight: 500,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {league.team_name}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                        {rl && (
                          <div style={{
                            fontSize: 9, fontWeight: 800,
                            color: isActive ? '#059669' : '#94a3b8',
                            background: isActive ? '#d1fae5' : '#f1f5f9',
                            borderRadius: 6, padding: '1px 5px',
                            letterSpacing: '0.02em',
                          }}>
                            {rl}
                          </div>
                        )}
                        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>
                          {league.member_count} members
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && <LeagueHubModal onClose={() => setShowCreateModal(false)} />}

      {/* ── User footer ── */}
      <div style={{ margin: '10px 10px 10px', position: 'relative' }}>
        {showUserMenu && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              onClick={() => setShowUserMenu(false)}
            />
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 50, overflow: 'hidden',
            }}>
              <button
                onClick={handleSignOut}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#ef4444',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </div>
          </>
        )}
        <div
          onClick={() => setShowUserMenu(o => !o)}
          style={{
            padding: '10px 12px',
            borderRadius: 14,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
            letterSpacing: '0.02em',
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </div>
      </div>
    </aside>
  );
}
