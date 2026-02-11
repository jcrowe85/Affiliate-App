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
    let admin;
    try {
      admin = await getCurrentAdmin();
    } catch (authError: any) {
      console.error('Auth error in analytics stats:', authError);
      return NextResponse.json(
        { error: 'Authentication error: ' + (authError.message || 'Unknown error') },
        { status: 500 }
      );
    }
    
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shopifyShopId = admin.shopify_shop_id;
    const searchParams = request.nextUrl.searchParams;
    const viewMode = searchParams.get('viewMode') || 'realtime'; // Default to realtime
    
    // Only calculate timeRange and startTimeDate for historical mode
    let timeRange = '30d';
    let startTimeDate: Date | null = null;
    
    if (viewMode === 'historical') {
      timeRange = searchParams.get('timeRange') || '30d';
      const timeRangeMs = getTimeRangeMs(timeRange);
      const startTime = Date.now() - timeRangeMs;
      startTimeDate = new Date(startTime);
      
      // Validate date
      if (isNaN(startTimeDate.getTime())) {
        console.error('[Analytics Stats] Invalid startTimeDate:', {
          timeRange,
          timeRangeMs,
          startTime,
          startTimeDate,
        });
        return NextResponse.json(
          { error: `Invalid time range: ${timeRange}` },
          { status: 400 }
        );
      }
    }

    // Determine which sessions to show based on view mode
    type SessionWithAffiliate = Awaited<ReturnType<typeof prisma.visitorSession.findMany>>[0] & {
      affiliate?: {
        id: string;
        affiliate_number: number | null;
        name: string;
        first_name: string | null;
        last_name: string | null;
      } | null;
      affiliate_number?: number | null; // For backward compatibility
    };
    
    type VisitorEvent = Awaited<ReturnType<typeof prisma.visitorEvent.findFirst>>;
    
    let sessionsList: SessionWithAffiliate[];
    let uniqueActiveSessions: Array<{ session: SessionWithAffiliate; event: VisitorEvent | null }>;
    
    if (viewMode === 'realtime') {
      // Real-time mode: Find sessions with recent events (last 30 minutes)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      // First, find sessions that have recent events (this is the real indicator of "active")
      const recentEvents = await prisma.visitorEvent.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          event_type: 'page_view',
          timestamp: {
            gte: thirtyMinutesAgo,
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
      
      // Deduplicate by visitor_session_id (get unique session IDs)
      const activeSessionIds = Array.from(new Set(recentEvents.map(e => e.visitor_session_id)));
      
      console.log('[Analytics Stats] Real-time mode:', {
        recentEventsFound: recentEvents.length,
        activeSessionIds: activeSessionIds.length,
        thirtyMinutesAgo: thirtyMinutesAgo.toISOString(),
      });
      
      // Get sessions for these active session IDs (only affiliate traffic)
      sessionsList = activeSessionIds.length > 0
        ? await prisma.visitorSession.findMany({
            where: {
              id: { in: activeSessionIds },
              shopify_shop_id: shopifyShopId,
              affiliate_id: { not: null }, // Only affiliate traffic
            },
            orderBy: {
              updated_at: 'desc',
            },
            take: 50,
          })
        : [];
      
      // Fetch affiliate data separately since VisitorSession doesn't have affiliate relation
      const affiliateIds = Array.from(new Set(sessionsList.map(s => s.affiliate_id).filter(Boolean)));
      const affiliatesData = affiliateIds.length > 0
        ? await prisma.affiliate.findMany({
            where: {
              id: { in: affiliateIds as string[] },
              shopify_shop_id: shopifyShopId,
            },
            select: {
              id: true,
              affiliate_number: true,
              name: true,
              first_name: true,
              last_name: true,
            },
          })
        : [];
      type AffiliateData = {
        id: string;
        affiliate_number: number | null;
        name: string;
        first_name: string | null;
        last_name: string | null;
      };
      const affiliateMap = new Map<string, AffiliateData>(affiliatesData.map(a => [a.id, a]));
      
      // Add affiliate data to sessions (matching old structure)
      sessionsList = sessionsList.map(session => {
        const affiliate: AffiliateData | null = session.affiliate_id ? affiliateMap.get(session.affiliate_id) || null : null;
        return {
          ...session,
          affiliate,
          affiliate_number: affiliate?.affiliate_number || null, // For backward compatibility
        };
      }) as SessionWithAffiliate[];
      
      // Get the most recent event for each active session to capture URL parameters and current page
      const sessionIds = sessionsList.map(s => s.id);
      
      // Get all recent page_view events for these sessions, ordered by timestamp
      const allRecentEvents = sessionIds.length > 0
        ? await prisma.visitorEvent.findMany({
            where: {
              visitor_session_id: { in: sessionIds },
              event_type: 'page_view',
              timestamp: {
                gte: thirtyMinutesAgo,
              },
            },
            orderBy: {
              timestamp: 'desc',
            },
            take: 1000, // Get enough to find most recent per session
          })
        : [];
      
      // Create a map of visitor_session_id to most recent event (first one encountered is most recent due to ordering)
      const eventMap = new Map<string, typeof allRecentEvents[0]>();
      allRecentEvents.forEach(event => {
        if (!eventMap.has(event.visitor_session_id)) {
          eventMap.set(event.visitor_session_id, event);
        }
      });
      
      // Combine sessions with their most recent events
      uniqueActiveSessions = sessionsList.map(session => {
        const recentEvent = eventMap.get(session.id);
        return {
          session: session,
          event: recentEvent || null,
        };
      });
    } else {
      // Historical mode: Show all sessions within time range
      // First, check if there are any sessions at all (for debugging)
      const allSessionsCount = await prisma.visitorSession.count({
        where: {
          shopify_shop_id: shopifyShopId,
        },
      });
      const affiliateSessionsCount = await prisma.visitorSession.count({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null },
        },
      });
      
      // Test the exact same query we'll use, but as a count
      // Only include start_time filter if startTimeDate is valid
      const timeRangeSessionsCount = await prisma.visitorSession.count({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null },
          ...(startTimeDate && !isNaN(startTimeDate.getTime()) ? {
            start_time: {
              gte: startTimeDate,
            },
          } : {}),
        },
      });
      
      // Also test without the time filter to see if that's the issue
      const affiliateSessionsWithoutTimeFilter = await prisma.visitorSession.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null },
        },
        select: {
          id: true,
          start_time: true,
        },
        take: 10,
        orderBy: {
          start_time: 'desc',
        },
      });
      
      console.log('[Analytics Stats] Pre-query debug:', {
        shopifyShopId,
        startTimeDate: startTimeDate && !isNaN(startTimeDate.getTime()) ? startTimeDate.toISOString() : 'invalid',
        timeRangeSessionsCount,
        affiliateSessionsWithoutTimeFilter: affiliateSessionsWithoutTimeFilter.map(s => ({
          id: s.id,
          start_time: s.start_time && !isNaN(s.start_time.getTime()) ? s.start_time.toISOString() : 'invalid',
          isAfterStartTime: s.start_time && !isNaN(s.start_time.getTime()) && startTimeDate && !isNaN(startTimeDate.getTime()) ? s.start_time >= startTimeDate : false,
        })),
      });
      // Get sample session dates to understand the data
      // First, get sessions that SHOULD match the filter
      const testQuerySessions = await prisma.visitorSession.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null },
          ...(startTimeDate && !isNaN(startTimeDate.getTime()) ? {
            start_time: {
              gte: startTimeDate,
            },
          } : {}),
        },
        select: {
          start_time: true,
          updated_at: true,
          id: true,
        },
        orderBy: {
          start_time: 'desc',
        },
        take: 5,
      });
      
      // Also get recent sessions without the time filter for comparison
      const sampleSessions = await prisma.visitorSession.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null },
        },
        select: {
          start_time: true,
          updated_at: true,
        },
        orderBy: {
          start_time: 'desc',
        },
        take: 5,
      });
      
      const oldestSession = await prisma.visitorSession.findFirst({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null },
        },
        select: {
          start_time: true,
        },
        orderBy: {
          start_time: 'asc',
        },
      });
      
      console.log('[Analytics Stats] Debug counts (historical):', {
        allSessions: allSessionsCount,
        affiliateSessions: affiliateSessionsCount,
        timeRangeAffiliateSessions: timeRangeSessionsCount,
        startTimeDate: startTimeDate && !isNaN(startTimeDate.getTime()) ? startTimeDate.toISOString() : 'invalid',
        timeRange,
        now: new Date().toISOString(),
        testQuerySessions: testQuerySessions.map(s => ({
          id: s.id,
          start_time: s.start_time && !isNaN(s.start_time.getTime()) ? s.start_time.toISOString() : 'invalid',
          updated_at: s.updated_at && !isNaN(s.updated_at.getTime()) ? s.updated_at.toISOString() : 'invalid',
        })),
        sampleRecentSessions: sampleSessions.map(s => ({
          start_time: s.start_time && !isNaN(s.start_time.getTime()) ? s.start_time.toISOString() : 'invalid',
          updated_at: s.updated_at && !isNaN(s.updated_at.getTime()) ? s.updated_at.toISOString() : 'invalid',
        })),
        oldestSession: oldestSession && oldestSession.start_time && !isNaN(oldestSession.start_time.getTime()) 
          ? oldestSession.start_time.toISOString() 
          : 'none',
        dateComparison: {
          sampleStartTime: sampleSessions[0]?.start_time && !isNaN(sampleSessions[0].start_time.getTime())
            ? sampleSessions[0].start_time.toISOString()
            : 'invalid',
          startTimeDate: startTimeDate && !isNaN(startTimeDate.getTime()) ? startTimeDate.toISOString() : 'invalid',
          isSampleAfterStart: sampleSessions[0]?.start_time && !isNaN(sampleSessions[0].start_time.getTime()) && startTimeDate && !isNaN(startTimeDate.getTime())
            ? sampleSessions[0].start_time >= startTimeDate
            : 'N/A',
        },
      });
      
      // Query sessions with time filter
      // Note: Using in-memory filtering as fallback since Prisma date comparison seems to have issues
      sessionsList = await prisma.visitorSession.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null }, // Only affiliate traffic
        },
        orderBy: {
          start_time: 'desc',
        },
        take: 1000,
      });
      
      // Filter in memory by time range (Prisma date filter was excluding valid sessions)
      // Only filter sessions with valid dates
      const filteredSessions = sessionsList.filter(s => {
        if (!s.start_time || isNaN(s.start_time.getTime())) {
          return false; // Skip sessions with invalid dates
        }
        if (!startTimeDate || isNaN(startTimeDate.getTime())) {
          return true; // If startTimeDate is invalid or null, include all sessions
        }
        return s.start_time >= startTimeDate;
      });
      sessionsList = filteredSessions as SessionWithAffiliate[];
      
      console.log('[Analytics Stats] Historical query result:', {
        sessionsFound: sessionsList.length,
        firstSessionStartTime: sessionsList[0]?.start_time && !isNaN(sessionsList[0].start_time.getTime())
          ? sessionsList[0].start_time.toISOString()
          : 'invalid',
        lastSessionStartTime: sessionsList[sessionsList.length - 1]?.start_time && !isNaN(sessionsList[sessionsList.length - 1].start_time.getTime())
          ? sessionsList[sessionsList.length - 1].start_time.toISOString()
          : 'invalid',
        startTimeDate: startTimeDate && !isNaN(startTimeDate.getTime()) ? startTimeDate.toISOString() : 'invalid',
      });
      
      // Fetch affiliate data separately since VisitorSession doesn't have affiliate relation
      const affiliateIds = Array.from(new Set(sessionsList.map(s => s.affiliate_id).filter(Boolean)));
      const affiliatesData = affiliateIds.length > 0
        ? await prisma.affiliate.findMany({
            where: {
              id: { in: affiliateIds as string[] },
              shopify_shop_id: shopifyShopId,
            },
            select: {
              id: true,
              affiliate_number: true,
              name: true,
              first_name: true,
              last_name: true,
            },
          })
        : [];
      type AffiliateData = {
        id: string;
        affiliate_number: number | null;
        name: string;
        first_name: string | null;
        last_name: string | null;
      };
      const affiliateMap = new Map<string, AffiliateData>(affiliatesData.map(a => [a.id, a]));
      
      // Add affiliate data to sessions (matching old structure)
      sessionsList = sessionsList.map(session => {
        const affiliate: AffiliateData | null = session.affiliate_id ? affiliateMap.get(session.affiliate_id) || null : null;
        return {
          ...session,
          affiliate,
          affiliate_number: affiliate?.affiliate_number || null, // For backward compatibility
        };
      }) as SessionWithAffiliate[];
      
      // Get the most recent event for each historical session
      const sessionIds = sessionsList.map(s => s.id);
      
      // Get all page_view events for these sessions (get most recent event per session, regardless of timestamp)
      // For historical mode, we want the most recent event for each session to get current page and URL params
      // Also get events for sessions that might not have affiliate_id set yet (they might have been created before affiliate was set)
      const allHistoricalEvents = sessionIds.length > 0
        ? await prisma.visitorEvent.findMany({
            where: {
              visitor_session_id: { in: sessionIds },
              event_type: 'page_view',
              // Don't filter by timestamp - we want the most recent event for each session
            },
            select: {
              id: true,
              visitor_session_id: true,
              visitor_id: true,
              event_type: true,
              shopify_shop_id: true,
              page_url: true,
              page_path: true,
              page_title: true,
              referrer: true,
              timestamp: true,
              event_data: true,
            },
            orderBy: {
              timestamp: 'desc',
            },
            take: 5000, // Get enough to find most recent per session
          })
        : [];
      
      // Create a map of visitor_session_id to most recent event
      const eventMap = new Map<string, typeof allHistoricalEvents[0]>();
      allHistoricalEvents.forEach(event => {
        if (!eventMap.has(event.visitor_session_id)) {
          eventMap.set(event.visitor_session_id, event);
        }
      });
      
      console.log('[Analytics Stats] Event map stats:', {
        totalEvents: allHistoricalEvents.length,
        uniqueSessionsWithEvents: eventMap.size,
        totalSessions: sessionsList.length,
        sampleEvent: allHistoricalEvents[0] ? {
          visitor_session_id: allHistoricalEvents[0].visitor_session_id,
          event_type: allHistoricalEvents[0].event_type,
          has_event_data: !!allHistoricalEvents[0].event_data,
        } : null,
        sampleSessionId: sessionsList[0]?.id,
        eventMapHasSession: sessionsList[0] ? eventMap.has(sessionsList[0].id) : false,
      });
      
      // Combine sessions with their most recent events
      uniqueActiveSessions = sessionsList.map(session => {
        const recentEvent = eventMap.get(session.id);
        return {
          session: session,
          event: recentEvent || null,
        };
      });
    }

    // Use sessionsList for all metrics calculations (based on viewMode)
    const sessions = sessionsList;

    // Debug: Log session count and affiliate IDs
    console.log('[Analytics Stats] Sessions found:', sessions.length);
    console.log('[Analytics Stats] Sessions with affiliate_id:', sessions.filter(s => s.affiliate_id).length);
    console.log('[Analytics Stats] Sample affiliate_ids:', sessions.slice(0, 5).map(s => s.affiliate_id));

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
      const entryPage = session.entry_page || '/';
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
        const exitPage = session.exit_page || '/';
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
    // Use the most recent event's page_path as the current page (always up-to-date)
    const activeVisitors = uniqueActiveSessions
      .filter(item => item.session.affiliate_id)
      .map(item => {
        const session = item.session;
        const event = item.event;
        // Get URL parameters from multiple sources (in order of preference):
        // 1. session.url_params (persistent from initial visit - PRIMARY SOURCE)
        // 2. event.event_data.url_params (if tracking script sends it)
        // 3. event.page_url query string (fallback)
        // 4. session.landing_page query string (fallback)
        
        // Start with session.url_params (this is the main source, like the old system)
        let sessionUrlParams: Record<string, string> = {};
        if ((session as any).url_params) {
          try {
            const urlParamsData = (session as any).url_params;
            if (urlParamsData && typeof urlParamsData === 'object') {
              sessionUrlParams = urlParamsData as Record<string, string>;
            }
          } catch (e) {
            // Ignore if not an object
          }
        }
        
        const eventData = event?.event_data as any;
        let eventUrlParams = (eventData?.url_params || {}) as Record<string, string>;
        
        // Extract from event.page_url if event_data.url_params is empty
        if (Object.keys(eventUrlParams).length === 0 && event?.page_url) {
          try {
            const url = new URL(event.page_url);
            const params = Object.fromEntries(url.searchParams.entries());
            eventUrlParams = params;
          } catch (e) {
            // If URL parsing fails, try simple string extraction
            if (event.page_url.includes('?')) {
              const queryString = event.page_url.substring(event.page_url.indexOf('?') + 1);
              queryString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                if (key) eventUrlParams[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
              });
            }
          }
        }
        
        // Extract URL params from landing_page if available (fallback)
        if (Object.keys(sessionUrlParams).length === 0 && session.landing_page?.includes('?')) {
          try {
            const url = new URL(session.landing_page, 'https://example.com');
            const params = Object.fromEntries(url.searchParams.entries());
            sessionUrlParams = params;
          } catch (e) {
            // If URL parsing fails, try simple string extraction
            if (session.landing_page.includes('?')) {
              const queryString = session.landing_page.substring(session.landing_page.indexOf('?') + 1);
              queryString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                if (key) sessionUrlParams[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
              });
            }
          }
        }
        
        // Merge: event params take precedence, but session params persist if event doesn't have them
        const urlParams = { ...sessionUrlParams, ...eventUrlParams };
        
        // Ensure url_params is always an object (even if empty)
        const finalUrlParams = urlParams && typeof urlParams === 'object' && Object.keys(urlParams).length > 0 ? urlParams : {};
        
        // Use the most recent event's page_path, or fall back to last page in pages_visited
        const currentPage = event?.page_path || session.pages_visited?.[session.pages_visited.length - 1] || '/';
        return {
          session_id: session.session_id,
          currentPage: currentPage,
          device: session.device_type || 'Unknown',
          location: session.location_country || 'Unknown',
          lastSeen: session.updated_at && !isNaN(session.updated_at.getTime()) 
            ? Number(session.updated_at.getTime()) 
            : Date.now(),
          affiliate_id: session.affiliate_id,
          affiliate_number: session.affiliate_number || session.affiliate?.affiliate_number || null,
          affiliate_name: session.affiliate?.name || 
                         (session.affiliate?.first_name && session.affiliate?.last_name 
                           ? `${session.affiliate.first_name} ${session.affiliate.last_name}` 
                           : `Affiliate #${session.affiliate_number || session.affiliate?.affiliate_number || 'N/A'}`),
          url_params: finalUrlParams, // Always include url_params, even if empty
        };
      });

    // Group ACTIVE sessions by affiliate (sessions updated in last 30 minutes)
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

    console.log(`[Analytics Stats] Processing ${uniqueActiveSessions.length} sessions for affiliate grouping`);
    
    // Use uniqueActiveSessions instead of all sessions for affiliate grouping
    uniqueActiveSessions.forEach(item => {
      const session = item.session;
      const event = item.event;
      if (!session.affiliate_id) {
        return;
      }
      
      const key = session.affiliate_id;
      const existing = affiliateMap.get(key) || {
        affiliate_id: session.affiliate_id,
        affiliate_number: session.affiliate_number || session.affiliate?.affiliate_number || null,
        affiliate_name: session.affiliate?.name || 
                       (session.affiliate?.first_name && session.affiliate?.last_name 
                         ? `${session.affiliate.first_name} ${session.affiliate.last_name}` 
                         : `Affiliate #${session.affiliate_number || session.affiliate?.affiliate_number || 'N/A'}`),
        sessions: 0,
        visitors: new Set<string>(),
        page_views: 0,
        bounce_rate: 0,
        avg_session_time: 0,
        active_visitors: [],
      };

      existing.sessions++;
      existing.visitors.add(session.visitor_id);
      existing.page_views += session.page_views || 0;
      existing.avg_session_time += session.total_time || 0;
      
      // Get URL parameters from multiple sources (in order of preference):
      // 1. session.url_params (persistent from initial visit - PRIMARY SOURCE)
      // 2. event.event_data.url_params (if tracking script sends it)
      // 3. event.page_url query string (fallback)
      // 4. session.landing_page query string (fallback)
      
      // Start with session.url_params (this is the main source, like the old system)
      let sessionUrlParams: Record<string, string> = {};
      if ((session as any).url_params) {
        try {
          const urlParamsData = (session as any).url_params;
          if (urlParamsData && typeof urlParamsData === 'object') {
            sessionUrlParams = urlParamsData as Record<string, string>;
          }
        } catch (e) {
          // Ignore if not an object
        }
      }
      
      const eventData = event?.event_data as any;
      let eventUrlParams = (eventData?.url_params || {}) as Record<string, string>;
      
      // Extract from event.page_url if event_data.url_params is empty
      if (Object.keys(eventUrlParams).length === 0 && event?.page_url) {
        try {
          const url = new URL(event.page_url);
          const params = Object.fromEntries(url.searchParams.entries());
          eventUrlParams = params;
        } catch (e) {
          // If URL parsing fails, try simple string extraction
          if (event.page_url.includes('?')) {
            const queryString = event.page_url.substring(event.page_url.indexOf('?') + 1);
            queryString.split('&').forEach(param => {
              const [key, value] = param.split('=');
              if (key) eventUrlParams[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
            });
          }
        }
      }
      
      // Extract URL params from landing_page if available (fallback)
      if (Object.keys(sessionUrlParams).length === 0 && session.landing_page?.includes('?')) {
        try {
          const url = new URL(session.landing_page, 'https://example.com');
          const params = Object.fromEntries(url.searchParams.entries());
          sessionUrlParams = params;
        } catch (e) {
          // If URL parsing fails, try simple string extraction
          if (session.landing_page.includes('?')) {
            const queryString = session.landing_page.substring(session.landing_page.indexOf('?') + 1);
            queryString.split('&').forEach(param => {
              const [key, value] = param.split('=');
              if (key) sessionUrlParams[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
            });
          }
        }
      }
      
      // Merge: event params take precedence, but session params persist if event doesn't have them
      const urlParams = { ...sessionUrlParams, ...eventUrlParams };
      
      // Debug: Log URL params extraction for first few sessions
      if (existing.active_visitors.length < 3) {
        console.log('[Analytics Stats] URL params extraction:', {
          session_id: session.session_id,
          landing_page: session.landing_page,
          sessionUrlParams,
          eventUrlParams,
          mergedUrlParams: urlParams,
          hasEvent: !!event,
          eventPageUrl: event?.page_url?.substring(0, 150),
          eventData: event?.event_data,
          urlParamsKeys: Object.keys(urlParams),
          urlParamsCount: Object.keys(urlParams).length,
        });
      }
      
      // Add active visitor info with URL parameters
      // Use the most recent event's page_path as the current page (always up-to-date)
      const currentPage = event?.page_path || session.pages_visited?.[session.pages_visited.length - 1] || '/';
      
      // Ensure url_params is always an object (even if empty)
      const finalUrlParams = urlParams && typeof urlParams === 'object' ? urlParams : {};
      
      existing.active_visitors.push({
        session_id: session.session_id,
        currentPage: currentPage,
        device: session.device_type || 'Unknown',
        location: session.location_country || 'Unknown',
        lastSeen: session.updated_at && !isNaN(session.updated_at.getTime()) 
          ? Number(session.updated_at.getTime()) 
          : Date.now(),
        url_params: finalUrlParams, // Always include url_params, even if empty
      });
      
      affiliateMap.set(key, existing);
    });

    // Calculate metrics per affiliate (only for active sessions)
    console.log(`[Analytics Stats] Found ${affiliateMap.size} unique affiliates with active sessions`);
    const affiliates = Array.from(affiliateMap.values()).map(aff => {
      const activeSessionsForAffiliate = uniqueActiveSessions.filter(item => 
        item.session.affiliate_id === aff.affiliate_id
      );
      const sessionsWithTime = activeSessionsForAffiliate.filter(item => 
        item.session.total_time
      ).length;
      const bouncedSessions = activeSessionsForAffiliate.filter(item => 
        item.session.is_bounce
      ).length;
      
      const result = {
        ...aff,
        visitors: aff.visitors.size,
        bounce_rate: aff.sessions > 0 ? (bouncedSessions / aff.sessions) * 100 : 0,
        avg_session_time: sessionsWithTime > 0 
          ? aff.avg_session_time / sessionsWithTime 
          : 0,
        // Ensure active_visitors is preserved (it should be from ...aff spread, but being explicit)
        active_visitors: aff.active_visitors || [],
      };
      
      // Debug: Log first affiliate's active_visitors to verify URL params are included
      if (aff.affiliate_id === Array.from(affiliateMap.keys())[0]) {
        console.log('[Analytics Stats] Sample affiliate active_visitors:', {
          affiliate_id: aff.affiliate_id,
          affiliate_name: aff.affiliate_name,
          active_visitors_count: result.active_visitors.length,
          first_visitor: result.active_visitors[0] ? {
            session_id: result.active_visitors[0].session_id,
            currentPage: result.active_visitors[0].currentPage,
            has_url_params: !!result.active_visitors[0].url_params,
            url_params_keys: result.active_visitors[0].url_params ? Object.keys(result.active_visitors[0].url_params) : [],
            url_params: result.active_visitors[0].url_params,
          } : null,
        });
      }
      
      return result;
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
      viewMode, // Include view mode in response
    });
  } catch (error: any) {
    console.error('Analytics stats error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error details:', {
      message: error?.message,
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json(
      { 
        error: error?.message || 'Failed to fetch stats',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
