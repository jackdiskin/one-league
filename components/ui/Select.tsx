'use client';

// Radix Select styled from tokens, replacing the native <select> elements.
// Height is fixed at h-9 so every control in the filter bar lines up.

import * as RSelect from '@radix-ui/react-select';

export interface SelectOption {
  value: string;
  label: string;
}

export default function Select({
  value,
  onValueChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange}>
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={[
          'flex h-9 items-center justify-between gap-2 rounded-control border border-line',
          'bg-surface px-3 text-label text-ink',
          'transition-colors duration-150 ease-out-quart',
          'hover:border-line-strong',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:border-emerald',
          'data-[state=open]:border-emerald data-[state=open]:ring-2 data-[state=open]:ring-emerald',
          className,
        ].join(' ')}
      >
        <RSelect.Value />
        <RSelect.Icon className="text-ink-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-64 min-w-(--radix-select-trigger-width) overflow-hidden rounded-control border border-line bg-surface shadow-lg"
        >
          <RSelect.ScrollUpButton className="flex h-5 items-center justify-center text-ink-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </RSelect.ScrollUpButton>

          <RSelect.Viewport className="p-1">
            {options.map(o => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className={[
                  'relative flex cursor-pointer select-none items-center rounded-control py-1.5 pl-7 pr-3',
                  'text-label text-ink outline-none',
                  'data-[highlighted]:bg-surface-sunken',
                  'data-[state=checked]:text-emerald',
                ].join(' ')}
              >
                <RSelect.ItemIndicator className="absolute left-2 flex items-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>

          <RSelect.ScrollDownButton className="flex h-5 items-center justify-center text-ink-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </RSelect.ScrollDownButton>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
