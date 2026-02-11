import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAffiliate } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getTimeRangeMs(timeRange: string): number {
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return ranges[timeRange] || ranges['24h'];
}

/**
 * Get affiliate-specific analytics statistics
 * SECURITY: Only returns data for the logged-in affiliate
 */
export async function GET(request: NextRequest) {
  try {
    const affiliate = await getCurrentAffiliate();
    if (!affiliate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shopifyShopId = affiliate.shopify_shop_id;
    const affiliateId = affiliate.id;
    const searchParams = request.nextUrl.searchParams;
    const viewMode = searchParams.get('viewMode') || 'realtime';
    
    let timeRange = '30d';
    let startTimeDate: Date | null = null;
    
    if (viewMode === 'historical') {
      timeRange = searchParams.get('timeRange') || '30d';
      const timeRangeMs = getTimeRangeMs(timeRange);
      const startTime = Date.now() - timeRangeMs;
      startTimeDate = new Date(startTime);
    }

    // Get sessions for this specific affiliate only
    let sessionsList: Awaited<ReturnType<typeof prisma.visitorSession.findMany>>;
    
    if (viewMode === 'realtime') {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      // First get sessions for this affiliate that are active
      const activeSessions = await prisma.visitorSession.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: affiliateId,
          updated_at: {
            gte: fiveMinutesAgo,
          },
        },
        select: {
          id: true,
        },
        take: 50,
      });
      
      const activeSessionIds = activeSessions.map(s => s.id);
      
      // Then get recent events for these sessions
      if (activeSessionIds.length > 0) {
        const recentEvents = await prisma.visitorEvent.findMany({
          where: {
            visitor_session_id: { in: activeSessionIds },
            event_type: 'page_view',
            timestamp: {
              gte: fiveMinutesAgo,
            },
          },
          select: {
            visitor_session_id: true,
          },
          orderBy: {
            timestamp: 'desc',
          },
          take: 1000,
        });
        
        const sessionIdsWithEvents = Array.from(new Set(recentEvents.map(e => e.visitor_session_id)));
        
        sessionsList = await prisma.visitorSession.findMany({
          where: {
            id: { in: sessionIdsWithEvents },
            shopify_shop_id: shopifyShopId,
            affiliate_id: affiliateId,
          },
          orderBy: {
            updated_at: 'desc',
          },
          take: 50,
        });
      } else {
        sessionsList = [];
      }
    } else {
      // Historical mode
      sessionsList = await prisma.visitorSession.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: affiliateId,
          ...(startTimeDate && !isNaN(startTimeDate.getTime()) ? {
            start_time: {
              gte: startTimeDate,
            },
          } : {}),
        },
        orderBy: {
          start_time: 'desc',
        },
        take: 1000,
      });
    }

    // Calculate metrics for this affiliate
    const totalSessions = sessionsList.length;
    const uniqueVisitors = new Set(sessionsList.map(s => s.visitor_id)).size;
    
    // Get page views from events
    const sessionIds = sessionsList.map(s => s.id);
    const pageViews = sessionIds.length > 0
      ? await prisma.visitorEvent.count({
          where: {
            visitor_session_id: { in: sessionIds },
            event_type: 'page_view',
          },
        })
      : 0;

    // Calculate bounce rate (sessions with only 1 page view)
    const bounceSessions = sessionsList.filter(s => s.is_bounce || s.page_views === 1).length;
    const bounceRate = totalSessions > 0 ? (bounceSessions / totalSessions) * 100 : 0;

    // Calculate average session time
    const sessionsWithTime = sessionsList.filter(s => s.total_time !== null && s.total_time !== undefined);
    const avgSessionTime = sessionsWithTime.length > 0
      ? sessionsWithTime.reduce((sum, s) => sum + (s.total_time || 0), 0) / sessionsWithTime.length
      : 0;

    const pagesPerSession = totalSessions > 0 ? pageViews / totalSessions : 0;

    // Get active visitors (for real-time mode)
    const activeVisitors: Array<{
      session_id: string;
      currentPage: string;
      device: string;
      location: string;
      lastSeen: number;
    }> = [];

    if (viewMode === 'realtime') {
      const recentEvents = await prisma.visitorEvent.findMany({
        where: {
          visitor_session_id: { in: sessionIds },
          event_type: 'page_view',
          timestamp: {
            gte: new Date(Date.now() - 5 * 60 * 1000),
          },
        },
        include: {
          session: {
            select: {
              id: true,
              device_type: true,
              location_country: true,
              updated_at: true,
            },
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 100,
      });

      const uniqueSessions = new Map();
      recentEvents.forEach(event => {
        if (!uniqueSessions.has(event.visitor_session_id)) {
          uniqueSessions.set(event.visitor_session_id, event);
        }
      });

      activeVisitors.push(...Array.from(uniqueSessions.values()).map(event => ({
        session_id: event.session.id,
        currentPage: event.page_path || event.page_url || '/',
        device: event.session.device_type || 'Unknown',
        location: event.session.location_country || 'Unknown',
        lastSeen: Math.floor((Date.now() - event.session.updated_at.getTime()) / 1000),
      })));
    }

    // Format response similar to admin analytics API
    return NextResponse.json({
      metrics: {
        total_visitors: totalSessions,
        unique_visitors: uniqueVisitors,
        sessions: totalSessions,
        bounce_rate: bounceRate,
        avg_session_time: avgSessionTime,
        pages_per_session: pagesPerSession,
      },
      activeVisitors,
      topPages: [],
      entryPages: [],
      exitPages: [],
      trafficSources: [],
      devices: [],
      browsers: [],
      geography: [],
      affiliates: [{
        affiliate_id: affiliateId,
        affiliate_number: affiliate.affiliate_number,
        affiliate_name: affiliate.name,
        sessions: totalSessions,
        visitors: uniqueVisitors,
        page_views: pageViews,
        bounce_rate: bounceRate,
        avg_session_time: avgSessionTime,
        active_visitors: activeVisitors,
      }],
    });
  } catch (error: any) {
    console.error('Affiliate analytics error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
