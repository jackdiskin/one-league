'use client';

import Image from 'next/image';
import { useState } from 'react';
import { formatPrice, formatWeekLong } from '@/lib/format';
import { BID_ASK_SPREAD, PRICE_IMPACT_RATE } from '@/lib/pricing';

export interface SellablePlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
  purchase_price: number;
  acquired_week: number;
}

const POS_COLORS: Record<string, { bar: string }> = {
  QB: { bar: '#3b82f6' },
  RB: { bar: '#10b981' },
  WR: { bar: '#f59e0b' },
  TE: { bar: '#a855f7' },
  K:  { bar: '#94a3b8' },
};

export default function SellModal({
  player,
  teamId,
  week,
  budgetRemaining,
  onClose,
  onSuccess,
}: {
  player: SellablePlayer;
  teamId: number;
  week: number;
  budgetRemaining: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const currentPrice  = Number(player.current_price);
  const purchasePrice = Number(player.purchase_price);
  const proceeds      = Math.round(currentPrice * (1 - BID_ASK_SPREAD) * 100) / 100;
  const pnl           = proceeds - purchasePrice;
  const pnlPct        = purchasePrice > 0 ? (pnl / purchasePrice) * 100 : 0;
  const priceAfter    = Math.round(currentPrice * (1 - PRICE_IMPACT_RATE) * 100) / 100;
  const budgetAfter   = Number(budgetRemaining) + proceeds;
  const isGain        = pnl >= 0;
  const col           = POS_COLORS[player.position] ?? POS_COLORS.K;

  async function confirmSell() {
    setConfirming(true);
    setError('');
    try {
      const res = await fetch('/api/market/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fantasy_team_id: teamId, player_id: player.id, week }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Sale failed'); return; }
      onSuccess();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(7,10,22,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden',
        animation: 'sell-modal-in 0.25s cubic-bezier(0.34,1.4,0.64,1) both',
      }}>
        <style>{`
          @keyframes sell-modal-in {
            from { transform: translateY(12px) scale(0.98); opacity: 0; }
            to   { transform: translateY(0) scale(1); opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {player.headshot_url ? (
              <Image
                src={player.headshot_url} alt={player.full_name}
                width={44} height={44} unoptimized
                style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)', display: 'block' }}
              />
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: '50%', background: '#334155',
                border: '2px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800, color: '#fff',
              }}>{player.full_name[0]}</div>
            )}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 16, height: 16, borderRadius: '50%',
              background: col.bar, border: '2px solid #0f172a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 6, fontWeight: 900, color: '#fff',
            }}>{player.position[0]}</div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
              Sell Order
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player.full_name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: col.bar, color: '#fff', borderRadius: 20, padding: '1px 6px', fontSize: 9, fontWeight: 800 }}>{player.position}</span>
              <span>{player.team_code}</span>
              <span>· {formatWeekLong(week)}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '18px 20px 20px' }}>

          {/* Transaction summary */}
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Transaction Summary
          </div>
          <div style={{
            background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
            overflow: 'hidden', marginBottom: 12,
          }}>
            {[
              {
                label: 'Acquired at',
                value: formatPrice(purchasePrice),
                sub: formatWeekLong(player.acquired_week),
                valueColor: '#475569',
              },
              {
                label: 'Current market price',
                value: formatPrice(currentPrice),
                sub: null,
                valueColor: '#0f172a',
              },
              {
                label: `Sell proceeds`,
                value: formatPrice(proceeds),
                sub: `after ${(BID_ASK_SPREAD * 100).toFixed(0)}% spread`,
                valueColor: '#0f172a',
              },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px',
                borderBottom: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{row.label}</div>
                  {row.sub && <div style={{ fontSize: 10, color: '#94a3b8' }}>{row.sub}</div>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: row.valueColor }}>{row.value}</div>
              </div>
            ))}

            {/* P&L row — highlighted */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: isGain ? 'rgba(16,185,129,0.07)' : 'rgba(244,63,94,0.07)',
              borderTop: `1.5px solid ${isGain ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isGain ? '#059669' : '#e11d48' }}>
                Profit / Loss
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: isGain ? '#059669' : '#e11d48' }}>
                  {isGain ? '+' : ''}{formatPrice(pnl)}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: isGain ? '#10b981' : '#f43f5e' }}>
                  {isGain ? '▲' : '▼'} {Math.abs(pnlPct).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Market impact */}
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Market Impact
          </div>
          <div style={{
            background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
            overflow: 'hidden', marginBottom: 16,
          }}>
            {[
              {
                label: "Player's price after sale",
                value: formatPrice(priceAfter),
                sub: `−${(PRICE_IMPACT_RATE * 100).toFixed(1)}% market impact`,
                valueColor: '#e11d48',
              },
              {
                label: 'Your budget after sale',
                value: formatPrice(budgetAfter),
                sub: `+${formatPrice(proceeds)} returned`,
                valueColor: '#059669',
              },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px',
                borderBottom: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{row.label}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{row.sub}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: row.valueColor }}>{row.value}</div>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={confirming}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                border: '1.5px solid #e2e8f0', background: '#fff',
                fontSize: 13, fontWeight: 700, color: '#64748b',
                cursor: confirming ? 'default' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmSell}
              disabled={confirming}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 12, border: 'none',
                background: confirming ? '#fecaca' : 'linear-gradient(135deg, #e11d48, #f43f5e)',
                fontSize: 13, fontWeight: 800, color: '#fff',
                cursor: confirming ? 'default' : 'pointer',
                boxShadow: confirming ? 'none' : '0 4px 14px rgba(244,63,94,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {confirming ? 'Processing...' : `Confirm Sale · ${formatPrice(proceeds)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
