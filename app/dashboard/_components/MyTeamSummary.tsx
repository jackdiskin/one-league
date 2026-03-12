import Image from 'next/image';
import { query } from '@/lib/mysql';
import { formatPrice, formatPoints } from '@/lib/format';

interface Props { userId: string; seasonYear: number }

interface Player {
  full_name: string; position: string; team_code: string;
  current_price: number; headshot_url: string | null;
}

const POS_COLOR: Record<string, string> = {
  QB: '#3b82f6',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#a855f7',
  K:  '#cbd5e1',
};

// Field dimensions
const FIELD_H = 580;

// Compute (x%, y%) for each slot — always 8 fixed slots; player is null for empty slots
function getPositions(wrs: Player[], tes: Player[], qbs: Player[], rbs: Player[], ks: Player[]) {
  const out: Array<{ player: Player | null; pos: string; x: number; y: number }> = [];

  // ── Receiver line (y = 26%) — always 4 evenly-spaced slots ──────────────
  const flex = [...wrs, ...tes];
  const flexX = [10, 35, 62, 87];
  for (let i = 0; i < 4; i++) {
    out.push({ player: flex[i] ?? null, pos: flex[i]?.position ?? 'WR', x: flexX[i], y: 26 });
  }

  // ── QB in shotgun (y = 47%) — always 1 slot ──────────────────────────────
  out.push({ player: qbs[0] ?? null, pos: 'QB', x: 50, y: 47 });

  // ── RBs flanking QB (y = 62%) — always 2 slots ────────────────────────────
  out.push({ player: rbs[0] ?? null, pos: 'RB', x: 34, y: 62 });
  out.push({ player: rbs[1] ?? null, pos: 'RB', x: 66, y: 62 });

  // ── Kicker (y = 80%) — always 1 slot ─────────────────────────────────────
  out.push({ player: ks[0] ?? null, pos: 'K', x: 50, y: 80 });

  return out;
}

function PlayerCard({ player, x, y }: { player: Player; x: number; y: number }) {
  const lastName = player.full_name.split(' ').slice(1).join(' ') || player.full_name;
  const color = POS_COLOR[player.position] ?? '#94a3b8';

  return (
    <div style={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
      cursor: 'pointer',
      zIndex: 10,
    }}>
      {/* Price chip */}
      <div style={{
        background: 'rgba(15,23,42,0.75)',
        backdropFilter: 'blur(8px)',
        borderRadius: 20,
        padding: '3px 9px',
        fontSize: 11,
        fontWeight: 700,
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)',
        whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
      }}>
        {formatPrice(player.current_price)}
      </div>

      {/* Avatar */}
      <div style={{ position: 'relative' }}>
        {player.headshot_url ? (
          <Image
            src={player.headshot_url} alt={player.full_name}
            width={72} height={72} unoptimized
            style={{
              width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
              border: '3px solid #fff',
              boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
              display: 'block',
            }}
          />
        ) : (
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#334155', border: '3px solid #fff',
            boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 700, color: '#fff',
          }}>
            {player.full_name[0]}
          </div>
        )}
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 22, height: 22, borderRadius: '50%',
          background: color, border: '2.5px solid #fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7, fontWeight: 900, color: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        }}>
          {player.position}
        </div>
      </div>

      {/* Name card */}
      <div style={{
        background: 'rgba(255,255,255,0.97)',
        borderRadius: 10,
        padding: '5px 10px',
        textAlign: 'center',
        boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
        minWidth: 66,
        maxWidth: 94,
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastName}
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginTop: 1 }}>
          {player.team_code}
        </div>
      </div>
    </div>
  );
}

function EmptySlotCard({ pos, x, y }: { pos: string; x: number; y: number }) {
  const color = POS_COLOR[pos] ?? '#94a3b8';
  return (
    <div style={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
      zIndex: 10,
      opacity: 0.55,
    }}>
      <div style={{
        background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(8px)',
        borderRadius: 20,
        padding: '3px 9px',
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.6)',
        border: '1px solid rgba(255,255,255,0.15)',
        whiteSpace: 'nowrap',
      }}>
        Empty
      </div>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        border: '3px dashed rgba(255,255,255,0.35)',
        background: 'rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7, fontWeight: 900, color: '#fff',
          opacity: 0.7,
        }}>
          {pos}
        </div>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '5px 10px',
        textAlign: 'center',
        minWidth: 66,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
          {pos} Slot
        </div>
        <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
          open
        </div>
      </div>
    </div>
  );
}

// Yard line with optional number labels
function YardLine({ y, label, highlight = false }: { y: number; label?: string; highlight?: boolean }) {
  return (
    <>
      <div style={{
        position: 'absolute', left: 36, right: 36, top: `${y}%`,
        height: highlight ? 2 : 1,
        background: highlight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)',
      }} />
      {label && (
        <>
          <div style={{
            position: 'absolute', left: 8, top: `${y}%`,
            transform: 'translateY(-50%)',
            fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.38)',
            letterSpacing: '0.05em',
          }}>
            {label}
          </div>
          <div style={{
            position: 'absolute', right: 8, top: `${y}%`,
            transform: 'translateY(-50%)',
            fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.38)',
            letterSpacing: '0.05em',
          }}>
            {label}
          </div>
        </>
      )}
    </>
  );
}

export default async function MyTeamSummary({ userId, seasonYear }: Props) {
  const [team] = await query<{
    id: number; team_name: string; total_points: number; budget_remaining: number;
    league_name: string; rank: number; league_size: number;
  }>(
    `SELECT ft.id, ft.team_name, ft.total_points, ft.budget_remaining,
            l.name AS league_name,
            (SELECT COUNT(*) + 1 FROM fantasy_teams ft2
             JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = ft.league_id
             WHERE ft2.season_year = ft.season_year
               AND ft2.total_points > ft.total_points) AS \`rank\`,
            (SELECT COUNT(*) FROM league_members WHERE league_id = ft.league_id) AS league_size
     FROM fantasy_teams ft
     JOIN leagues l ON l.id = ft.league_id
     WHERE ft.user_id = ? AND ft.season_year = ?
     ORDER BY ft.created_at DESC LIMIT 1`,
    [userId, seasonYear]
  );

  if (!team) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center text-2xl">🏈</div>
        <p className="font-semibold text-slate-900">No team yet</p>
        <p className="text-sm text-slate-500 mt-1">Join a league to get started.</p>
      </div>
    );
  }

  const starters = await query<Player>(
    `SELECT p.full_name, p.position, p.team_code, pms.current_price, p.headshot_url
     FROM fantasy_team_roster ftr
     JOIN players p ON p.id = ftr.player_id
     JOIN player_market_state pms ON pms.player_id = ftr.player_id AND pms.season_year = ?
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE AND ftr.roster_slot != 'BENCH'
     ORDER BY FIELD(p.position,'WR','TE','QB','RB','K'), pms.current_price DESC`,
    [seasonYear, team.id]
  );

  const qbs = starters.filter(p => p.position === 'QB');
  const rbs = starters.filter(p => p.position === 'RB');
  const wrs = starters.filter(p => p.position === 'WR');
  const tes = starters.filter(p => p.position === 'TE');
  const ks  = starters.filter(p => p.position === 'K');
  const positions = getPositions(wrs, tes, qbs, rbs, ks);

  const rankLabel = team.rank === 1 ? '1st' : team.rank === 2 ? '2nd' : team.rank === 3 ? '3rd' : `${team.rank}th`;
  const rankMedal = team.rank === 1 ? '🥇' : team.rank === 2 ? '🥈' : team.rank === 3 ? '🥉' : null;

  // Line of scrimmage sits just above the WR row (y=26% → ~14% on field)
  const losY = 13;

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow-sm">

      {/* ── Header ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
            {team.league_name}
          </div>
          <div style={{
            fontSize: 21, fontWeight: 900, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #0f172a 0%, #334155 55%, #059669 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {team.team_name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {[
            { label: 'Points', value: formatPoints(team.total_points), bg: '#f8fafc', border: '#e2e8f0', color: '#0f172a', labelColor: '#94a3b8' },
            { label: 'Cap Space', value: formatPrice(team.budget_remaining), bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', labelColor: '#16a34a' },
            { label: 'Rank',   value: `${rankMedal ?? ''}${rankLabel}`,  bg: team.rank <= 3 ? '#fffbeb' : '#f8fafc', border: team.rank <= 3 ? '#fde68a' : '#e2e8f0', color: '#0f172a', labelColor: '#94a3b8' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: s.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Field ── */}
      <div style={{
        position: 'relative',
        height: FIELD_H,
        overflow: 'hidden',
        background: `repeating-linear-gradient(180deg, #1a7a32 0px, #1a7a32 48px, #1e8838 48px, #1e8838 96px)`,
      }}>

        {/* Opponent end zone (top) */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '9%',
          background: 'rgba(0,0,0,0.18)',
          borderBottom: '2px solid rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.35em', textTransform: 'uppercase' }}>
            
          </div>
        </div>

        {/* Own end zone (bottom) */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '9%',
          background: 'rgba(0,0,0,0.18)',
          borderTop: '2px solid rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.35em', textTransform: 'uppercase' }}>
           
          </div>
        </div>

        {/* Sidelines */}
        <div style={{ position: 'absolute', top: '9%', bottom: '9%', left: 36, width: 2, background: 'rgba(255,255,255,0.55)' }} />
        <div style={{ position: 'absolute', top: '9%', bottom: '9%', right: 36, width: 2, background: 'rgba(255,255,255,0.55)' }} />

        {/* 5-yard tick lines (no labels) */}
        {[
          9+(91-9)*0.5/9, 9+(91-9)*1.5/9, 9+(91-9)*2.5/9, 9+(91-9)*3.5/9,
          9+(91-9)*4.5/9, 9+(91-9)*5.5/9, 9+(91-9)*6.5/9, 9+(91-9)*7.5/9,
        ].map(pct => (
          <div key={pct} style={{
            position: 'absolute', left: 36, right: 36, top: `${pct}%`,
            height: 1, background: 'rgba(255,255,255,0.10)',
          }} />
        ))}

        {/* Hash marks — two columns of short lines inside sidelines */}
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute', top: `${10 + i * (80/18)}%`,
            left: 0, right: 0,
            display: 'flex', justifyContent: 'space-between', padding: '0 100px',
          }}>
            <div style={{ width: 14, height: 1, background: 'rgba(255,255,255,0.25)' }} />
            <div style={{ width: 14, height: 1, background: 'rgba(255,255,255,0.25)' }} />
          </div>
        ))}

        {/* Line of scrimmage — blue glow */}
        <div style={{
          position: 'absolute', left: 36, right: 36, top: `${losY}%`,
          height: 2, background: 'rgba(96,165,250,0.7)',
          boxShadow: '0 0 10px rgba(96,165,250,0.5)',
        }} />
        <div style={{
          position: 'absolute', right: 40, top: `calc(${losY}% - 14px)`,
          fontSize: 8, fontWeight: 800, color: 'rgba(147,197,253,0.85)',
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          Line of Scrimmage
        </div>

        {/* Goal posts — top end zone */}
        <svg
          style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}
          width="80" height="52" viewBox="0 0 60 52"
        >
          {/* Upright post */}
          <rect x="29" y="2" width="2" height="50" fill="rgba(251,191,36,0.7)" rx="1" />
          {/* Crossbar */}
          <rect x="8" y="22" width="44" height="2" fill="rgba(251,191,36,0.7)" rx="1" />
          {/* Left fork */}
          <rect x="8" y="2" width="2" height="22" fill="rgba(251,191,36,0.7)" rx="1" />
          {/* Right fork */}
          <rect x="50" y="2" width="2" height="22" fill="rgba(251,191,36,0.7)" rx="1" />
        </svg>

        {/* Players + empty slots */}
        {positions.map(({ player, pos, x, y }, i) =>
          player
            ? <PlayerCard key={`${player.full_name}-${i}`} player={player} x={x} y={y} />
            : <EmptySlotCard key={`empty-${pos}-${i}`} pos={pos} x={x} y={y} />
        )}
      </div>
    </div>
  );
}
