// Shared icon set. One consistent stroke weight and viewBox so icons read as a
// system rather than whatever glyph was handy.
//
// Replaces emoji used as UI. Emoji render differently on every platform, can't
// inherit colour, and are the single most obvious "generated" tell on a page.

export type IconName =
  | 'trophy' | 'globe' | 'lock' | 'football' | 'medal'
  | 'chart' | 'users' | 'arrowRight' | 'plus' | 'check';

export default function Icon({
  name,
  size = 16,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'trophy':
      return <svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" /><path d="M12 13v3M9 20h6M9.5 20a2.5 2.5 0 0 1 5 0" /></svg>;
    case 'medal':
      return <svg {...p}><circle cx="12" cy="15" r="5" /><path d="M12 13.4 12.9 15l1.7.2-1.3 1.2.35 1.7L12 17.3l-1.6.8.35-1.7L9.4 15.2l1.7-.2z" /><path d="M8.5 10 6.5 3h11l-2 7" /></svg>;
    case 'globe':
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5z" /></svg>;
    case 'lock':
      return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case 'football':
      return <svg {...p}><ellipse cx="12" cy="12" rx="9" ry="6" /><path d="M5.5 8.5 18.5 15.5M9 12h.01M12 10.6h.01M12 13.4h.01M15 12h.01" /></svg>;
    case 'chart':
      return <svg {...p}><path d="M4 19h16M7 16V9M12 16V5M17 16v-4" /></svg>;
    case 'users':
      return <svg {...p}><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M21 20v-1.5a4 4 0 0 0-3-3.87M16.5 4.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'arrowRight':
      return <svg {...p}><path d="M5 12h14M12 5l7 7-7 7" /></svg>;
    case 'plus':
      return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case 'check':
      return <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>;
  }
}
