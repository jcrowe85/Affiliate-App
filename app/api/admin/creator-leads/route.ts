import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { sentInLast24h, statusCounts, experimentResults } from '@/lib/creator-outreach/pipeline';
import { apifyToken } from '@/lib/creator-outreach/instagram';
import { effectiveDailyCap } from '@/lib/creator-outreach/warmup';

export const dynamic = 'force-dynamic';

/** Paged list of creator leads for the admin's shop, plus pipeline counts. */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const search = params.get('q')?.trim();
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(params.get('pageSize') || '50', 10)));

    const where = {
      shopify_shop_id: admin.shopify_shop_id,
      ...(status && status !== 'all' ? { status } : {}),
      ...(search
        ? {
            OR: [
              { instagram_handle: { contains: search, mode: 'insensitive' as const } },
              { full_name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [leads, total, counts, sentToday, experiment] = await Promise.all([
      prisma.creatorLead.findMany({
        where,
        orderBy: [{ sourced_at: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          instagram_handle: true,
          full_name: true,
          followers: true,
          bio: true,
          email: true,
          email_source: true,
          status: true,
          source_filter: true,
          sourced_at: true,
          emailed_at: true,
          replied_at: true,
          joined_at: true,
          resolve_error: true,
          profile_url: true,
        },
      }),
      prisma.creatorLead.count({ where }),
      statusCounts(admin.shopify_shop_id),
      sentInLast24h(admin.shopify_shop_id),
      experimentResults(admin.shopify_shop_id),
    ]);

    return NextResponse.json({
      leads,
      total,
      page,
      pageSize,
      counts,
      sentToday,
      experiment,
      dailyCap: effectiveDailyCap().cap,
      warmup: effectiveDailyCap().state,
      // Surfaced so the UI can tell the admin what's missing instead of letting
      // a send fail silently later.
      config: {
        apifyReady: Boolean(apifyToken()),
        sendingReady: Boolean(
          process.env.CREATOR_OUTREACH_FROM &&
            process.env.CREATOR_OUTREACH_POSTAL_ADDRESS &&
            process.env.TRYBE_JOIN_URL
        ),
      },
    });
  } catch (error: any) {
    console.error('[creator-leads] list failed:', error);
    return NextResponse.json({ error: 'Failed to load creator leads' }, { status: 500 });
  }
}
