import { DashboardClient } from './DashboardClient';
import { getDashboardData } from '@/lib/dashboard-data';

export const metadata = {
  title: '운동 출석판',
  robots: { index: false, follow: false },
};

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getDashboardData(slug);
  return <DashboardClient slug={slug} {...data} />;
}
