import Image from 'next/image';
import { TEAM_LOGOS } from '@/lib/team-logos';

export default function TeamLogo({ code, size = 16 }: { code: string | null | undefined; size?: number }) {
  const url = code ? TEAM_LOGOS[code] : undefined;
  if (!url) return null;
  return (
    <Image
      src={url} alt={code as string} width={size} height={size} unoptimized
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
    />
  );
}
