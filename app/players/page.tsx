import { redirect } from 'next/navigation';

export default async function PlayersRedirect({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season } = await searchParams;
  redirect(season ? `/transfers?season=${season}` : '/transfers');
}
