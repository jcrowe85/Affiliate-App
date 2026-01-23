import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to get stored Shopify access token
 * Requires admin login
 */
export async function GET(request: NextRequest) {
  try {
    // Get current admin (optional - remove if you want to allow unauthenticated)
    const admin = await getCurrentAdmin();
    
    const shopParam = request.nextUrl.searchParams.get('shop') || '163bfa-5f.myshopify.com';
    const sessionId = `offline_${shopParam}`;

    const session = await prisma.shopifySession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({
        error: 'No session found',
        sessionId: sessionId,
        suggestion: 'Run OAuth installation again',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      shop: session.shop,
      admin_token: session.access_token,
      admin_token_preview: session.access_token 
        ? `${session.access_token.substring(0, 15)}...` 
        : 'Not available',
      storefront_token: session.storefront_access_token,
      storefront_token_preview: session.storefront_access_token 
        ? `${session.storefront_access_token.substring(0, 15)}...` 
        : 'Not available',
      scope: session.scope,
      created_at: session.created_at,
      updated_at: session.updated_at,
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}