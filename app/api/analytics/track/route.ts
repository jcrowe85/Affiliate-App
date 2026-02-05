import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Track visitor analytics events
 * Receives data from the Shopify theme tracking script
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      event,
      session_id,
      visitor_id,
      shop,
      page,
      session: sessionData,
      referrer,
      device,
      timestamp,
      event_data,
    } = body;

    if (!session_id || !visitor_id || !shop || !event) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const shopifyShopId = shop.replace('.myshopify.com', '');

    // Handle page_view events - update or create session
    if (event === 'page_view') {
      const sessionStartTime = sessionData?.start_time || timestamp;
      const entryPage = sessionData?.entry_page || page?.path || '/';
      const pagesVisited = sessionData?.pages_visited || [page?.path || '/'];
      const pageViews = sessionData?.page_views || 1;
      const timeOnPage = sessionData?.time_on_page || 0;

      // Find or create session
      let visitorSession = await prisma.visitorSession.findUnique({
        where: { session_id },
      });

      if (!visitorSession) {
        // Create new session
        visitorSession = await prisma.visitorSession.create({
          data: {
            session_id,
            visitor_id,
            shopify_shop_id: shopifyShopId,
            entry_page: entryPage,
            start_time: BigInt(sessionStartTime),
            page_views: pageViews,
            pages_visited: pagesVisited,
            device_type: device?.type,
            user_agent: device?.userAgent,
            screen_width: device?.screenWidth,
            screen_height: device?.screenHeight,
            language: device?.language,
            timezone: device?.timezone,
            referrer_type: referrer?.type,
            referrer_url: referrer?.url,
            referrer_domain: referrer?.domain,
            is_bounce: pageViews === 1,
          },
        });
      } else {
        // Update existing session
        const updatedPagesVisited = Array.from(
          new Set([...visitorSession.pages_visited, ...pagesVisited])
        );
        const updatedPageViews = Math.max(visitorSession.page_views, pageViews);

        visitorSession = await prisma.visitorSession.update({
          where: { id: visitorSession.id },
          data: {
            page_views: updatedPageViews,
            pages_visited: updatedPagesVisited,
            is_bounce: updatedPageViews === 1,
            updated_at: new Date(),
          },
        });
      }

      // Create page view event
      await prisma.visitorEvent.create({
        data: {
          session_id: visitorSession.id,
          visitor_id,
          event_type: 'page_view',
          shopify_shop_id: shopifyShopId,
          page_url: page?.url || '',
          page_path: page?.path || '/',
          page_title: page?.title,
          referrer: page?.referrer || referrer?.url,
          event_data: {
            time_on_page: timeOnPage,
          },
          timestamp: BigInt(timestamp),
        },
      });
    } else if (event === 'page_exit') {
      // Handle page exit - update session end time
      const visitorSession = await prisma.visitorSession.findUnique({
        where: { session_id },
      });

      if (visitorSession) {
        const exitPage = event_data?.exit_page || page?.path || '/';
        const timeOnPage = event_data?.time_on_page || 0;
        const endTime = timestamp;

        await prisma.visitorSession.update({
          where: { id: visitorSession.id },
          data: {
            exit_page: exitPage,
            end_time: BigInt(endTime),
            total_time: timeOnPage
              ? Math.floor(timeOnPage / 1000)
              : visitorSession.total_time,
            updated_at: new Date(),
          },
        });

        // Create exit event
        await prisma.visitorEvent.create({
          data: {
            session_id: visitorSession.id,
            visitor_id,
            event_type: 'page_exit',
            shopify_shop_id: shopifyShopId,
            page_url: page?.url || '',
            page_path: exitPage,
            event_data: event_data || {},
            timestamp: BigInt(timestamp),
          },
        });
      }
    } else {
      // Handle other events (scroll, click, etc.)
      const visitorSession = await prisma.visitorSession.findUnique({
        where: { session_id },
      });

      if (visitorSession) {
        await prisma.visitorEvent.create({
          data: {
            session_id: visitorSession.id,
            visitor_id,
            event_type: event,
            shopify_shop_id: shopifyShopId,
            page_url: page?.url || '',
            page_path: page?.path || '/',
            event_data: event_data || {},
            timestamp: BigInt(timestamp),
          },
        });
      }
    }

    return NextResponse.json({ success: true }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    console.error('Analytics tracking error:', error);
    return NextResponse.json(
      { error: error.message || 'Tracking failed' },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
