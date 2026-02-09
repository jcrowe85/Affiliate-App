import { redirect } from 'next/navigation';
import { getCurrentAffiliate } from '@/lib/auth';

export default async function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const affiliate = await getCurrentAffiliate();

  if (!affiliate) {
    redirect('/affiliate/login');
  }

  return <>{children}</>;
}
