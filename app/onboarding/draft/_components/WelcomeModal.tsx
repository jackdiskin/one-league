'use client';

// Onboarding "how it works" modal.
//
// One accent (emerald) throughout rather than a different colour per step,
// and no gradient banner or glow — the field is the page's bold element, not
// this. Icons are a single consistent-stroke set in place of mixed emoji.

import { useState } from 'react';
import { QUOTA, TOTAL_SLOTS, STARTERS } from './types';

type IconName = 'football' | 'roster' | 'chart' | 'trophy';

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const p = {
    width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className,
  };
  switch (name) {
    case 'football':
      return <svg {...p}><ellipse cx="12" cy="12" rx="9" ry="6" /><path d="M5.5 8.5 18.5 15.5M9 12h.01M12 10.6h.01M12 13.4h.01M15 12h.01" /></svg>;
    case 'roster':
      return <svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3v3M15 3v3M8 11h8M8 15h5" /></svg>;
    case 'chart':
      return <svg {...p}><path d="M4 19h16M7 16V9M12 16V5M17 16v-4" /></svg>;
    case 'trophy':
      return <svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" /><path d="M12 13v3M9 20h6M9.5 20a2.5 2.5 0 0 1 5 0" /></svg>;
  }
}

const STEPS = [
  {
    icon: 'football' as IconName,
    eyebrow: 'Welcome to OneLeague',
    title: 'Draft 2026',
    subtitle: 'Fantasy football with a live player market.',
    body: 'Draft a squad, set your lineup each week, and buy and sell players as their prices move. Everyone plays the same format on one global leaderboard.',
    bullets: null,
    callout: null,
  },
  {
    icon: 'roster' as IconName,
    eyebrow: 'Step 1',
    title: 'Draft your squad',
    subtitle: `${TOTAL_SLOTS} players, $100.0M cap, one shot.`,
    body: null,
    bullets: [
      { label: `${QUOTA.QB} quarterbacks`, sub: 'Your franchise signal-callers' },
      { label: `${QUOTA.RB} running backs`, sub: 'Ground game and receiving threats' },
      { label: `${QUOTA.FLEX} wide receivers or tight ends`, sub: 'Any mix — they share one pool' },
    ],
    callout: null,
  },
  {
    icon: 'chart' as IconName,
    eyebrow: 'Step 2',
    title: 'Trade the market',
    subtitle: 'Prices move in real time.',
    body: 'Every buy pushes a price up and every sell pushes it down. Prices also reset weekly on performance against projections. Your cap starts at $100.0M and moves with your profit and loss.',
    bullets: null,
    callout: {
      label: 'For example',
      text: 'Buy at $5.0M, sell at $8.0M, and your cap grows by $3.0M. Sell for less than you paid and it shrinks.',
    },
  },
  {
    icon: 'trophy' as IconName,
    eyebrow: 'Step 3',
    title: 'Compete and win',
    subtitle: 'Weekly lineups, season-long standings.',
    body: null,
    bullets: [
      { label: 'Set your lineup weekly', sub: `Start ${STARTERS} each week — the other ${TOTAL_SLOTS - STARTERS} sit on your bench and score nothing` },
      { label: 'One global leaderboard', sub: 'Every manager is ranked together, automatically' },
      { label: 'Private leagues', sub: 'Create one or join with a code to play friends' },
    ],
    callout: null,
  },
] as const;

export default function WelcomeModal({ userName, onClose }: { userName: string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How OneLeague works"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
    >
      <div className="motion-safe:animate-modal-in w-full max-w-md overflow-hidden rounded-card border border-line bg-surface shadow-xl">
        <div className="px-8 pb-6 pt-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-card bg-emerald-tint text-emerald">
            <Icon name={s.icon} />
          </span>

          <p className="mt-5 text-eyebrow uppercase text-emerald">{s.eyebrow}</p>
          <h2 className="mt-1 text-display text-ink">{s.title}</h2>
          <p className="mt-1 text-body text-ink-2">{s.subtitle}</p>

          {/* Step progress */}
          <div className="mt-5 flex gap-1.5" role="img" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={[
                  'h-1 rounded-pill transition-all duration-300 ease-out-quart',
                  i === step ? 'w-6 bg-emerald' : 'w-2 bg-line',
                ].join(' ')}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-line px-8 pb-8 pt-6">
          {s.body && <p className="text-body text-ink-2">{s.body}</p>}

          {s.bullets && (
            <ul className="flex flex-col gap-2">
              {s.bullets.map(b => (
                <li key={b.label} className="rounded-control border border-line bg-surface-sunken px-3 py-2">
                  <p className="text-label text-ink">{b.label}</p>
                  <p className="mt-0.5 text-label text-ink-3">{b.sub}</p>
                </li>
              ))}
            </ul>
          )}

          {s.callout && (
            <div className="mt-3 rounded-control border border-emerald-line bg-emerald-tint px-3 py-2">
              <p className="text-eyebrow uppercase text-emerald">{s.callout.label}</p>
              <p className="mt-1 text-label text-ink-2">{s.callout.text}</p>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(n => n - 1)}
                className="h-10 rounded-control border border-line px-4 text-body text-ink-2 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onClose() : setStep(n => n + 1))}
              className="h-10 flex-1 rounded-control bg-emerald-press px-4 text-body font-medium text-surface transition-colors duration-150 ease-out-quart hover:bg-emerald-hover active:bg-emerald-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
            >
              {isLast ? `Start drafting, ${userName.split(' ')[0]}` : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
