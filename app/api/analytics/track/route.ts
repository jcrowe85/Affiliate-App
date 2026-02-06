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
      affiliate_id,
      affiliate_number,
    } = body;

    // Log incoming request for debugging
    console.log('[Analytics Track] Received:', {
      event,
      shop,
      has_session_id: !!session_id,
      has_visitor_id: !!visitor_id,
      page_path: page?.path,
    });

    if (!session_id || !visitor_id || !shop || !event) {
      console.error('[Analytics Track] Missing required fields:', {
        has_session_id: !!session_id,
        has_visitor_id: !!visitor_id,
        has_shop: !!shop,
        has_event: !!event,
      });
      return NextResponse.json(
        { error: 'Missing required fields', received: { event, has_session_id: !!session_id, has_visitor_id: !!visitor_id, shop } },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Extract shop ID - handle both formats: "shop.myshopify.com" and just "shop"
    let shopifyShopId = shop;
    if (shop.includes('.myshopify.com')) {
      shopifyShopId = shop.replace('.myshopify.com', '');
    }
    
    // If we have affiliate_number but not affiliate_id, look it up
    let finalAffiliateId = affiliate_id;
    if (!finalAffiliateId && affiliate_number) {
      try {
        const affiliateNumberInt = parseInt(String(affiliate_number), 10);
        console.log('[Analytics Track] Looking up affiliate:', {
          shopifyShopId,
          affiliate_number: affiliateNumberInt,
          affiliate_number_type: typeof affiliate_number,
        });
        
        const affiliate = await prisma.affiliate.findFirst({
          where: {
            shopify_shop_id: shopifyShopId,
            affiliate_number: affiliateNumberInt,
          },
          select: { id: true, affiliate_number: true },
        });
        
        if (affiliate) {
          finalAffiliateId = affiliate.id;
          console.log('[Analytics Track] ✅ Looked up affiliate_id from affiliate_number:', {
            affiliate_id: finalAffiliateId,
            affiliate_number: affiliate.affiliate_number,
          });
        } else {
          console.warn('[Analytics Track] ❌ Affiliate not found for number:', {
            shopifyShopId,
            affiliate_number: affiliateNumberInt,
            available_affiliates: await prisma.affiliate.findMany({
              where: { shopify_shop_id: shopifyShopId },
              select: { affiliate_number: true },
            }).then(affs => affs.map(a => a.affiliate_number)),
          });
        }
      } catch (err) {
        console.error('[Analytics Track] Error looking up affiliate:', err);
      }
    }
    
    console.log('[Analytics Track] Processing for shop:', shopifyShopId, 'affiliate_id:', finalAffiliateId, 'affiliate_number:', affiliate_number);

    // Handle page_view events - update or create session
    if (event === 'page_view') {
      const sessionStartTime = sessionData?.start_time || timestamp;
      const entryPage = sessionData?.entry_page || page?.path || '/';
      const pagesVisited = sessionData?.pages_visited || [page?.path || '/'];
      const pageViews = sessionData?.page_views || 1;
      const timeOnPage = sessionData?.time_on_page || 0;

      // Find or create session by session_id (client-generated ID)
      let visitorSession = await prisma.visitorSession.findFirst({
        where: { 
          session_id: session_id,
          shopify_shop_id: shopifyShopId,
        },
      });

      // Extract URL params from page data
      const urlParams = page?.url_params || {};
      
      if (!visitorSession) {
        // Create new session - store URL params from initial visit
        console.log('[Analytics Track] Creating new session:', session_id);
        visitorSession = await prisma.visitorSession.create({
          data: {
            session_id,
            visitor_id,
            shopify_shop_id: shopifyShopId,
            affiliate_id: finalAffiliateId || null,
            affiliate_number: affiliate_number ? parseInt(String(affiliate_number), 10) : null,
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
            url_params: Object.keys(urlParams).length > 0 ? urlParams : null, // Store URL params in session
          },
        });
        console.log('[Analytics Track] Session created:', visitorSession.id);
      } else {
        console.log('[Analytics Track] Updating existing session:', visitorSession.id);
        // Update existing session
        const updatedPagesVisited = Array.from(
          new Set([...visitorSession.pages_visited, ...pagesVisited])
        );
        const updatedPageViews = Math.max(visitorSession.page_views, pageViews);
        
        // Merge URL params: keep existing ones, add new ones if they don't exist
        // Only update if new URL params are provided (don't overwrite with empty object)
        const existingUrlParams = (visitorSession.url_params as Record<string, string>) || {};
        const mergedUrlParams = Object.keys(urlParams).length > 0 
          ? { ...existingUrlParams, ...urlParams } // Merge if new params exist
          : existingUrlParams; // Keep existing if no new params

        visitorSession = await prisma.visitorSession.update({
          where: { id: visitorSession.id },
          data: {
            ...(finalAffiliateId && { affiliate_id: finalAffiliateId }),
            ...(affiliate_number && { affiliate_number: parseInt(String(affiliate_number), 10) }),
            page_views: updatedPageViews,
            pages_visited: updatedPagesVisited,
            is_bounce: updatedPageViews === 1,
            url_params: Object.keys(mergedUrlParams).length > 0 ? mergedUrlParams : null,
            updated_at: new Date(),
          },
        });
      }

      // Create page view event
      const event = await prisma.visitorEvent.create({
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
            url_params: page?.url_params || {}, // Store URL parameters
          },
          timestamp: BigInt(timestamp),
        },
      });
      console.log('[Analytics Track] Event created:', event.id);
    } else if (event === 'page_exit') {
      // Handle page exit - update session end time
      const visitorSession = await prisma.visitorSession.findFirst({
        where: { 
          session_id: session_id,
          shopify_shop_id: shopifyShopId,
        },
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
      const visitorSession = await prisma.visitorSession.findFirst({
        where: { 
          session_id: session_id,
          shopify_shop_id: shopifyShopId,
        },
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

    console.log('[Analytics Track] Successfully processed event:', event);
    return NextResponse.json({ success: true, message: 'Event tracked' }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    console.error('[Analytics Track] Error:', error);
    console.error('[Analytics Track] Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Tracking failed', details: error.toString() },
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
