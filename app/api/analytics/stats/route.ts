import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

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
 * Get analytics statistics
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shopifyShopId = admin.shopify_shop_id;
    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get('timeRange') || '24h';
    const startTime = Date.now() - getTimeRangeMs(timeRange);
    const startTimeBigInt = BigInt(startTime);

    // Get all sessions in time range (ONLY affiliate traffic)
    const sessions = await prisma.visitorSession.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        affiliate_id: { not: null }, // Only affiliate traffic
        start_time: {
          gte: startTimeBigInt,
        },
      },
      include: {
        events: {
          orderBy: {
            timestamp: 'desc',
          },
        },
        affiliate: {
          select: {
            id: true,
            affiliate_number: true,
            name: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    // Get active visitors (sessions with activity in last 5 minutes) - only affiliate traffic
    const fiveMinutesAgo = BigInt(Date.now() - 5 * 60 * 1000);
    const activeSessions = await prisma.visitorEvent.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        timestamp: {
          gte: fiveMinutesAgo,
        },
        session: {
          affiliate_id: { not: null }, // Only affiliate traffic
        },
      },
      include: {
        session: {
          include: {
            affiliate: {
              select: {
                id: true,
                affiliate_number: true,
                name: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 500, // Get more to find most recent per session
    });
    
    // Group by session_id and get the most recent event for each session
    const sessionEventMap = new Map<string, typeof activeSessions[0]>();
    activeSessions.forEach(event => {
      const sessionId = event.session.session_id;
      if (!sessionEventMap.has(sessionId) || 
          Number(event.timestamp) > Number(sessionEventMap.get(sessionId)!.timestamp)) {
        sessionEventMap.set(sessionId, event);
      }
    });
    const uniqueActiveSessions = Array.from(sessionEventMap.values()).slice(0, 50);

    // Debug: Log session count and affiliate IDs
    console.log('[Analytics Stats] Sessions found:', sessions.length);
    console.log('[Analytics Stats] Sessions with affiliate_id:', sessions.filter(s => s.affiliate_id).length);
    console.log('[Analytics Stats] Sample affiliate_ids:', sessions.slice(0, 5).map(s => s.affiliate_id));

    // Calculate metrics
    const totalVisitors = sessions.length;
    const uniqueVisitors = new Set(sessions.map(s => s.visitor_id)).size;
    const totalPageViews = sessions.reduce((sum, s) => sum + s.page_views, 0);
    const bouncedSessions = sessions.filter(s => s.is_bounce).length;
    const bounceRate = totalVisitors > 0 ? (bouncedSessions / totalVisitors) * 100 : 0;
    
    const totalSessionTime = sessions
      .filter(s => s.total_time)
      .reduce((sum, s) => sum + (s.total_time || 0), 0);
    const sessionsWithTime = sessions.filter(s => s.total_time).length;
    const avgSessionTime = sessionsWithTime > 0 ? totalSessionTime / sessionsWithTime : 0;
    
    const totalPages = sessions.reduce((sum, s) => sum + s.pages_visited.length, 0);
    const pagesPerSession = totalVisitors > 0 ? totalPages / totalVisitors : 0;

    // Get top pages
    const pageViewsMap = new Map<string, { views: number; bounces: number }>();
    sessions.forEach(session => {
      session.pages_visited.forEach(path => {
        const current = pageViewsMap.get(path) || { views: 0, bounces: 0 };
        current.views++;
        if (session.is_bounce && session.pages_visited.length === 1) {
          current.bounces++;
        }
        pageViewsMap.set(path, current);
      });
    });

    const topPages = Array.from(pageViewsMap.entries())
      .map(([path, data]) => ({
        path,
        url: path,
        views: data.views,
        bounceRate: data.views > 0 ? (data.bounces / data.views) * 100 : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    // Get entry pages
    const entryPagesMap = new Map<string, number>();
    sessions.forEach(session => {
      const count = entryPagesMap.get(session.entry_page) || 0;
      entryPagesMap.set(session.entry_page, count + 1);
    });

    const entryPages = Array.from(entryPagesMap.entries())
      .map(([path, entries]) => ({ path, url: path, entries }))
      .sort((a, b) => b.entries - a.entries)
      .slice(0, 10);

    // Get exit pages
    const exitPagesMap = new Map<string, number>();
    sessions
      .filter(s => s.exit_page)
      .forEach(session => {
        const count = exitPagesMap.get(session.exit_page!) || 0;
        exitPagesMap.set(session.exit_page!, count + 1);
      });

    const exitPages = Array.from(exitPagesMap.entries())
      .map(([path, exits]) => ({ path, url: path, exits }))
      .sort((a, b) => b.exits - a.exits)
      .slice(0, 10);

    // Get traffic sources
    const trafficSourcesMap = new Map<string, number>();
    sessions.forEach(session => {
      const source = session.referrer_type === 'direct' 
        ? 'direct' 
        : session.referrer_domain || 'unknown';
      const count = trafficSourcesMap.get(source) || 0;
      trafficSourcesMap.set(source, count + 1);
    });

    const totalTraffic = Array.from(trafficSourcesMap.values()).reduce((a, b) => a + b, 0);
    const trafficSources = Array.from(trafficSourcesMap.entries())
      .map(([source, visitors]) => ({
        source,
        visitors,
        percentage: totalTraffic > 0 ? (visitors / totalTraffic) * 100 : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 10);

    // Get devices
    const devicesMap = new Map<string, number>();
    sessions.forEach(session => {
      const type = session.device_type || 'unknown';
      const count = devicesMap.get(type) || 0;
      devicesMap.set(type, count + 1);
    });

    const totalDevices = Array.from(devicesMap.values()).reduce((a, b) => a + b, 0);
    const devices = Array.from(devicesMap.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: totalDevices > 0 ? (count / totalDevices) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Get browsers (from user agent)
    const browsersMap = new Map<string, number>();
    sessions.forEach(session => {
      if (session.user_agent) {
        let browser = 'Unknown';
        if (session.user_agent.includes('Chrome')) browser = 'Chrome';
        else if (session.user_agent.includes('Safari') && !session.user_agent.includes('Chrome')) browser = 'Safari';
        else if (session.user_agent.includes('Firefox')) browser = 'Firefox';
        else if (session.user_agent.includes('Edge')) browser = 'Edge';
        else if (session.user_agent.includes('Opera')) browser = 'Opera';
        
        const count = browsersMap.get(browser) || 0;
        browsersMap.set(browser, count + 1);
      }
    });

    const totalBrowsers = Array.from(browsersMap.values()).reduce((a, b) => a + b, 0);
    const browsers = Array.from(browsersMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalBrowsers > 0 ? (count / totalBrowsers) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Get geography
    const geographyMap = new Map<string, number>();
    sessions.forEach(session => {
      const country = session.location_country || 'Unknown';
      const count = geographyMap.get(country) || 0;
      geographyMap.set(country, count + 1);
    });

    const totalGeo = Array.from(geographyMap.values()).reduce((a, b) => a + b, 0);
    const geography = Array.from(geographyMap.entries())
      .map(([country, visitors]) => ({
        country,
        visitors,
        percentage: totalGeo > 0 ? (visitors / totalGeo) * 100 : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 10);

    // Format active visitors (only affiliate traffic)
    const activeVisitors = uniqueActiveSessions
      .filter(event => event.session.affiliate_id)
      .map(event => {
        const session = event.session;
        const eventData = event.event_data as any;
        const urlParams = (eventData?.url_params || {}) as Record<string, string>;
        return {
          session_id: session.session_id,
          currentPage: session.pages_visited[session.pages_visited.length - 1] || '/',
          device: session.device_type || 'Unknown',
          location: session.location_country || 'Unknown',
          lastSeen: Number(session.updated_at.getTime()),
          affiliate_id: session.affiliate_id,
          affiliate_number: session.affiliate_number,
          affiliate_name: session.affiliate?.name || 
                         (session.affiliate?.first_name && session.affiliate?.last_name 
                           ? `${session.affiliate.first_name} ${session.affiliate.last_name}` 
                           : `Affiliate #${session.affiliate_number || 'N/A'}`),
          url_params: urlParams, // Add URL parameters
        };
      });

    // Group ACTIVE sessions by affiliate (only sessions with activity in last 5 minutes)
    const affiliateMap = new Map<string, {
      affiliate_id: string;
      affiliate_number: number | null;
      affiliate_name: string;
      sessions: number;
      visitors: Set<string>;
      page_views: number;
      bounce_rate: number;
      avg_session_time: number;
      active_visitors: Array<{
        session_id: string;
        currentPage: string;
        device: string;
        location: string;
        lastSeen: number;
        url_params: Record<string, string>;
      }>;
    }>();

    // Use uniqueActiveSessions instead of all sessions for affiliate grouping
    uniqueActiveSessions.forEach(event => {
      const session = event.session;
      if (!session.affiliate_id) {
        return;
      }
      
      const key = session.affiliate_id;
      const existing = affiliateMap.get(key) || {
        affiliate_id: session.affiliate_id,
        affiliate_number: session.affiliate_number,
        affiliate_name: session.affiliate?.name || 
                       (session.affiliate?.first_name && session.affiliate?.last_name 
                         ? `${session.affiliate.first_name} ${session.affiliate.last_name}` 
                         : `Affiliate #${session.affiliate_number || 'N/A'}`),
        sessions: 0,
        visitors: new Set<string>(),
        page_views: 0,
        bounce_rate: 0,
        avg_session_time: 0,
        active_visitors: [],
      };

      existing.sessions++;
      existing.visitors.add(session.visitor_id);
      existing.page_views += session.page_views;
      existing.avg_session_time += session.total_time || 0;
      
      // Get URL parameters from the event
      const eventData = event.event_data as any;
      const urlParams = (eventData?.url_params || {}) as Record<string, string>;
      
      // Add active visitor info with URL parameters
      existing.active_visitors.push({
        session_id: session.session_id,
        currentPage: session.pages_visited[session.pages_visited.length - 1] || '/',
        device: session.device_type || 'Unknown',
        location: session.location_country || 'Unknown',
        lastSeen: Number(session.updated_at.getTime()),
        url_params: urlParams,
      });
      
      affiliateMap.set(key, existing);
    });

    // Calculate metrics per affiliate (only for active sessions)
    const affiliates = Array.from(affiliateMap.values()).map(aff => {
      const activeSessionsForAffiliate = uniqueActiveSessions.filter(e => 
        e.session.affiliate_id === aff.affiliate_id
      );
      const sessionsWithTime = activeSessionsForAffiliate.filter(e => 
        e.session.total_time
      ).length;
      const bouncedSessions = activeSessionsForAffiliate.filter(e => 
        e.session.is_bounce
      ).length;
      
      return {
        ...aff,
        visitors: aff.visitors.size,
        bounce_rate: aff.sessions > 0 ? (bouncedSessions / aff.sessions) * 100 : 0,
        avg_session_time: sessionsWithTime > 0 
          ? aff.avg_session_time / sessionsWithTime 
          : 0,
      };
    }).sort((a, b) => b.sessions - a.sessions);

    return NextResponse.json({
      metrics: {
        total_visitors: totalVisitors,
        unique_visitors: uniqueVisitors,
        sessions: totalVisitors,
        bounce_rate: bounceRate,
        avg_session_time: avgSessionTime,
        pages_per_session: pagesPerSession,
      },
      activeVisitors,
      topPages,
      entryPages,
      exitPages,
      trafficSources,
      devices,
      browsers,
      geography,
      affiliates, // New: affiliate-organized data
    });
  } catch (error: any) {
    console.error('Analytics stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
