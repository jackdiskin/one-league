'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type SearchLeague = { id: number; name: string; is_public: number; member_count: number };

// ── Shared animation styles ────────────────────────────────────────────────────
const STYLES = `
  @keyframes modal-rise {
    from { opacity: 0; transform: translateY(18px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes code-pop {
    0%   { opacity: 0; transform: translateY(5px) scale(0.8); }
    65%  { transform: translateY(-2px) scale(1.06); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes slide-in {
    from { opacity: 0; transform: translateX(8px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .code-char { display: flex !important; animation: code-pop 0.32s cubic-bezier(0.34,1.56,0.64,1) both; }
  .league-row:hover { background: #f8fafc !important; }
`;

export default function LeagueHubModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode]             = useState<'create' | 'join'>('create');
  const router = useRouter();

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(7,10,22,0.72)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <style>{STYLES}</style>
      <div style={{
        background: '#fff', borderRadius: 24, width: '100%', maxWidth: 480,
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        animation: 'modal-rise 0.3s cubic-bezier(0.34,1.2,0.64,1) both',
      }}>
        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(155deg, #0c1220 0%, #0f172a 55%, #111827 100%)',
          padding: '26px 28px 0',
          position: 'relative', overflow: 'hidden',
        }}>
          {[18, 50, 78].map(p => (
            <div key={p} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, height: 1, background: 'rgba(255,255,255,0.035)' }} />
          ))}
          <div style={{ position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.14) 0%, transparent 70%)' }} />

          <div style={{ position: 'relative' }}>
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: -4, right: 0,
                width: 28, height: 28, borderRadius: 8, border: 'none',
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            <div style={{ fontSize: 10, fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 4 }}>
              Leagues
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', marginBottom: 20 }}>
              {mode === 'create' ? 'Start a New League' : 'Find Your League'}
            </div>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 0 }}>
              {(['create', 'join'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '9px 20px', border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700,
                    background: 'transparent',
                    color: mode === m ? '#fff' : 'rgba(255,255,255,0.38)',
                    borderBottom: `2px solid ${mode === m ? '#10b981' : 'transparent'}`,
                    transition: 'all 0.15s',
                    letterSpacing: '0.01em',
                  }}
                >
                  {m === 'create' ? '+ Create' : '→ Join'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ minHeight: 0 }}>
          {mode === 'create'
            ? <CreatePanel onClose={onClose} router={router} />
            : <JoinPanel onClose={onClose} router={router} />
          }
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PANEL
// ─────────────────────────────────────────────────────────────────────────────
function CreatePanel({ onClose, router }: { onClose: () => void; router: ReturnType<typeof useRouter> }) {
  const [name, setName]             = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [password, setPassword]     = useState('');
  const [step, setStep]             = useState<'form' | 'success'>('form');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [leagueId, setLeagueId]     = useState<number | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [copied, setCopied]         = useState(false);

  const needsPassword = visibility === 'private';
  const canSubmit = name.trim().length > 0 && (!needsPassword || password.trim().length >= 4);

  async function handleCreate() {
    if (!name.trim()) { setError('League name is required'); return; }
    if (needsPassword && password.trim().length < 4) { setError('Password must be at least 4 characters'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/leagues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), visibility, password: password.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to create league'); return; }
      setInviteCode(json.data.invite_code);
      setLeagueId(json.data.league_id);
      setStep('success');
      router.refresh();
    } catch { setError('Network error — please try again.'); }
    finally  { setLoading(false); }
  }

  function copyCode() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === 'success') {
    return (
      <div style={{ padding: '28px 28px 28px', animation: 'slide-in 0.25s ease both' }}>
        {/* Confirmation banner */}
        <div style={{
          borderRadius: 16, overflow: 'hidden', marginBottom: 20,
          border: '1px solid #d1fae5',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #052e16 0%, #064e3b 100%)',
            padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>League Created!</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>{name.trim()}</div>
            </div>
          </div>

          {visibility === 'private' && inviteCode && (
            <div style={{ padding: '16px 18px', background: '#f0fdf4' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                Password — share this with your league
              </div>
              <div
                className="code-char"
                style={{
                  marginBottom: 12, padding: '12px 14px', borderRadius: 10,
                  background: '#fff', border: '1.5px solid #6ee7b7',
                  fontSize: 18, fontWeight: 900, color: '#065f46',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  wordBreak: 'break-all',
                }}
              >
                {inviteCode}
              </div>
              <button
                onClick={copyCode}
                style={{
                  width: '100%', padding: '9px 0', borderRadius: 10,
                  border: `1.5px solid ${copied ? '#6ee7b7' : '#a7f3d0'}`,
                  background: copied ? '#d1fae5' : '#fff',
                  fontSize: 12, fontWeight: 700,
                  color: copied ? '#059669' : '#065f46',
                  cursor: 'pointer', transition: 'all 0.18s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {copied
                  ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                  : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Password</>
                }
              </button>
            </div>
          )}

          {visibility === 'public' && (
            <div style={{ padding: '12px 18px', background: '#f8fafc', fontSize: 12, color: '#64748b' }}>
              Your public league is live. Others can find and join it from the league browser.
            </div>
          )}
        </div>

        <button
          onClick={() => { onClose(); if (leagueId) router.push(`/league?leagueId=${leagueId}`); }}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 3px 12px rgba(15,23,42,0.22)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #1e293b, #334155)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #0f172a, #1e293b)')}
        >
          Go to League →
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px 28px' }}>
      {/* Name */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }}>
          League Name
        </label>
        <input
          autoFocus
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="e.g. Gridiron Glory"
          maxLength={50}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 11,
            border: '1.5px solid #e2e8f0', background: '#f8fafc',
            fontSize: 14, fontWeight: 600, color: '#0f172a', outline: 'none', transition: 'all 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = '#10b981'; e.target.style.background = '#fff'; }}
          onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
        />
      </div>

      {/* Visibility */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }}>
          Visibility
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {([
            { value: 'public'  as const, label: 'Public',  sub: 'Anyone can join',      activeColor: '#059669', activeBg: '#f0fdf4', activeBorder: '#6ee7b7',
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
            { value: 'private' as const, label: 'Private', sub: 'You set the password', activeColor: '#d97706', activeBg: '#fffbeb', activeBorder: '#fcd34d',
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
          ]).map(opt => {
            const active = visibility === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setVisibility(opt.value)}
                style={{
                  padding: '12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${active ? opt.activeBorder : '#e2e8f0'}`,
                  background: active ? opt.activeBg : '#fafafa',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ color: active ? opt.activeColor : '#94a3b8', marginBottom: 6, transition: 'color 0.15s' }}>{opt.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: active ? opt.activeColor : '#0f172a' }}>{opt.label}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{opt.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Password — only for private leagues, chosen by the creator */}
      {needsPassword && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }}>
            Password
          </label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="At least 4 characters"
            maxLength={64}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 11,
              border: '1.5px solid #e2e8f0', background: '#f8fafc',
              fontSize: 14, fontWeight: 600, color: '#0f172a', outline: 'none',
              transition: 'all 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = '#10b981'; e.target.style.background = '#fff'; }}
            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
          />
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            At least 4 characters. Share it with anyone you want to invite.
          </p>
        </div>
      )}

      {error && <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{error}</div>}

      <button
        onClick={handleCreate}
        disabled={loading || !canSubmit}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
          background: canSubmit && !loading ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#f1f5f9',
          color: canSubmit && !loading ? '#fff' : '#94a3b8',
          fontSize: 13, fontWeight: 800, cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
          boxShadow: canSubmit && !loading ? '0 3px 12px rgba(15,23,42,0.22)' : 'none',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (canSubmit && !loading) (e.currentTarget.style.background = 'linear-gradient(135deg, #1e293b, #334155)'); }}
        onMouseLeave={e => { if (canSubmit && !loading) (e.currentTarget.style.background = 'linear-gradient(135deg, #0f172a, #1e293b)'); }}
      >
        {loading ? 'Creating…' : 'Create League'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JOIN PANEL
// ─────────────────────────────────────────────────────────────────────────────
function JoinPanel({ onClose, router }: { onClose: () => void; router: ReturnType<typeof useRouter> }) {
  const [searchName, setSearchName]   = useState('');
  const [searching, setSearching]     = useState(false);
  const [results, setResults]         = useState<SearchLeague[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected]       = useState<SearchLeague | null>(null);
  const [password, setPassword]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [joinedName, setJoinedName]   = useState<string | null>(null);
  const [joinedId, setJoinedId]       = useState<number | null>(null);

  // Debounced search-as-you-type by league name
  useEffect(() => {
    const q = searchName.trim();
    if (q.length < 2) { setResults([]); setHasSearched(false); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/leagues/search?name=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => { setResults(j.data ?? []); setHasSearched(true); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchName]);

  function selectLeague(league: SearchLeague) {
    setSelected(league);
    setPassword('');
    setError('');
  }

  const needsPassword = selected != null && !selected.is_public;
  const canJoin = selected != null && (!needsPassword || password.trim().length > 0);

  async function handleJoin() {
    if (!selected || !canJoin || loading) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/leagues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: selected.id, password: needsPassword ? password.trim() : undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to join league'); return; }
      setJoinedName(json.data.league_name);
      setJoinedId(json.data.league_id);
      router.refresh();
    } catch { setError('Network error — please try again.'); }
    finally  { setLoading(false); }
  }

  if (joinedName) {
    return (
      <div style={{ padding: '28px 28px 28px', animation: 'slide-in 0.25s ease both' }}>
        <div style={{
          borderRadius: 16, overflow: 'hidden', marginBottom: 20,
          border: '1px solid #d1fae5',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #052e16, #064e3b)',
            padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>You're in!</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>{joinedName}</div>
            </div>
          </div>
          <div style={{ padding: '12px 18px', background: '#f8fafc', fontSize: 12, color: '#64748b' }}>
            Your squad has been entered into the league. Head to the league page to check the standings.
          </div>
        </div>
        <button
          onClick={() => { onClose(); if (joinedId) router.push(`/league?leagueId=${joinedId}`); }}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 3px 12px rgba(15,23,42,0.22)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #1e293b, #334155)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #0f172a, #1e293b)')}
        >
          Go to League →
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 28px 28px' }}>
      {/* League name search */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }}>
          League Name
        </label>
        <input
          autoFocus
          value={searchName}
          onChange={e => { setSearchName(e.target.value); setSelected(null); setError(''); }}
          placeholder="Start typing a league name…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 11,
            border: '1.5px solid #e2e8f0', background: '#f8fafc',
            fontSize: 14, fontWeight: 600, color: '#0f172a', outline: 'none', transition: 'all 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = '#10b981'; e.target.style.background = '#fff'; }}
          onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
        />
      </div>

      {/* Search results */}
      {!selected && searchName.trim().length >= 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
          {searching && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 12 }}>Searching…</div>
          )}
          {!searching && hasSearched && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 12 }}>
              No league found with that name.
            </div>
          )}
          {!searching && results.map(league => (
            <div
              key={league.id}
              className="league-row"
              onClick={() => selectLeague(league)}
              style={{
                padding: '10px 13px', borderRadius: 11, cursor: 'pointer',
                border: '1.5px solid #e2e8f0', background: '#fff',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>
                {league.is_public ? '🌐' : '🔒'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {league.name}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginTop: 4 }}>
                  {league.member_count} member{league.member_count === 1 ? '' : 's'} · {league.is_public ? 'Public' : 'Private'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected league — prompts for a password only if it's private */}
      {selected && (
        <div style={{ padding: '12px 14px', borderRadius: 12, border: '1.5px solid #10b981', background: '#f0fdf4', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: needsPassword ? 10 : 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.name}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#059669', marginTop: 2 }}>
                {selected.member_count} member{selected.member_count === 1 ? '' : 's'} · {selected.is_public ? 'Public' : 'Private'}
              </div>
            </div>
            <button
              onClick={() => { setSelected(null); setPassword(''); setError(''); }}
              style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
            >
              Change
            </button>
          </div>
          {needsPassword && (
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="Enter password"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid #a7f3d0', background: '#fff',
                fontSize: 14, fontWeight: 600, color: '#0f172a', outline: 'none',
              }}
            />
          )}
        </div>
      )}

      {error && <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>{error}</div>}

      <button
        onClick={handleJoin}
        disabled={!canJoin || loading}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
          background: canJoin && !loading ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#f1f5f9',
          color: canJoin && !loading ? '#fff' : '#94a3b8',
          fontSize: 13, fontWeight: 800, cursor: canJoin && !loading ? 'pointer' : 'not-allowed',
          boxShadow: canJoin && !loading ? '0 3px 12px rgba(15,23,42,0.22)' : 'none',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (canJoin && !loading) (e.currentTarget.style.background = 'linear-gradient(135deg, #1e293b, #334155)'); }}
        onMouseLeave={e => { if (canJoin && !loading) (e.currentTarget.style.background = 'linear-gradient(135deg, #0f172a, #1e293b)'); }}
      >
        {loading ? 'Joining…' : 'Join League'}
      </button>
    </div>
  );
}
