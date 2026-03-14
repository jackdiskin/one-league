'use client';

import { useState } from 'react';
import SeasonRecapModal, {
  type StandingRow,
  type TeamWeekScore,
  type WeeklyWinnerRow,
} from './SeasonRecapModal';

interface Props {
  myStanding: StandingRow | null;
  weeklyScores: TeamWeekScore[];
  weeklyWinners: WeeklyWinnerRow[];
  standings: StandingRow[];
}

export default function SeasonRecapWrapper({ myStanding, weeklyScores, weeklyWinners, standings }: Props) {
  const [visible, setVisible] = useState(true);

  if (!visible || !myStanding) return null;

  return (
    <SeasonRecapModal
      myStanding={myStanding}
      weeklyScores={weeklyScores}
      weeklyWinners={weeklyWinners}
      standings={standings}
      onClose={() => setVisible(false)}
    />
  );
}
