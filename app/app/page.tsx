import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import AdminDashboard from '@/components/AdminDashboard';

/**
 * App entry point - handles Shopify OAuth initiation OR shows admin dashboard
 * This is the App URL that Shopify redirects to after store selection
 * OR the main admin dashboard after login
 */
export default async function AppPage({
  searchParams,
}: {
  searchParams: { shop?: string; hmac?: string };
}) {
  const { shop, hmac } = searchParams;

  // If shop parameter is present (from Shopify redirect), initiate OAuth
  if (shop && shop !== 'null') {
    const installUrl = `/api/auth/install?shop=${shop}${hmac ? `&hmac=${hmac}` : ''}`;
    redirect(installUrl);
  }

  // Otherwise, show the admin dashboard (middleware handles auth check)
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-indigo-600 dark:border-t-indigo-500 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <AdminDashboard />
    </Suspense>
  );
}