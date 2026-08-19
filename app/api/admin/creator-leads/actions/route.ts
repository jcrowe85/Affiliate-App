import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { resolvePending, sendBatch, statusCounts, sentInLast24h } from '@/lib/creator-outreach/pipeline';
import { apifyToken } from '@/lib/creator-outreach/instagram';

export const dynamic = 'force-dynamic';
// Resolving a batch of profiles waits on a third-party scraper run, which is
// slow but bounded. Sends are kept well inside this by the small caps below.
export const maxDuration = 300;

/**
 * Runs a pipeline stage from the admin UI.
 *
 * Both actions are capped far below what the CLI scripts allow. A serverless
 * request has a hard ceiling, and a stage that times out halfway leaves the
 * admin with no idea what completed — so the UI does small, quick slices and
 * the bulk work stays in cron/CLI, where a run can take as long as it needs.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '');
    const shopId = admin.shopify_shop_id;

    if (action === 'resolve') {
      if (!apifyToken()) {
        return NextResponse.json({ error: 'No Apify credential configured' }, { status: 400 });
      }
      const limit = Math.min(50, Math.max(1, parseInt(body?.limit ?? 50, 10) || 50));
      const summary = await resolvePending(shopId, { limit, batchSize: limit });
      return NextResponse.json({ summary, counts: await statusCounts(shopId) });
    }

    if (action === 'send') {
      const limit = Math.min(25, Math.max(1, parseInt(body?.limit ?? 10, 10) || 10));
      const summary = await sendBatch(shopId, {
        limit,
        dryRun: Boolean(body?.dryRun),
        // Tighter than the CLI's spacing purely to fit the request window.
        // The rolling 24h cap still governs total volume, so this can't be
        // used to fire off a day's worth of mail in one click.
        delayMs: body?.dryRun ? 0 : 2000,
      });
      return NextResponse.json({
        summary,
        counts: await statusCounts(shopId),
        sentToday: await sentInLast24h(shopId),
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[creator-leads] action failed:', error);
    return NextResponse.json({ error: error?.message || 'Action failed' }, { status: 500 });
  }
}
