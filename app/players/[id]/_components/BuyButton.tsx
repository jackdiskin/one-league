'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/format';

interface Props {
  playerId: number;
  fantasyTeamId: number;
  currentWeek: number;
  price: number;
  canAfford: boolean;
  alreadyOwned: boolean;
  blockReason?: string | null;
}

export default function BuyButton({ playerId, fantasyTeamId, currentWeek, price, canAfford, alreadyOwned, blockReason }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  if (alreadyOwned) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 12, padding: '10px 18px',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>On Your Roster</span>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 12, padding: '10px 18px',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>✓ Added to roster!</span>
      </div>
    );
  }

  async function handleBuy() {
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/market/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fantasy_team_id: fantasyTeamId, player_id: playerId, week: currentWeek }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error ?? 'Something went wrong');
        setStatus('error');
      } else {
        setStatus('success');
        router.refresh();
      }
    } catch {
      setErrorMsg('Network error');
      setStatus('error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <button
        onClick={handleBuy}
        disabled={!canAfford || !!blockReason || status === 'loading'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: canAfford && !blockReason ? '#0f172a' : '#f1f5f9',
          color: canAfford && !blockReason ? '#fff' : '#94a3b8',
          border: 'none', borderRadius: 12,
          padding: '10px 20px', fontSize: 13, fontWeight: 700,
          cursor: canAfford && !blockReason ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s',
          opacity: status === 'loading' ? 0.7 : 1,
        }}
        onMouseEnter={e => { if (canAfford && !blockReason) (e.currentTarget as HTMLElement).style.background = '#1e293b'; }}
        onMouseLeave={e => { if (canAfford && !blockReason) (e.currentTarget as HTMLElement).style.background = '#0f172a'; }}
      >
        {status === 'loading' ? (
          <span>Buying…</span>
        ) : blockReason ? (
          <span>{blockReason}</span>
        ) : canAfford ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Buy · {formatPrice(price)}
          </>
        ) : (
          <span>Insufficient budget</span>
        )}
      </button>
      {status === 'error' && (
        <span style={{ fontSize: 11, color: '#f43f5e', fontWeight: 600 }}>{errorMsg}</span>
      )}
    </div>
  );
}
