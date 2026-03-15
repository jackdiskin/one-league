import type { Badge } from '@/app/league/_components/WeeklyRecapModal';

export interface BadgeInput {
  userId: string;
  myTeamId: number;
  myPoints: number;
  avgPoints: number;
  currentRank: number;
  previousRank: number;
  rosterValue: number;
  weeklyWinner: { fantasy_team_id: number; points: number } | null;
  highestValueTeamId: number | null;
  consecutiveWins: number;         // how many weeks in a row this team won (including this one)
  projectedPoints: number | null;  // from player_weekly_projections; null if not available
  allStandings: { fantasy_team_id: number }[];
}

export function computeWeeklyBadges(input: BadgeInput): Badge[] {
  const badges: Badge[] = [];
  const {
    myTeamId, myPoints, avgPoints, currentRank, previousRank,
    rosterValue, weeklyWinner, highestValueTeamId,
    consecutiveWins, projectedPoints,
  } = input;

  // 🏆 HIGHEST SCORER — won the week
  if (weeklyWinner && weeklyWinner.fantasy_team_id === myTeamId) {
    badges.push({ id: 'HIGHEST_SCORER', icon: '🏆', name: 'Highest Scorer', desc: 'Won the week' });
  }

  // 📈 MOST IMPROVED — biggest positive rank jump (3+ spots)
  if (previousRank > 0 && previousRank - currentRank >= 3) {
    badges.push({ id: 'MOST_IMPROVED', icon: '📈', name: 'Most Improved', desc: `Up ${previousRank - currentRank} spots` });
  }

  // 💰 MARKET LEADER — highest current roster value in the league
  if (highestValueTeamId === myTeamId) {
    badges.push({ id: 'MARKET_LEADER', icon: '💰', name: 'Market Leader', desc: 'Highest squad value' });
  }

  // 🔥 HOT STREAK — won 2+ weeks in a row
  if (consecutiveWins >= 2) {
    badges.push({ id: 'HOT_STREAK', icon: '🔥', name: 'Hot Streak', desc: `${consecutiveWins} weeks in a row` });
  }

  // ⚡ DOMINANT — scored 150%+ of league average
  if (avgPoints > 0 && myPoints >= avgPoints * 1.5) {
    badges.push({ id: 'DOMINANT', icon: '⚡', name: 'Dominant', desc: 'Scored 150%+ of avg' });
  }

  // 🎯 SHARP — outscored projected points (when projection is available)
  if (projectedPoints !== null && projectedPoints > 0 && myPoints > projectedPoints) {
    badges.push({ id: 'SHARP', icon: '🎯', name: 'Sharp', desc: 'Beat your projection' });
  }

  return badges;
}
