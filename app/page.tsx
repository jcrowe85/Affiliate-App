import { redirect } from 'next/navigation';

/**
 * Root page - handles Shopify OAuth initiation if shop parameter is present
 */
export default async function Home({
  searchParams,
}: {
  searchParams: { shop?: string; hmac?: string };
}) {
  const { shop, hmac } = searchParams;

  // If shop parameter is present (from Shopify redirect), initiate OAuth
  if (shop) {
    const installUrl = `/api/auth/install?shop=${shop}${hmac ? `&hmac=${hmac}` : ''}`;
    redirect(installUrl);
  }

  // Otherwise, redirect to login page
  redirect('/login');
}