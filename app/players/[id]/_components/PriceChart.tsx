'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/format';

export interface PriceWeek {
  week: number;
  opening_price: number;
  closing_price: number;
  base_price: number;
}

const W = 600, H = 200;
const PAD = { top: 16, right: 20, bottom: 32, left: 68 };

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${cpx} ${pts[i - 1].y} ${cpx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

export default function PriceChart({ data }: { data: PriceWeek[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Not enough price history yet</span>
      </div>
    );
  }

  const prices = data.map(d => Number(d.closing_price));
  const minP   = Math.min(...prices);
  const maxP   = Math.max(...prices);
  const range  = maxP - minP || 1;
  const padded = range * 0.12;

  const xScale = (i: number) =>
    PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right);
  const yScale = (p: number) =>
    PAD.top + (1 - (p - (minP - padded)) / (range + padded * 2)) * (H - PAD.top - PAD.bottom);

  const pts      = data.map((d, i) => ({ x: xScale(i), y: yScale(Number(d.closing_price)) }));
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${H - PAD.bottom} L ${pts[0].x} ${H - PAD.bottom} Z`;

  const isUp      = prices[prices.length - 1] >= prices[0];
  const lineColor = isUp ? '#10b981' : '#f43f5e';
  const gradId    = `grad-${isUp ? 'up' : 'dn'}`;

  const lastPt = pts[pts.length - 1];

  const yTicks      = 4;
  const yTickValues = Array.from({ length: yTicks }, (_, i) =>
    (minP - padded) + ((range + padded * 2) / (yTicks - 1)) * i
  );

  const segW       = (W - PAD.left - PAD.right) / Math.max(data.length - 1, 1);
  const hoveredPt  = hovered !== null ? pts[hovered] : null;
  const hoveredData = hovered !== null ? data[hovered] : null;
  const prevData   = hovered !== null && hovered > 0 ? data[hovered - 1] : null;
  const priceDiff  = hoveredData && prevData
    ? Number(hoveredData.closing_price) - Number(prevData.closing_price)
    : null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Pulse keyframes */}
      <style>{`
        @keyframes live-ring {
          0%   { r: 5;  opacity: 0.7; }
          100% { r: 13; opacity: 0; }
        }
        @keyframes live-chip-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .live-ring { animation: live-ring 1.8s ease-out infinite; }
        .live-chip-dot { animation: live-chip-pulse 1.8s ease-in-out infinite; }
      `}</style>

      {/* LIVE chip */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        display: 'flex', alignItems: 'center', gap: 5,
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 20, padding: '3px 9px',
        zIndex: 5,
      }}>
        <span className="live-chip-dot" style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#10b981', display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Live
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* Y axis grid lines */}
        {yTickValues.map((val, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={yScale(val)}
              x2={W - PAD.right} y2={yScale(val)}
              stroke="#f1f5f9" strokeWidth={1}
            />
            <text
              x={PAD.left - 6} y={yScale(val)}
              textAnchor="end" dominantBaseline="middle"
              fontSize={7} fill="#cbd5e1" fontWeight={600}
            >
              {formatPrice(val)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Line — thinner */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" />

        {/* X axis labels + hover zones */}
        {data.map((d, i) => (
          <g key={i}>
            <text
              x={xScale(i)} y={H - PAD.bottom + 13}
              textAnchor="middle" fontSize={7} fill="#cbd5e1" fontWeight={600}
            >
              Wk {d.week}
            </text>
            <rect
              x={xScale(i) - segW / 2} y={PAD.top}
              width={segW} height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
            />
          </g>
        ))}

        {/* Pulsing dot at last (live) data point */}
        <circle className="live-ring" cx={lastPt.x} cy={lastPt.y} r={5} fill="none" stroke={lineColor} strokeWidth={1} />
        <circle cx={lastPt.x} cy={lastPt.y} r={3} fill={lineColor} />

        {/* Hover indicator */}
        {hoveredPt && (
          <>
            <line
              x1={hoveredPt.x} y1={PAD.top}
              x2={hoveredPt.x} y2={H - PAD.bottom}
              stroke={lineColor} strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
            />
            <circle cx={hoveredPt.x} cy={hoveredPt.y} r={4} fill="#fff" stroke={lineColor} strokeWidth={1.5} />
          </>
        )}
      </svg>

      {/* Floating tooltip */}
      {hoveredData && hoveredPt && (
        <div style={{
          position: 'absolute',
          left: `calc(${(hoveredPt.x / W) * 100}% + 10px)`,
          top: `calc(${(hoveredPt.y / H) * 100}% - 20px)`,
          background: '#0f172a',
          color: '#fff',
          borderRadius: 10,
          padding: '7px 11px',
          fontSize: 11,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          zIndex: 10,
          transform: hoveredPt.x > W * 0.7 ? 'translateX(calc(-100% - 20px))' : undefined,
        }}>
          <div style={{ fontWeight: 800, fontSize: 12 }}>{formatPrice(hoveredData.closing_price)}</div>
          <div style={{ color: '#64748b', marginTop: 2, fontSize: 10 }}>Week {hoveredData.week}</div>
          {priceDiff !== null && (
            <div style={{ color: priceDiff >= 0 ? '#10b981' : '#f43f5e', fontWeight: 700, marginTop: 2, fontSize: 10 }}>
              {priceDiff >= 0 ? '+' : ''}{formatPrice(priceDiff)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
