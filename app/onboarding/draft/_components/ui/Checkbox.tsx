'use client';

// Radix Checkbox styled from tokens, replacing the native input.

import * as RCheckbox from '@radix-ui/react-checkbox';
import { useId } from 'react';

export default function Checkbox({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <RCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={v => onCheckedChange(v === true)}
        className={[
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-control border',
          'transition-colors duration-150 ease-out-quart',
          'border-line-strong bg-surface hover:border-ink-3',
          'data-[state=checked]:border-emerald data-[state=checked]:bg-emerald',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
        ].join(' ')}
      >
        <RCheckbox.Indicator className="text-surface">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <label htmlFor={id} className="cursor-pointer select-none text-label text-ink-2">
        {label}
      </label>
    </div>
  );
}
