'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types matching the Python pipeline's WebSocket delta message
// ---------------------------------------------------------------------------

export interface LiveStatDelta {
  passingYards:       number;
  passingTds:         number;
  interceptions:      number;
  rushingYards:       number;
  rushingTds:         number;
  receptions:         number;
  receivingYards:     number;
  receivingTds:       number;
  fumblesLost:        number;
  fg0_39:             number;
  fg40_49:            number;
  fg50Plus:           number;
  fgMissed:           number;
  xpMade:             number;
  xpMissed:           number;
  twoPtConversions:   number;
  fantasyPointsTotal: number;
}

export interface LivePlayerStats {
  playerId:           string;
  name:               string;
  eventId:            string;
  teamAbbr:           string;
  totals:             LiveStatDelta;
  lastUpdated:        number; // Date.now() timestamp
}

export interface LiveStatMessage {
  playerId:  string;
  name:      string;
  eventId:   string;
  teamAbbr:  string;
  delta:     Partial<LiveStatDelta>;
  totals:    LiveStatDelta;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const WS_URL = process.env.NEXT_PUBLIC_LIVE_WS_URL ?? 'ws://localhost:8765';

/**
 * Subscribe to live stat updates for a set of SportsDataIO PlayerIDs.
 *
 * @param playerIds - Array of SportsDataIO PlayerID strings (players.external_player_id).
 *                    Pass an empty array or null to skip connecting.
 * @returns Map of playerId → LivePlayerStats (continuously updated as deltas arrive)
 *
 * Usage:
 *   const liveStats = useLiveStats(['23189', '21831']);
 *   const bijanStats = liveStats.get('23189');
 */
export function useLiveStats(
  playerIds: string[] | null | undefined,
): Map<string, LivePlayerStats> {
  const [statsMap, setStatsMap] = useState<Map<string, LivePlayerStats>>(new Map());

  const playerIdsRef = useRef<string[]>([]);
  const wsRef        = useRef<WebSocket | null>(null);
  const mountedRef   = useRef(true);

  useEffect(() => {
    playerIdsRef.current = playerIds ?? [];
  }, [playerIds]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data) as LiveStatMessage;
      if (!msg.playerId || !msg.totals) return;
      setStatsMap(prev => {
        const next = new Map(prev);
        next.set(msg.playerId, {
          playerId:    msg.playerId,
          name:        msg.name,
          eventId:     msg.eventId,
          teamAbbr:    msg.teamAbbr,
          totals:      msg.totals,
          lastUpdated: Date.now(),
        });
        return next;
      });
    } catch {
      // ignore malformed messages
    }
  }, []);

  useEffect(() => {
    const ids = playerIds ?? [];
    if (ids.length === 0) return;

    mountedRef.current = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    function connect() {
      if (!mountedRef.current) return;
      try {
        ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          ws?.send(JSON.stringify({ subscribe: playerIdsRef.current }));
        };

        ws.onmessage = handleMessage;

        ws.onclose = () => {
          if (mountedRef.current) {
            reconnectTimer = setTimeout(connect, 3_000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (mountedRef.current) {
          reconnectTimer = setTimeout(connect, 3_000);
        }
      }
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((playerIds ?? []).slice().sort())]);

  // When subscribed IDs change on an existing connection, send updated subscription
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const ids = playerIds ?? [];
    if (ids.length > 0) {
      ws.send(JSON.stringify({ subscribe: ids }));
    }
  }, [playerIds]);

  // Clean up stats for players no longer in scope
  useEffect(() => {
    const ids = new Set(playerIds ?? []);
    setStatsMap(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (!ids.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [playerIds]);

  return statsMap;
}

// ---------------------------------------------------------------------------
// Formatting helpers for live stat display
// ---------------------------------------------------------------------------

/** Returns the live fantasy points total for a player, or null if no live data. */
export function getLivePoints(
  liveStats: Map<string, LivePlayerStats>,
  playerId: string | null | undefined,
): number | null {
  if (!playerId) return null;
  return liveStats.get(playerId)?.totals.fantasyPointsTotal ?? null;
}

/** Returns a short stat-line string like "22 RuYd  1 TD" for a player. */
export function getLiveStatLine(
  liveStats: Map<string, LivePlayerStats>,
  playerId: string | null | undefined,
): string {
  if (!playerId) return '';
  const s = liveStats.get(playerId);
  if (!s) return '';
  const t = s.totals;
  const parts: string[] = [];

  if (t.passingYards)   parts.push(`${t.passingYards} PaYd`);
  if (t.passingTds)     parts.push(`${t.passingTds} PaTD`);
  if (t.rushingYards)   parts.push(`${t.rushingYards} RuYd`);
  if (t.rushingTds)     parts.push(`${t.rushingTds} RuTD`);
  if (t.receptions)     parts.push(`${t.receptions}/${t.receivingYards} Rec`);
  if (t.receivingTds)   parts.push(`${t.receivingTds} RecTD`);
  if (t.interceptions)  parts.push(`${t.interceptions} INT`);
  if (t.fumblesLost)    parts.push(`${t.fumblesLost} FL`);

  const fgMade = (t.fg0_39 ?? 0) + (t.fg40_49 ?? 0) + (t.fg50Plus ?? 0);
  const fgAtt  = fgMade + (t.fgMissed ?? 0);
  if (fgAtt)            parts.push(`${fgMade}/${fgAtt} FG`);
  if (t.xpMade)         parts.push(`${t.xpMade} XP`);

  return parts.join('  ');
}
