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
    const startTime = new Date(Date.now() - getTimeRangeMs(timeRange));

    // Get all sessions in time range
    const sessions = await prisma.visitorSession.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        start_time: {
          gte: startTime,
        },
      },
    });

    // Get active visitors (sessions with activity in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentEvents = await prisma.visitorEvent.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        timestamp: {
          gte: fiveMinutesAgo,
        },
      },
      include: {
        session: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 1000, // Get more events to ensure we have unique sessions
    });

    // Get unique sessions by visitor_session_id
    const uniqueSessionIds = new Set<string>();
    const activeSessions: typeof recentEvents = [];
    for (const event of recentEvents) {
      if (!uniqueSessionIds.has(event.visitor_session_id) && activeSessions.length < 50) {
        uniqueSessionIds.add(event.visitor_session_id);
        activeSessions.push(event);
      }
    }

    // Calculate metrics
    const totalVisitors = sessions.length;
    const uniqueVisitors = new Set(sessions.map(s => s.visitor_id)).size;
    const totalPageViews = sessions.reduce((sum, s) => sum + (s.page_views || 0), 0);
    const bouncedSessions = sessions.filter(s => s.is_bounce).length;
    const bounceRate = totalVisitors > 0 ? (bouncedSessions / totalVisitors) * 100 : 0;
    
    const totalSessionTime = sessions
      .filter(s => s.total_time)
      .reduce((sum, s) => sum + (s.total_time || 0), 0);
    const sessionsWithTime = sessions.filter(s => s.total_time).length;
    const avgSessionTime = sessionsWithTime > 0 ? totalSessionTime / sessionsWithTime : 0;
    
    const totalPages = sessions.reduce((sum, s) => sum + (s.pages_visited?.length || 0), 0);
    const pagesPerSession = totalVisitors > 0 ? totalPages / totalVisitors : 0;

    // Get top pages
    const pageViewsMap = new Map<string, { views: number; bounces: number }>();
    sessions.forEach(session => {
      (session.pages_visited || []).forEach(path => {
        const current = pageViewsMap.get(path) || { views: 0, bounces: 0 };
        current.views++;
        if (session.is_bounce && (session.pages_visited?.length || 0) === 1) {
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
      const entryPage: string = session.entry_page || '/';
      const count = entryPagesMap.get(entryPage) || 0;
      entryPagesMap.set(entryPage, count + 1);
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
        const exitPage: string = session.exit_page || '/';
        const count = exitPagesMap.get(exitPage) || 0;
        exitPagesMap.set(exitPage, count + 1);
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
      const device = session.device_type || 'unknown';
      const count = devicesMap.get(device) || 0;
      devicesMap.set(device, count + 1);
    });

    const devices = Array.from(devicesMap.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get browsers (from user_agent if available, otherwise 'unknown')
    const browsersMap = new Map<string, number>();
    sessions.forEach(session => {
      let browser = 'unknown';
      if (session.user_agent) {
        if (session.user_agent.includes('Chrome') && !session.user_agent.includes('Edg')) browser = 'Chrome';
        else if (session.user_agent.includes('Firefox')) browser = 'Firefox';
        else if (session.user_agent.includes('Safari') && !session.user_agent.includes('Chrome')) browser = 'Safari';
        else if (session.user_agent.includes('Edg')) browser = 'Edge';
      }
      const count = browsersMap.get(browser) || 0;
      browsersMap.set(browser, count + 1);
    });

    const browsers = Array.from(browsersMap.entries())
      .map(([browser, count]) => ({ browser, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get geography
    const geographyMap = new Map<string, number>();
    sessions.forEach(session => {
      const country = session.location_country || 'unknown';
      const count = geographyMap.get(country) || 0;
      geographyMap.set(country, count + 1);
    });

    const geography = Array.from(geographyMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      metrics: {
        total_visitors: totalVisitors,
        unique_visitors: uniqueVisitors,
        active_visitors: activeSessions.length,
        total_page_views: totalPageViews,
        bounce_rate: bounceRate,
        avg_session_time: avgSessionTime,
        pages_per_session: pagesPerSession,
      },
      topPages,
      entryPages,
      exitPages,
      trafficSources,
      devices,
      browsers,
      geography,
      affiliates: [], // This would need to be populated if needed
    });
  } catch (error: any) {
    console.error('Error fetching analytics stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics stats' },
      { status: 500 }
    );
  }
}
