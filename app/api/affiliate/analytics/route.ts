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
 * Get affiliate analytics statistics
 * SECURITY: Only returns data for the logged-in affiliate
 */
export async function GET(request: NextRequest) {
  try {
    const affiliate = await getCurrentAffiliate();
    if (!affiliate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: Always filter by affiliate_id
    const affiliateId = affiliate.id;
    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get('timeRange') || '24h';
    const viewMode = searchParams.get('viewMode') || 'realtime';
    const startTime = Date.now() - getTimeRangeMs(timeRange);
    const startTimeBigInt = BigInt(startTime);

    let sessionsList;

    if (viewMode === 'realtime') {
      // Real-time mode: Only show currently active sessions (updated in last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      sessionsList = await prisma.visitorSession.findMany({
        where: {
          affiliate_id: affiliateId, // SECURITY: Filter by affiliate_id
          updated_at: {
            gte: fiveMinutesAgo,
          },
        },
        orderBy: {
          updated_at: 'desc',
        },
        take: 50,
      });
    } else {
      // Historical mode: Show all sessions within time range
      sessionsList = await prisma.visitorSession.findMany({
        where: {
          affiliate_id: affiliateId, // SECURITY: Filter by affiliate_id
          start_time: {
            gte: startTimeBigInt,
          },
        },
        orderBy: {
          start_time: 'desc',
        },
      });
    }

    // Calculate metrics (same as admin analytics but filtered by affiliate)
    const totalVisitors = sessionsList.length;
    const uniqueVisitors = new Set(sessionsList.map(s => s.visitor_id)).size;
    const totalPageViews = sessionsList.reduce((sum, s) => sum + s.page_views, 0);
    const bouncedSessions = sessionsList.filter(s => s.is_bounce).length;
    const bounceRate = totalVisitors > 0 ? (bouncedSessions / totalVisitors) * 100 : 0;
    
    const totalSessionTime = sessionsList
      .filter(s => s.total_time)
      .reduce((sum, s) => sum + (s.total_time || 0), 0);
    const sessionsWithTime = sessionsList.filter(s => s.total_time).length;
    const avgSessionTime = sessionsWithTime > 0 ? totalSessionTime / sessionsWithTime : 0;
    
    const totalPages = sessionsList.reduce((sum, s) => sum + s.pages_visited.length, 0);
    const pagesPerSession = totalVisitors > 0 ? totalPages / totalVisitors : 0;

    // Get top pages
    const pageViewsMap = new Map<string, { views: number; bounces: number }>();
    sessionsList.forEach(session => {
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

    // Get entry pages (first page in each session)
    const entryPagesMap = new Map<string, number>();
    sessionsList.forEach(session => {
      if (session.pages_visited.length > 0) {
        const entryPage = session.pages_visited[0];
        entryPagesMap.set(entryPage, (entryPagesMap.get(entryPage) || 0) + 1);
      }
    });

    const entryPages = Array.from(entryPagesMap.entries())
      .map(([path, entries]) => ({
        path,
        url: path,
        entries,
      }))
      .sort((a, b) => b.entries - a.entries)
      .slice(0, 10);

    // Get exit pages (last page in each session)
    const exitPagesMap = new Map<string, number>();
    sessionsList.forEach(session => {
      if (session.pages_visited.length > 0) {
        const exitPage = session.pages_visited[session.pages_visited.length - 1];
        exitPagesMap.set(exitPage, (exitPagesMap.get(exitPage) || 0) + 1);
      }
    });

    const exitPages = Array.from(exitPagesMap.entries())
      .map(([path, exits]) => ({
        path,
        url: path,
        exits,
      }))
      .sort((a, b) => b.exits - a.exits)
      .slice(0, 10);

    // Get traffic sources (from referrer or URL params)
    const trafficSourcesMap = new Map<string, number>();
    sessionsList.forEach(session => {
      let source = 'Direct';
      if (session.referrer_domain) {
        source = session.referrer_domain;
      } else if (session.referrer_url) {
        try {
          source = new URL(session.referrer_url).hostname;
        } catch {
          source = 'Direct';
        }
      }
      trafficSourcesMap.set(source, (trafficSourcesMap.get(source) || 0) + 1);
    });

    const totalTraffic = Array.from(trafficSourcesMap.values()).reduce((a, b) => a + b, 0);
    const trafficSources = Array.from(trafficSourcesMap.entries())
      .map(([source, visitors]) => ({
        source,
        visitors,
        percentage: totalTraffic > 0 ? (visitors / totalTraffic) * 100 : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors);

    // Get devices
    const devicesMap = new Map<string, number>();
    sessionsList.forEach(session => {
      const device = session.device_type || 'Unknown';
      devicesMap.set(device, (devicesMap.get(device) || 0) + 1);
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
    sessionsList.forEach(session => {
      if (session.user_agent) {
        let browser = 'Unknown';
        if (session.user_agent.includes('Chrome')) browser = 'Chrome';
        else if (session.user_agent.includes('Safari') && !session.user_agent.includes('Chrome')) browser = 'Safari';
        else if (session.user_agent.includes('Firefox')) browser = 'Firefox';
        else if (session.user_agent.includes('Edge')) browser = 'Edge';
        else if (session.user_agent.includes('Opera')) browser = 'Opera';
        
        browsersMap.set(browser, (browsersMap.get(browser) || 0) + 1);
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
    sessionsList.forEach(session => {
      const country = session.location_country || 'Unknown';
      geographyMap.set(country, (geographyMap.get(country) || 0) + 1);
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

    // Format active visitors
    const activeVisitors = sessionsList
      .filter(s => viewMode === 'realtime' || (Date.now() - Number(s.updated_at.getTime()) < 5 * 60 * 1000))
      .map(session => {
        const urlParams = (session.url_params as Record<string, string>) || {};
        return {
          session_id: session.session_id,
          currentPage: session.pages_visited[session.pages_visited.length - 1] || '/',
          device: session.device_type || 'Unknown',
          location: session.location_country || 'Unknown',
          lastSeen: Number(session.updated_at.getTime()),
          url_params: urlParams,
        };
      });

    // Format as affiliates array (single affiliate for affiliate view)
    const affiliateName = affiliate.name || `Affiliate #${affiliate.affiliate_number || 'N/A'}`;

    const affiliates = [{
      affiliate_id: affiliate.id,
      affiliate_number: affiliate.affiliate_number,
      affiliate_name: affiliateName,
      sessions: totalVisitors,
      visitors: uniqueVisitors,
      page_views: totalPageViews,
      bounce_rate: bounceRate,
      avg_session_time: avgSessionTime,
      active_visitors: activeVisitors,
    }];

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
      affiliates,
      viewMode,
    });
  } catch (error: any) {
    console.error('Affiliate analytics error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
