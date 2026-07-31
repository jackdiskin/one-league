import Image from 'next/image';
import { TEAM_LOGOS } from '@/lib/team-logos';

export default function TeamLogo({ code, size = 16 }: { code: string | null | undefined; size?: number }) {
  const url = code ? TEAM_LOGOS[code] : undefined;
  if (!url) return null;
  return (
    <Image
      src={url}
      // Decorative: the team code is always rendered as text next to it, so
      // announcing it again would just duplicate.
      alt=""
      width={size}
      height={size}
      unoptimized
      className="block shrink-0 object-contain"
      // Dimensions come from a prop, so they can't be a static class.
      style={{ width: size, height: size }}
    />
  );
}
