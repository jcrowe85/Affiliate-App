import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendDue, autoTopUp } from '@/lib/creator-outreach/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Sends whatever outreach is due. Driven by Vercel Cron (see vercel.json).
 *
 * This is what actually delivers a paced batch: the UI plans the schedule and
 * then closes, and this keeps working through it every minute regardless of
 * whether anyone is watching.
 *
 * Authenticated by CRON_SECRET. Vercel sends it as a bearer token on scheduled
 * invocations; without the check this endpoint would let anyone on the internet
 * drain the send queue on demand.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Cron has no session, so the shops come from the leads themselves —
    // anything queued (due or not) or sitting ready to be queued.
    const shops = await prisma.creatorLead.findMany({
      where: { status: { in: ['queued', 'sending', 'resolved'] } },
      select: { shopify_shop_id: true },
      distinct: ['shopify_shop_id'],
    });

    const topUpEnabled = process.env.CREATOR_OUTREACH_AUTO_TOPUP !== 'false';
    const results: Record<string, unknown> = {};

    for (const { shopify_shop_id: shopId } of shops) {
      // Capped per tick so one shop's backlog can't hold the request open past
      // its timeout; the next tick picks up whatever is left.
      const sent = await sendDue(shopId, { limit: 12 });
      // Refill after sending, so the shortfall reflects what just went out.
      // Idempotent — it queues only the gap, so running it every minute is
      // free once the queue is full.
      const topUp = topUpEnabled ? await autoTopUp(shopId) : null;
      results[shopId] = { ...sent, topUp };
    }

    return NextResponse.json({ ok: true, shops: shops.length, results });
  } catch (error: any) {
    console.error('[cron] creator outreach send failed:', error);
    return NextResponse.json({ error: error?.message || 'Send failed' }, { status: 500 });
  }
}
