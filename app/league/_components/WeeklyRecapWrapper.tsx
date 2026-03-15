'use client';

import { useState, useEffect } from 'react';
import WeeklyRecapModal, { type WeeklyRecapProps, type Badge } from './WeeklyRecapModal';

type WrapperProps = Omit<WeeklyRecapProps, 'onClose'> & {
  dismissKey: string; // e.g. `weekly-recap-${leagueId}-${season}-${week}`
};

export default function WeeklyRecapWrapper({ dismissKey, ...props }: WrapperProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show only if not already dismissed for this league+week combination
    const dismissed = sessionStorage.getItem(dismissKey);
    if (!dismissed) setVisible(true);
  }, [dismissKey]);

  if (!visible) return null;

  return (
    <WeeklyRecapModal
      {...props}
      onClose={() => {
        sessionStorage.setItem(dismissKey, '1');
        setVisible(false);
      }}
    />
  );
}
