'use client';

// Name-your-team confirmation modal.
//
// No league picker — every team is auto-enrolled in the season's Global
// Leaderboard on submit. Private leagues are joined separately afterward,
// from the Leagues tab.

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LeagueModal({
  teamName,
  playerIds,
  season,
  onClose,
}: {
  teamName: string;
  playerIds: number[];
  season: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState(teamName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = name.trim().length >= 2;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: name.trim(),
          player_ids: playerIds,
          season_year: season,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Something went wrong'); return; }
      router.push(`/dashboard?season=${season}`);
    } catch {
      setError('That didn’t reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Name your team"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
    >
      <div className="motion-safe:animate-modal-in w-full max-w-md overflow-hidden rounded-card border border-line bg-surface shadow-xl">
        <div className="px-8 pb-6 pt-8">
          <p className="text-eyebrow uppercase text-emerald">Last step</p>
          <h2 className="mt-1 text-display text-ink">Name your team</h2>
          <p className="mt-1 text-body text-ink-2">
            You&rsquo;ll join the global leaderboard automatically. Private leagues are open to you
            any time from the Leagues tab.
          </p>
        </div>

        <div className="border-t border-line px-8 pb-8 pt-6">
          <label htmlFor={nameId} className="block text-label text-ink-2">
            Team name
          </label>
          <input
            id={nameId}
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="The Dream Team"
            maxLength={40}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="mt-1.5 h-10 w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 transition-colors duration-150 ease-out-quart hover:border-line-strong focus-visible:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
          />

          {error && (
            <p id={errorId} className="mt-2 rounded-control border border-down/30 bg-down/5 px-3 py-2 text-label text-down">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 flex-1 rounded-control border border-line px-4 text-body text-ink-2 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={[
                'h-10 flex-2 rounded-control px-4 text-body font-medium',
                'transition-colors duration-150 ease-out-quart',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
                canSubmit && !submitting
                  ? 'cursor-pointer bg-emerald-press text-surface hover:bg-emerald-hover active:bg-emerald-press'
                  : 'cursor-not-allowed bg-surface-sunken text-ink-3',
              ].join(' ')}
            >
              {submitting ? 'Creating your squad' : 'Create my team'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
