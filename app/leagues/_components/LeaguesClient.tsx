'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import EmptyState from '@/components/ui/EmptyState';
import SectionHeader from '@/components/ui/SectionHeader';

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

/** A password must be at least this long — mirrored in app/api/leagues/create. */
const MIN_PASSWORD = 4;

function rankLabel(r: number | null) {
  if (!r) return null;
  if (r % 100 >= 11 && r % 100 <= 13) return `${r}th`;
  if (r % 10 === 1) return `${r}st`;
  if (r % 10 === 2) return `${r}nd`;
  if (r % 10 === 3) return `${r}rd`;
  return `${r}th`;
}

const INPUT = [
  'h-9 w-full rounded-control border border-line bg-surface px-3',
  'text-label text-ink placeholder:text-ink-3',
  'transition-colors duration-150 ease-out-quart hover:border-line-strong',
  'focus-visible:outline-none focus-visible:border-emerald focus-visible:ring-2 focus-visible:ring-emerald',
].join(' ');

/**
 * Labelled text field.
 *
 * Both forms used bare placeholder-only inputs, which leaves nothing for a
 * screen reader once the field has a value — hence a real visible label tied
 * with htmlFor rather than an aria-label.
 */
function Field({
  label, hint, inputRef, ...input
}: {
  label: string;
  hint?: string;
  inputRef?: React.Ref<HTMLInputElement>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-eyebrow uppercase text-ink-3">{label}</label>
      <input id={id} ref={inputRef} className={INPUT} {...input} />
      {hint && <p className="text-eyebrow text-ink-3">{hint}</p>}
    </div>
  );
}

/**
 * Form submit. When it can't be pressed the label says what's missing, rather
 * than leaving a greyed-out button with no explanation of what to do next.
 */
function SubmitButton({
  onClick, disabled, blockedLabel, busy, busyLabel, children,
}: {
  onClick: () => void;
  disabled: boolean;
  /** Shown in place of the label while the form is incomplete. */
  blockedLabel: string;
  busy: boolean;
  busyLabel: string;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={[
        'h-9 w-full rounded-control text-label transition-colors duration-150 ease-out-quart',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
        disabled || busy
          ? 'cursor-not-allowed bg-surface-sunken text-ink-3'
          : 'bg-emerald text-surface hover:bg-emerald-hover active:bg-emerald-press',
      ].join(' ')}
    >
      {busy ? busyLabel : disabled ? blockedLabel : children}
    </button>
  );
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
    <div className={[
      'flex items-center gap-3.5 rounded-card border p-4',
      isGlobal ? 'border-emerald-line bg-emerald-tint' : 'border-line bg-surface',
    ].join(' ')}>
      <div className={[
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-slot',
        isGlobal ? 'bg-emerald text-surface' : 'bg-surface-sunken text-ink-3',
      ].join(' ')}>
        <Icon name={isGlobal ? 'globe' : 'lock'} size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-label text-ink">{league.name}</span>
          {isGlobal && (
            <span className="shrink-0 rounded-pill bg-emerald px-1.5 py-0.5 text-eyebrow uppercase text-surface">
              Mandatory
            </span>
          )}
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-eyebrow text-ink-3">
          <span className="font-mono tabular-nums">
            {league.member_count} member{league.member_count === 1 ? '' : 's'}
          </span>
          {rl && <><span>·</span><span className="font-mono tabular-nums">Rank {rl}</span></>}
          {!isGlobal && league.invite_code && (
            <>
              <span>·</span>
              <button
                type="button"
                onClick={copyCode}
                title="Copy password"
                className="rounded-control bg-surface-sunken px-1.5 py-0.5 font-mono text-eyebrow text-ink-2 transition-colors duration-150 hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
              >
                {copied ? 'Copied' : league.invite_code}
              </button>
            </>
          )}
        </div>
      </div>

      <Link
        href={`/league?leagueId=${league.id}`}
        className="shrink-0 rounded-control border border-line bg-surface px-3 py-1.5 text-label text-ink transition-colors duration-150 ease-out-quart hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
      >
        View
      </Link>

      {!isGlobal && onLeave && (
        <button
          type="button"
          onClick={() => onLeave(league.id)}
          disabled={leaving}
          aria-label={`Leave ${league.name}`}
          title="Leave league"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line text-ink-3 transition-colors duration-150 ease-out-quart hover:border-down hover:text-down disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function LeaguesClient({ initialLeagues }: { initialLeagues: MyLeague[] }) {
  const router = useRouter();
  const [leagues, setLeagues]     = useState(initialLeagues);
  const [leavingId, setLeavingId] = useState<number | null>(null);

  const createNameRef = useRef<HTMLInputElement>(null);

  const [createName, setCreateName]         = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating]             = useState(false);
  const [createError, setCreateError]       = useState('');
  const [newCode, setNewCode]               = useState<string | null>(null);

  const [searchName, setSearchName]         = useState('');
  const [searching, setSearching]           = useState(false);
  const [searchResults, setSearchResults]   = useState<SearchLeague[]>([]);
  const [hasSearched, setHasSearched]       = useState(false);
  const [joinSelected, setJoinSelected]     = useState<SearchLeague | null>(null);
  const [joinPassword, setJoinPassword]     = useState('');
  const [joining, setJoining]               = useState(false);
  const [joinError, setJoinError]           = useState('');

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
  const canJoin   = joinSelected != null && (!joinNeedsPassword || joinPassword.trim().length > 0);
  const canCreate = createName.trim().length > 0 && createPassword.trim().length >= MIN_PASSWORD;

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
    if (!canCreate || creating) return;
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
    <div className="flex flex-col gap-6">

      {/* Private leagues */}
      <section className="flex flex-col gap-2">
        <p className="text-eyebrow uppercase text-ink-3">Private leagues</p>
        {privateLeagues.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              compact
              icon={<Icon name="lock" size={18} />}
              title="Start a private league and share the password with friends."
              action={
                <button
                  type="button"
                  onClick={() => createNameRef.current?.focus()}
                  className="rounded-control bg-emerald px-3 py-1.5 text-label text-surface transition-colors duration-150 ease-out-quart hover:bg-emerald-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
                >
                  Create one
                </button>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {privateLeagues.map(league => (
              <LeagueRow key={league.id} league={league} onLeave={handleLeave} leaving={leavingId === league.id} />
            ))}
          </div>
        )}
      </section>

      {/* Create + Join */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

        <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
          <SectionHeader title="Create a private league" sub="Set a password to share with friends." />

          {newCode ? (
            <div className="rounded-card border border-emerald-line bg-emerald-tint p-4">
              <p className="text-eyebrow uppercase text-emerald">League created — password</p>
              <p className="mt-1.5 font-mono text-section tracking-[0.15em] text-emerald-press">{newCode}</p>
              <button
                type="button"
                onClick={() => setNewCode(null)}
                className="mt-2 rounded-control text-label text-emerald underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
              >
                Create another
              </button>
            </div>
          ) : (
            <>
              <Field
                label="League name"
                inputRef={createNameRef}
                value={createName}
                onChange={e => { setCreateName(e.target.value); setCreateError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. Gridiron Glory"
                maxLength={50}
              />
              <Field
                label="Password"
                type="password"
                autoComplete="new-password"
                value={createPassword}
                onChange={e => { setCreatePassword(e.target.value); setCreateError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                maxLength={64}
              />
              {createError && <p role="alert" className="text-label text-down">{createError}</p>}
              <SubmitButton
                onClick={handleCreate}
                disabled={!canCreate}
                blockedLabel={`Add a name and a ${MIN_PASSWORD}-character password`}
                busy={creating}
                busyLabel="Creating…"
              >
                Create league
              </SubmitButton>
            </>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
          <SectionHeader title="Join a league" sub="Search by name, then enter the password if it's private." />

          <Field
            label="League name"
            value={searchName}
            onChange={e => { setSearchName(e.target.value); setJoinSelected(null); setJoinError(''); }}
            placeholder="Start typing a league name"
          />

          {!joinSelected && searchName.trim().length >= 2 && (
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
              {searching && (
                <p className="py-2 text-center text-label text-ink-3">Searching…</p>
              )}
              {!searching && hasSearched && searchResults.length === 0 && (
                <p className="py-2 text-center text-label text-ink-3">No league found with that name.</p>
              )}
              {!searching && searchResults.map(league => (
                <button
                  key={league.id}
                  type="button"
                  onClick={() => selectJoinLeague(league)}
                  className="flex items-center gap-2 rounded-slot border border-line bg-surface-sunken px-2.5 py-2 text-left transition-colors duration-150 ease-out-quart hover:border-emerald-line hover:bg-emerald-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
                >
                  <Icon name={league.is_public ? 'globe' : 'lock'} size={13} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label text-ink">{league.name}</span>
                    <span className="block text-eyebrow text-ink-3">
                      <span className="font-mono tabular-nums">{league.member_count}</span>{' '}
                      member{league.member_count === 1 ? '' : 's'} · {league.is_public ? 'Public' : 'Private'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {joinSelected && (
            <div className="flex flex-col gap-2.5 rounded-card border border-emerald-line bg-emerald-tint p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-label text-ink">{joinSelected.name}</span>
                <button
                  type="button"
                  onClick={() => { setJoinSelected(null); setJoinPassword(''); setJoinError(''); }}
                  className="shrink-0 rounded-control text-label text-emerald underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
                >
                  Change
                </button>
              </div>
              {joinNeedsPassword && (
                <Field
                  label="Password"
                  type="password"
                  autoComplete="off"
                  autoFocus
                  value={joinPassword}
                  onChange={e => { setJoinPassword(e.target.value); setJoinError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  placeholder="Enter password"
                />
              )}
            </div>
          )}

          {joinError && <p role="alert" className="text-label text-down">{joinError}</p>}

          <SubmitButton
            onClick={handleJoin}
            disabled={!canJoin}
            blockedLabel={joinSelected ? 'Enter the password' : 'Pick a league first'}
            busy={joining}
            busyLabel="Joining…"
          >
            Join league
          </SubmitButton>
        </section>
      </div>
    </div>
  );
}
