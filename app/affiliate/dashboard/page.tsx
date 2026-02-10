import { redirect } from 'next/navigation';
import { getCurrentAffiliate } from '@/lib/auth';
import AffiliateDashboard from '@/components/AffiliateDashboard';

export default async function AffiliateDashboardPage() {
  const affiliate = await getCurrentAffiliate();
  
  if (!affiliate) {
    redirect('/affiliate/login');
  }
  
  return <AffiliateDashboard />;
}
