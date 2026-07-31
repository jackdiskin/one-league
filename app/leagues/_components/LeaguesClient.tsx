'use client';

import Icon from '@/components/ui/Icon';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export interface MyLeague {
  id: number;
  name: string;
  is_global: number;
  invite_code: string | null;
  max_members: number;
  role: string;
  member_count: number;
  rank: number | null;
}

type SearchLeague = { id: number; name: string; is_public: number; member_count: number };

function rankLabel(r: number | null) {
  if (!r) return null;
  if (r % 100 >= 11 && r % 100 <= 13) return `${r}th`;
  if (r % 10 === 1) return `${r}st`;
  if (r % 10 === 2) return `${r}nd`;
  if (r % 10 === 3) return `${r}rd`;
  return `${r}th`;
}

function LeagueRow({ league, onLeave, leaving }: {
  league: MyLeague;
  onLeave?: (id: number) => void;
  leaving?: boolean;
}) {
  const isGlobal = !!league.is_global;
  const rl = rankLabel(league.rank);
  const [copied, setCopied] = useState(false);

  function copyCode() {
    if (!league.invite_code) return;
    navigator.clipboard.writeText(league.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
      borderRadius: 14, border: `1px solid ${isGlobal ? '#bbf7d0' : '#e2e8f0'}`,
      background: isGlobal ? '#f0fdf4' : '#fff',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: isGlobal ? '#059669' : '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
      }}>
        <Icon name={isGlobal ? 'globe' : 'lock'} size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {league.name}
          </span>
          {isGlobal && (
            <span style={{
              fontSize: 9, fontWeight: 800, color: '#059669', background: '#d1fae5',
              borderRadius: 20, padding: '1px 7px', letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              Mandatory
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{league.member_count} member{league.member_count === 1 ? '' : 's'}</span>
          {rl && <><span>·</span><span>Rank {rl}</span></>}
          {!isGlobal && league.invite_code && (
            <>
              <span>·</span>
              <button
                onClick={copyCode}
                style={{
                  fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#475569',
                  background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '1px 6px',
                  cursor: 'pointer', fontSize: 10.5,
                }}
                title="Copy password"
              >
                {copied ? 'Copied!' : league.invite_code}
              </button>
            </>
          )}
        </div>
      </div>

      <Link
        href={`/league?leagueId=${league.id}`}
        style={{
          fontSize: 11.5, fontWeight: 700, color: '#0f172a', textDecoration: 'none',
          padding: '6px 12px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff',
          flexShrink: 0,
        }}
      >
        View →
      </Link>

      {!isGlobal && onLeave && (
        <button
          onClick={() => onLeave(league.id)}
          disabled={leaving}
          title="Leave league"
          style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            border: '1px solid #fecaca', background: '#fff', color: '#dc2626',
            cursor: leaving ? 'default' : 'pointer', opacity: leaving ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function LeaguesClient({ initialLeagues, season }: { initialLeagues: MyLeague[]; season: number }) {
  const router = useRouter();
  const [leagues, setLeagues]   = useState(initialLeagues);
  const [leavingId, setLeavingId] = useState<number | null>(null);

  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState('');
  const [newCode, setNewCode]       = useState<string | null>(null);

  const [searchName, setSearchName]   = useState('');
  const [searching, setSearching]     = useState(false);
  const [searchResults, setSearchResults] = useState<SearchLeague[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [joinSelected, setJoinSelected] = useState<SearchLeague | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [joining, setJoining]       = useState(false);
  const [joinError, setJoinError]   = useState('');

  const privateLeagues = leagues.filter(l => !l.is_global);

  // Debounced search-as-you-type by league name
  useEffect(() => {
    const q = searchName.trim();
    if (q.length < 2) { setSearchResults([]); setHasSearched(false); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/leagues/search?name=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => { setSearchResults(j.data ?? []); setHasSearched(true); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchName]);

  function selectJoinLeague(league: SearchLeague) {
    setJoinSelected(league);
    setJoinPassword('');
    setJoinError('');
  }

  const joinNeedsPassword = joinSelected != null && !joinSelected.is_public;
  const canJoin = joinSelected != null && (!joinNeedsPassword || joinPassword.trim().length > 0);

  async function handleLeave(leagueId: number) {
    setLeavingId(leagueId);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/leave`, { method: 'POST' });
      if (res.ok) {
        setLeagues(prev => prev.filter(l => l.id !== leagueId));
        router.refresh();
      }
    } finally {
      setLeavingId(null);
    }
  }

  async function handleCreate() {
    if (!createName.trim() || createPassword.trim().length < 4 || creating) return;
    setCreating(true); setCreateError(''); setNewCode(null);
    try {
      const res = await fetch('/api/leagues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim(), visibility: 'private', password: createPassword.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error ?? 'Failed to create league'); return; }
      setNewCode(json.data.invite_code);
      setCreateName('');
      setCreatePassword('');
      router.refresh();
    } catch { setCreateError('Network error — please try again.'); }
    finally { setCreating(false); }
  }

  async function handleJoin() {
    if (!joinSelected || !canJoin || joining) return;
    setJoining(true); setJoinError('');
    try {
      const res = await fetch('/api/leagues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: joinSelected.id,
          password: joinNeedsPassword ? joinPassword.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setJoinError(json.error ?? 'Failed to join league'); return; }
      setSearchName('');
      setJoinSelected(null);
      setJoinPassword('');
      router.refresh();
    } catch { setJoinError('Network error — please try again.'); }
    finally { setJoining(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Private leagues */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Private Leagues
        </div>
        {privateLeagues.length === 0 ? (
          <div style={{
            padding: '18px 16px', borderRadius: 14, border: '1px dashed #e2e8f0',
            fontSize: 12.5, color: '#94a3b8', textAlign: 'center',
          }}>
            You're not in any private leagues yet — create one or join with a password below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {privateLeagues.map(league => (
              <LeagueRow key={league.id} league={league} onLeave={handleLeave} leaving={leavingId === league.id} />
            ))}
          </div>
        )}
      </section>

      {/* Create + Join */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Create */}
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 3 }}>Create a Private League</div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 12 }}>Set a password to share with friends.</div>

          {newCode ? (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                League created — password
              </div>
              <div style={{
                fontSize: 20, fontWeight: 900, color: '#065f46', letterSpacing: '0.15em',
                fontFamily: 'ui-monospace, monospace', marginBottom: 8,
              }}>
                {newCode}
              </div>
              <button
                onClick={() => setNewCode(null)}
                style={{ fontSize: 11.5, fontWeight: 700, color: '#059669', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Create another →
              </button>
            </div>
          ) : (
            <>
              <input
                value={createName}
                onChange={e => { setCreateName(e.target.value); setCreateError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. Gridiron Glory"
                maxLength={50}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 13, fontWeight: 600,
                  color: '#0f172a', outline: 'none', marginBottom: 8,
                }}
              />
              <input
                type="password"
                autoComplete="new-password"
                value={createPassword}
                onChange={e => { setCreatePassword(e.target.value); setCreateError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Password (at least 4 characters)"
                maxLength={64}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 13, fontWeight: 600,
                  color: '#0f172a', outline: 'none', marginBottom: 10,
                }}
              />
              {createError && (
                <div style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>{createError}</div>
              )}
              <button
                onClick={handleCreate}
                disabled={!createName.trim() || createPassword.trim().length < 4 || creating}
                style={{
                  width: '100%', padding: '9px 0', borderRadius: 10, border: 'none',
                  background: createName.trim() && createPassword.trim().length >= 4 && !creating ? '#0f172a' : '#f1f5f9',
                  color: createName.trim() && createPassword.trim().length >= 4 && !creating ? '#fff' : '#94a3b8',
                  fontSize: 12.5, fontWeight: 700, cursor: createName.trim() && createPassword.trim().length >= 4 && !creating ? 'pointer' : 'not-allowed',
                }}
              >
                {creating ? 'Creating…' : 'Create League'}
              </button>
            </>
          )}
        </section>

        {/* Join */}
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 3 }}>Join a League</div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 12 }}>Search by name, then enter the password if it's private.</div>

          <input
            value={searchName}
            onChange={e => { setSearchName(e.target.value); setJoinSelected(null); setJoinError(''); }}
            placeholder="Start typing a league name…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10,
              border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 13, fontWeight: 600,
              color: '#0f172a', outline: 'none', marginBottom: 10,
            }}
          />

          {!joinSelected && searchName.trim().length >= 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto', marginBottom: 10 }}>
              {searching && (
                <div style={{ textAlign: 'center', padding: '10px 0', color: '#94a3b8', fontSize: 11.5 }}>Searching…</div>
              )}
              {!searching && hasSearched && searchResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '10px 0', color: '#94a3b8', fontSize: 11.5 }}>
                  No league found with that name.
                </div>
              )}
              {!searching && searchResults.map(league => (
                <div
                  key={league.id}
                  onClick={() => selectJoinLeague(league)}
                  style={{
                    padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                    border: '1.5px solid #e2e8f0', background: '#fafafa',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Icon name={league.is_public ? 'globe' : 'lock'} size={13} className="text-ink-3" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {league.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      {league.member_count} member{league.member_count === 1 ? '' : 's'} · {league.is_public ? 'Public' : 'Private'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {joinSelected && (
            <div style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid #10b981', background: '#f0fdf4', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: joinNeedsPassword ? 8 : 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{joinSelected.name}</div>
                <button
                  onClick={() => { setJoinSelected(null); setJoinPassword(''); setJoinError(''); }}
                  style={{ fontSize: 10.5, fontWeight: 700, color: '#059669', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Change
                </button>
              </div>
              {joinNeedsPassword && (
                <input
                  type="password"
                  autoFocus
                  value={joinPassword}
                  onChange={e => { setJoinPassword(e.target.value); setJoinError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  placeholder="Enter password"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
                    border: '1.5px solid #a7f3d0', background: '#fff', fontSize: 13, fontWeight: 600,
                    color: '#0f172a', outline: 'none',
                  }}
                />
              )}
            </div>
          )}

          {joinError && (
            <div style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>{joinError}</div>
          )}
          <button
            onClick={handleJoin}
            disabled={!canJoin || joining}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 10, border: 'none',
              background: canJoin && !joining ? '#0f172a' : '#f1f5f9',
              color: canJoin && !joining ? '#fff' : '#94a3b8',
              fontSize: 12.5, fontWeight: 700, cursor: canJoin && !joining ? 'pointer' : 'not-allowed',
            }}
          >
            {joining ? 'Joining…' : 'Join League'}
          </button>
        </section>
      </div>
    </div>
  );
}
