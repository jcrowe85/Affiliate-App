import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to check what sessions are in the database
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
        // Whether a token exists is all a debug view needs. Echoing even part
        // of it just leaks credential material into logs and screenshots.
        has_access_token: !!s.access_token,
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