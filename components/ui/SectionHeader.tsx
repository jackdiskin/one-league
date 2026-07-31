import type { ReactNode } from 'react';

/**
 * Panel heading. Section identity comes from the label, not from a slab of
 * colour — the old dark divider bars are replaced by this plus a border-line
 * rule.
 */
export default function SectionHeader({
  title,
  sub,
  right,
  as: Tag = 'h3',
}: {
  title: string;
  sub?: string;
  /** Right-aligned chip, count or action. */
  right?: ReactNode;
  as?: 'h2' | 'h3' | 'h4';
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Tag className="text-section text-ink">{title}</Tag>
        {sub && <p className="mt-0.5 text-label text-ink-3">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
