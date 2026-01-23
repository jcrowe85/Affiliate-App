import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Debug endpoint to check what sessions are in the database
 */
export async function GET(request: NextRequest) {
  try {
    const sessions = await prisma.shopifySession.findMany({
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      message: 'Shopify sessions in database',
      count: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        shop: s.shop,
        has_access_token: !!s.access_token,
        access_token_preview: s.access_token ? `${s.access_token.substring(0, 10)}...` : null,
        has_storefront_token: !!s.storefront_access_token,
        scope: s.scope,
        created_at: s.created_at,
      })),
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}