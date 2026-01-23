import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * OAuth success page - shows tokens were received and stored
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const shop = searchParams.get('shop');

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  // Get stored session to verify tokens were saved
  const session = await prisma.shopifySession.findFirst({
    where: { shop },
    orderBy: { created_at: 'desc' },
  });

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    message: 'OAuth authentication successful! Tokens have been stored.',
    shop: shop,
    admin_token_preview: session.access_token 
      ? `${session.access_token.substring(0, 10)}...` 
      : 'Not available',
    storefront_token_preview: session.storefront_access_token 
      ? `${session.storefront_access_token.substring(0, 10)}...` 
      : 'Not available',
    scope: session.scope,
    next_steps: [
      '1. Update your .env file with the stored tokens',
      '2. Verify webhooks are configured',
      '3. Test the affiliate system',
    ],
  }, { status: 200 });
}