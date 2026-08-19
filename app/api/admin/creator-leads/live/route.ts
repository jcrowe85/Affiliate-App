import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { liveBatch } from '@/lib/creator-outreach/pipeline';

export const dynamic = 'force-dynamic';

/**
 * Feeds the live send view. Polled every few seconds while the page is open,
 * so it stays deliberately small: no bios, no counts that need a scan.
 */
export async function GET() {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const live = await liveBatch(admin.shopify_shop_id);
    return NextResponse.json({
      ...live,
      // The client counts down against its own clock, which can be minutes off
      // from the server's. Sending our clock along lets it correct for the
      // difference instead of showing a countdown that never reaches zero.
      serverNow: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[creator-leads] live failed:', error);
    return NextResponse.json({ error: 'Failed to load live batch' }, { status: 500 });
  }
}
