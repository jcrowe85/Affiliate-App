import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Helper function to safely convert dates to ISO strings
function safeToISOString(date: any): string {
  if (!date) return 'invalid';
  try {
    // Prisma returns Date objects, but handle both Date and string/other formats
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
      // Try to see what we actually got
      console.warn('[safeToISOString] Invalid date:', { date, type: typeof date, value: date });
      return 'invalid';
    }
    return d.toISOString();
  } catch (e) {
    console.warn('[safeToISOString] Error converting date:', { date, type: typeof date, error: e });
    return 'invalid';
  }
}

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
      const now = Date.now();
      const startTime = now - timeRangeMs;
      startTimeDate = new Date(startTime);
      
      // Log time range calculation for debugging
      console.log('[Analytics Stats] Time range calculation:', {
        timeRange,
        timeRangeMs,
        now: new Date(now).toISOString(),
        startTime: new Date(startTime).toISOString(),
        startTimeDate: startTimeDate.toISOString(),
        daysAgo: timeRangeMs / (24 * 60 * 60 * 1000),
      });
      
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
      // Real-time mode: Find sessions with recent activity (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      // First, find sessions that have recent events (this is the real indicator of "active")
      const recentEvents = await prisma.visitorEvent.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
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
      
      // Deduplicate by visitor_session_id (get unique session IDs)
      const activeSessionIds = Array.from(new Set(recentEvents.map(e => e.visitor_session_id)));
      
      console.log('[Analytics Stats] Real-time mode:', {
        recentEventsFound: recentEvents.length,
        activeSessionIds: activeSessionIds.length,
        fiveMinutesAgo: fiveMinutesAgo.toISOString(),
        shopifyShopId,
      });
      
      // Get sessions for these active session IDs (only affiliate traffic)
      // Also filter by updated_at to ensure sessions are truly active (within last 5 minutes)
      sessionsList = activeSessionIds.length > 0
        ? await prisma.visitorSession.findMany({
            where: {
              id: { in: activeSessionIds },
              shopify_shop_id: shopifyShopId,
              affiliate_id: { not: null }, // Only affiliate traffic
              updated_at: {
                gte: fiveMinutesAgo, // Only sessions updated in last 5 minutes
              },
            },
            orderBy: {
              updated_at: 'desc',
            },
            take: 50,
          })
        : [];
      
      console.log('[Analytics Stats] Real-time mode - Sessions found:', {
        activeSessionIdsCount: activeSessionIds.length,
        sessionsListCount: sessionsList.length,
        sessionsWithAffiliateId: sessionsList.filter(s => s.affiliate_id).length,
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
      
      // Get the most recent event for each active session to capture URL parameters and current page
      const sessionIds = sessionsList.map(s => s.id);
      
      // Get all recent page_view events for these sessions, ordered by timestamp
      // Only get events from the last 5 minutes to match the active session filter
      const allRecentEvents = sessionIds.length > 0
        ? await prisma.visitorEvent.findMany({
            where: {
              visitor_session_id: { in: sessionIds },
              event_type: 'page_view',
              timestamp: {
                gte: fiveMinutesAgo,
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
          start_time: safeToISOString(s.start_time),
          isAfterStartTime: s.start_time && !isNaN(new Date(s.start_time).getTime()) && startTimeDate && !isNaN(startTimeDate.getTime()) ? new Date(s.start_time) >= startTimeDate : false,
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
          start_time: safeToISOString(s.start_time),
          updated_at: safeToISOString(s.updated_at),
        })),
        sampleRecentSessions: sampleSessions.map(s => ({
          start_time: safeToISOString(s.start_time),
          updated_at: safeToISOString(s.updated_at),
        })),
        oldestSession: safeToISOString(oldestSession?.start_time) || 'none',
        dateComparison: {
          sampleStartTime: safeToISOString(sampleSessions[0]?.start_time),
          startTimeDate: startTimeDate && !isNaN(startTimeDate.getTime()) ? startTimeDate.toISOString() : 'invalid',
          isSampleAfterStart: sampleSessions[0]?.start_time && !isNaN(sampleSessions[0].start_time.getTime()) && startTimeDate && !isNaN(startTimeDate.getTime())
            ? sampleSessions[0].start_time >= startTimeDate
            : 'N/A',
        },
      });
      
      // Query sessions with time filter
      // For historical mode, we need to get ALL sessions within the time range
      // Use Prisma date filter if possible, but also do in-memory filtering as fallback
      // Note: We use start_time to match when the session was created/started
      const whereClause: any = {
        shopify_shop_id: shopifyShopId,
        affiliate_id: { not: null }, // Only affiliate traffic
      };
      
      // Add date filter to Prisma query if we have a valid startTimeDate
      // Use start_time for historical queries (when session started)
      // This matches how real-time works - it uses updated_at for recent activity
      if (startTimeDate && !isNaN(startTimeDate.getTime())) {
        whereClause.start_time = {
          gte: startTimeDate,
        };
      }
      
      // First, let's check how many total sessions exist (for debugging)
      const totalSessionsCount = await prisma.visitorSession.count({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null },
        },
      });
      
      const sessionsWithTimeFilterCount = await prisma.visitorSession.count({
        where: whereClause,
      });
      
      // Also check how many sessions exist without affiliate filter
      const totalSessionsAny = await prisma.visitorSession.count({
        where: {
          shopify_shop_id: shopifyShopId,
        },
      });
      
      // Check sessions in the last 30 days without affiliate filter
      const sessionsLast30Days = await prisma.visitorSession.count({
        where: {
          shopify_shop_id: shopifyShopId,
          start_time: {
            gte: startTimeDate && !isNaN(startTimeDate.getTime()) ? startTimeDate : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      });
      
      console.log('[Analytics Stats] Historical mode - Session counts:', {
        totalSessionsAny: totalSessionsAny,
        totalSessionsWithAffiliate: totalSessionsCount,
        sessionsLast30DaysAny: sessionsLast30Days,
        sessionsWithTimeFilter: sessionsWithTimeFilterCount,
        startTimeDate: startTimeDate && !isNaN(startTimeDate.getTime()) ? startTimeDate.toISOString() : 'invalid',
        timeRange,
        now: new Date().toISOString(),
        shopifyShopId,
      });
      
      console.log('[Analytics Stats] Historical query whereClause:', {
        shopify_shop_id: shopifyShopId,
        timeRange,
        timeRangeMs: getTimeRangeMs(timeRange),
        calculatedStartTime: startTimeDate ? startTimeDate.toISOString() : null,
        now: new Date().toISOString(),
        hasAffiliateFilter: true,
        hasTimeFilter: !!(startTimeDate && !isNaN(startTimeDate.getTime())),
        startTimeDate: startTimeDate ? startTimeDate.toISOString() : null,
        whereClause: JSON.stringify(whereClause, null, 2),
      });

      sessionsList = await prisma.visitorSession.findMany({
        where: whereClause,
        orderBy: {
          start_time: 'desc',
        },
        take: 10000, // Increased limit for historical data
      });
      
      console.log('[Analytics Stats] Prisma query returned:', {
        count: sessionsList.length,
        firstSession: sessionsList[0] ? {
          id: sessionsList[0].id,
          affiliate_id: sessionsList[0].affiliate_id,
          start_time: sessionsList[0].start_time,
          start_time_type: typeof sessionsList[0].start_time,
          start_time_instanceof: sessionsList[0].start_time instanceof Date,
          start_time_value: sessionsList[0].start_time ? String(sessionsList[0].start_time) : null,
        } : null,
      });
      
      // Check if sessions exist without affiliate filter (for debugging)
      const sessionsWithoutAffiliateFilter = await prisma.visitorSession.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          ...(startTimeDate && !isNaN(startTimeDate.getTime()) ? {
            start_time: {
              gte: startTimeDate,
            },
          } : {}),
        },
        select: {
          id: true,
          affiliate_id: true,
          start_time: true,
          updated_at: true,
        },
        take: 5,
        orderBy: {
          start_time: 'desc',
        },
      });
      
      // Debug: Check what Prisma actually returned
      const sampleSessionRaw = sessionsList[0];
      console.log('[Analytics Stats] Historical mode - Raw query result:', {
        sessionsReturned: sessionsList.length,
        sessionsWithoutAffiliateFilter: sessionsWithoutAffiliateFilter.length,
        sampleSessionRaw: sampleSessionRaw ? {
          id: sampleSessionRaw.id,
          affiliate_id: sampleSessionRaw.affiliate_id,
          start_time_raw: sampleSessionRaw.start_time,
          start_time_type: typeof sampleSessionRaw.start_time,
          start_time_isDate: sampleSessionRaw.start_time instanceof Date,
          start_time_value: sampleSessionRaw.start_time ? String(sampleSessionRaw.start_time) : null,
          updated_at_raw: sampleSessionRaw.updated_at,
          updated_at_type: typeof sampleSessionRaw.updated_at,
        } : null,
        sampleSession: sessionsList[0] ? {
          id: sessionsList[0].id,
          affiliate_id: sessionsList[0].affiliate_id,
          start_time: safeToISOString(sessionsList[0].start_time),
          updated_at: safeToISOString(sessionsList[0].updated_at),
        } : null,
        sampleSessionsWithoutFilter: sessionsWithoutAffiliateFilter.slice(0, 3).map(s => ({
          id: s.id,
          affiliate_id: s.affiliate_id,
          hasAffiliateId: !!s.affiliate_id,
          start_time: safeToISOString(s.start_time),
          start_time_raw: s.start_time,
          start_time_type: typeof s.start_time,
        })),
      });
      
      // Prisma already filtered by start_time >= startTimeDate at the database level
      // So we can trust that all returned sessions are within the time range
      // However, if start_time is invalid, we can use updated_at as a fallback for display purposes
      // But we should still include the session since Prisma's query already validated the date
      
      // For historical mode, Prisma's database-level filtering is sufficient
      // We only need to ensure we have affiliate_id (which Prisma already filtered for)
      // All sessions returned by Prisma are valid for our time range
      
      // Debug: Check a few sample sessions to understand the date issue
      // Use Prisma's regular query instead of raw SQL to avoid type issues
      const sampleSessionsForDateCheck = await prisma.visitorSession.findMany({
        where: {
          shopify_shop_id: shopifyShopId,
          affiliate_id: { not: null },
          ...(startTimeDate && !isNaN(startTimeDate.getTime()) ? {
            start_time: { gte: startTimeDate }
          } : {}),
        },
        select: {
          id: true,
          start_time: true,
          updated_at: true,
        },
        take: 3,
        orderBy: { start_time: 'desc' },
      });
      
      console.log('[Analytics Stats] Sample sessions date check:', {
        timeRange,
        startTimeDate: startTimeDate ? startTimeDate.toISOString() : 'null',
        sampleCount: sampleSessionsForDateCheck.length,
        samples: sampleSessionsForDateCheck.map(s => ({
          id: s.id,
          start_time_instanceof: s.start_time instanceof Date,
          start_time_isValid: s.start_time instanceof Date && !isNaN(s.start_time.getTime()),
          start_time_value: s.start_time instanceof Date ? s.start_time.toISOString() : String(s.start_time),
          updated_at_value: s.updated_at instanceof Date ? s.updated_at.toISOString() : String(s.updated_at),
        })),
      });
      
      console.log('[Analytics Stats] Using Prisma-filtered sessions (no additional date filtering needed):', {
        totalSessions: sessionsList.length,
        sessionsWithAffiliateId: sessionsList.filter(s => s.affiliate_id).length,
        startTimeDate: startTimeDate ? startTimeDate.toISOString() : 'null',
        note: 'Prisma already filtered by start_time >= startTimeDate at database level',
      });
      
      // Keep all sessions - Prisma already filtered them correctly
      // sessionsList is already filtered by Prisma, no need to filter again
      
      console.log('[Analytics Stats] Historical query result:', {
        sessionsFound: sessionsList.length,
        filteredSessionsCount: sessionsList.length, // Prisma already filtered, so all sessions are valid
        firstSessionStartTime: safeToISOString(sessionsList[0]?.start_time),
        lastSessionStartTime: safeToISOString(sessionsList[sessionsList.length - 1]?.start_time),
        startTimeDate: startTimeDate && !isNaN(startTimeDate.getTime()) ? startTimeDate.toISOString() : 'invalid',
        timeRange,
        sessionsWithAffiliateId: sessionsList.filter(s => s.affiliate_id).length,
        sampleAffiliateIds: Array.from(new Set(sessionsList.map(s => s.affiliate_id).filter(Boolean))).slice(0, 5),
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
      
      // Debug: Check what's actually in the events and sessions
      const sampleEvent = allHistoricalEvents[0];
      const sampleSession = sessionsList[0];
      console.log('[Analytics Stats] Event map stats:', {
        totalEvents: allHistoricalEvents.length,
        uniqueSessionsWithEvents: eventMap.size,
        totalSessions: sessionsList.length,
        sampleEvent: sampleEvent ? {
          visitor_session_id: sampleEvent.visitor_session_id,
          event_type: sampleEvent.event_type,
          has_event_data: !!sampleEvent.event_data,
          page_url: sampleEvent.page_url,
          page_url_has_query: sampleEvent.page_url?.includes('?'),
          event_data_url_params: (sampleEvent.event_data as any)?.url_params,
        } : null,
        sampleSession: sampleSession ? {
          id: sampleSession.id,
          session_id: sampleSession.session_id,
          landing_page: sampleSession.landing_page,
          landing_page_has_query: sampleSession.landing_page?.includes('?'),
          url_params: (sampleSession as any).url_params,
        } : null,
        eventMapHasSession: sampleSession ? eventMap.has(sampleSession.id) : false,
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
    console.log('[Analytics Stats] Final sessions for metrics:', {
      viewMode,
      sessionsCount: sessions.length,
      sessionsWithAffiliateId: sessions.filter(s => s.affiliate_id).length,
      sampleAffiliateIds: sessions.slice(0, 5).map(s => s.affiliate_id),
      sampleSessions: sessions.slice(0, 3).map(s => ({
        id: s.id,
        affiliate_id: s.affiliate_id,
        start_time: safeToISOString(s.start_time),
        updated_at: safeToISOString(s.updated_at),
      })),
    });

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
            if (urlParamsData && typeof urlParamsData === 'object' && !Array.isArray(urlParamsData)) {
              sessionUrlParams = urlParamsData as Record<string, string>;
            }
          } catch (e) {
            console.warn('[Analytics Stats] Error parsing session.url_params:', e);
          }
        }
        
        const eventData = event?.event_data as any;
        let eventUrlParams = (eventData?.url_params || {}) as Record<string, string>;
        
        // Extract from event.page_url - ALWAYS try this if page_url exists and has query params
        // This is the most reliable source for historical data
        if (event?.page_url && event.page_url.trim() !== '') {
          const pageUrlHasQuery = event.page_url.includes('?');
          if (pageUrlHasQuery || Object.keys(eventUrlParams).length === 0) {
            try {
              // Try parsing as absolute URL first
              let url: URL;
              try {
                url = new URL(event.page_url);
              } catch (e) {
                // If that fails, try with a base URL (for relative URLs)
                url = new URL(event.page_url, 'https://example.com');
              }
              const params = Object.fromEntries(url.searchParams.entries());
              // Merge with existing eventUrlParams (page_url takes precedence)
              eventUrlParams = { ...eventUrlParams, ...params };
            } catch (e) {
              // If URL parsing fails, try simple string extraction
              if (event.page_url.includes('?')) {
                const queryString = event.page_url.substring(event.page_url.indexOf('?') + 1);
                queryString.split('&').forEach(param => {
                  const [key, value] = param.split('=');
                  if (key) {
                    try {
                      const decodedKey = decodeURIComponent(key);
                      const decodedValue = value ? decodeURIComponent(value) : '';
                      eventUrlParams[decodedKey] = decodedValue;
                    } catch (decodeError) {
                      // If decoding fails, use raw values
                      eventUrlParams[key] = value || '';
                    }
                  }
                });
              }
            }
          }
        }
        
        // Extract URL params from landing_page if available (fallback)
        // ALWAYS try this if landing_page has query params, regardless of sessionUrlParams
        if (session.landing_page?.includes('?')) {
          try {
            let url: URL;
            try {
              url = new URL(session.landing_page);
            } catch (e) {
              // If that fails, try with a base URL (for relative URLs)
              url = new URL(session.landing_page, 'https://example.com');
            }
            const params = Object.fromEntries(url.searchParams.entries());
            // Merge with existing sessionUrlParams (landing_page params take precedence if sessionUrlParams is empty)
            if (Object.keys(sessionUrlParams).length === 0) {
              sessionUrlParams = params;
            } else {
              // Merge, but don't overwrite existing params
              sessionUrlParams = { ...params, ...sessionUrlParams };
            }
          } catch (e) {
            // If URL parsing fails, try simple string extraction
            if (session.landing_page.includes('?')) {
              const queryString = session.landing_page.substring(session.landing_page.indexOf('?') + 1);
              queryString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                if (key) {
                  try {
                    const decodedKey = decodeURIComponent(key);
                    const decodedValue = value ? decodeURIComponent(value) : '';
                    if (Object.keys(sessionUrlParams).length === 0 || !sessionUrlParams[decodedKey]) {
                      sessionUrlParams[decodedKey] = decodedValue;
                    }
                  } catch (decodeError) {
                    // If decoding fails, use raw values
                    if (Object.keys(sessionUrlParams).length === 0 || !sessionUrlParams[key]) {
                      sessionUrlParams[key] = value || '';
                    }
                  }
                }
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
          lastSeen: (() => {
            try {
              if (!session.updated_at) return Date.now();
              const d = session.updated_at instanceof Date ? session.updated_at : new Date(session.updated_at);
              return !isNaN(d.getTime()) ? Number(d.getTime()) : Date.now();
            } catch {
              return Date.now();
            }
          })(),
          affiliate_id: session.affiliate_id,
          affiliate_number: session.affiliate_number || session.affiliate?.affiliate_number || null,
          affiliate_name: session.affiliate?.name || 
                         (session.affiliate?.first_name && session.affiliate?.last_name 
                           ? `${session.affiliate.first_name} ${session.affiliate.last_name}` 
                           : `Affiliate #${session.affiliate_number || session.affiliate?.affiliate_number || 'N/A'}`),
          url_params: finalUrlParams, // Always include url_params, even if empty
        };
      });

    // Group sessions by affiliate (all sessions for historical, active sessions for real-time)
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
    console.log(`[Analytics Stats] Sessions breakdown:`, {
      total: uniqueActiveSessions.length,
      withUrlParams: uniqueActiveSessions.filter(item => (item.session as any).url_params).length,
      withUrlParamsButNoEvents: uniqueActiveSessions.filter(item => (item.session as any).url_params && !item.event).length,
      withEvents: uniqueActiveSessions.filter(item => item.event).length,
      withoutEvents: uniqueActiveSessions.filter(item => !item.event).length,
    });
    
    // Use uniqueActiveSessions instead of all sessions for affiliate grouping
    // For historical mode, this includes all sessions in the time range
    // For real-time mode, this includes only active sessions
    console.log('[Analytics Stats] Starting affiliate grouping:', {
      viewMode,
      uniqueActiveSessionsCount: uniqueActiveSessions.length,
      sessionsWithAffiliateId: uniqueActiveSessions.filter(item => item.session.affiliate_id).length,
      sampleAffiliateIds: Array.from(new Set(uniqueActiveSessions.map(item => item.session.affiliate_id).filter(Boolean))).slice(0, 5),
    });
    
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
          if (urlParamsData && typeof urlParamsData === 'object' && !Array.isArray(urlParamsData)) {
            sessionUrlParams = urlParamsData as Record<string, string>;
          }
        } catch (e) {
          console.warn('[Analytics Stats] Error parsing session.url_params:', e);
        }
      }
      
      const eventData = event?.event_data as any;
      let eventUrlParams = (eventData?.url_params || {}) as Record<string, string>;
      
      // Extract from event.page_url - ALWAYS try this if page_url exists and has query params
      // This is the most reliable source for historical data
      if (event?.page_url && event.page_url.trim() !== '') {
        const pageUrlHasQuery = event.page_url.includes('?');
        if (pageUrlHasQuery || Object.keys(eventUrlParams).length === 0) {
          try {
            // Try parsing as absolute URL first
            let url: URL;
            try {
              url = new URL(event.page_url);
            } catch (e) {
              // If that fails, try with a base URL (for relative URLs)
              url = new URL(event.page_url, 'https://example.com');
            }
            const params = Object.fromEntries(url.searchParams.entries());
            // Merge with existing eventUrlParams (page_url takes precedence)
            eventUrlParams = { ...eventUrlParams, ...params };
          } catch (e) {
            // If URL parsing fails, try simple string extraction
            if (event.page_url.includes('?')) {
              const queryString = event.page_url.substring(event.page_url.indexOf('?') + 1);
              queryString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                if (key) {
                  try {
                    const decodedKey = decodeURIComponent(key);
                    const decodedValue = value ? decodeURIComponent(value) : '';
                    eventUrlParams[decodedKey] = decodedValue;
                  } catch (decodeError) {
                    // If decoding fails, use raw values
                    eventUrlParams[key] = value || '';
                  }
                }
              });
            }
          }
        }
      }
      
      // Extract URL params from landing_page if available (fallback)
      // ALWAYS try this if landing_page has query params, regardless of sessionUrlParams
      if (session.landing_page?.includes('?')) {
        try {
          let url: URL;
          try {
            url = new URL(session.landing_page);
          } catch (e) {
            // If that fails, try with a base URL (for relative URLs)
            url = new URL(session.landing_page, 'https://example.com');
          }
          const params = Object.fromEntries(url.searchParams.entries());
          // Merge with existing sessionUrlParams (landing_page params take precedence if sessionUrlParams is empty)
          if (Object.keys(sessionUrlParams).length === 0) {
            sessionUrlParams = params;
          } else {
            // Merge, but don't overwrite existing params
            sessionUrlParams = { ...params, ...sessionUrlParams };
          }
        } catch (e) {
          // If URL parsing fails, try simple string extraction
          if (session.landing_page.includes('?')) {
            const queryString = session.landing_page.substring(session.landing_page.indexOf('?') + 1);
            queryString.split('&').forEach(param => {
              const [key, value] = param.split('=');
              if (key) {
                try {
                  const decodedKey = decodeURIComponent(key);
                  const decodedValue = value ? decodeURIComponent(value) : '';
                  if (Object.keys(sessionUrlParams).length === 0 || !sessionUrlParams[decodedKey]) {
                    sessionUrlParams[decodedKey] = decodedValue;
                  }
                } catch (decodeError) {
                  // If decoding fails, use raw values
                  if (Object.keys(sessionUrlParams).length === 0 || !sessionUrlParams[key]) {
                    sessionUrlParams[key] = value || '';
                  }
                }
              }
            });
          }
        }
      }
      
      // Merge: event params take precedence, but session params persist if event doesn't have them
      const urlParams = { ...sessionUrlParams, ...eventUrlParams };
      
      // Debug: Log URL params extraction for sessions (especially those without events or with empty params)
      const hasUrlParamsInSession = !!(session as any).url_params;
      const hasNoEvent = !event;
      const finalUrlParamsCount = Object.keys(urlParams).length;
      const shouldLog = existing.active_visitors.length < 3 || (hasUrlParamsInSession && hasNoEvent) || (finalUrlParamsCount === 0 && (event?.page_url?.includes('?') || session.landing_page?.includes('?')));
      
      if (shouldLog) {
        console.log('[Analytics Stats] URL params extraction (affiliate grouping):', {
          session_id: session.session_id,
          hasUrlParamsInSession,
          sessionUrlParams: (session as any).url_params,
          hasEvent: !!event,
          eventPageUrl: event?.page_url,
          eventPageUrlHasQuery: event?.page_url?.includes('?'),
          eventDataUrlParams: eventData?.url_params,
          landingPage: session.landing_page,
          landingPageHasQuery: session.landing_page?.includes('?'),
          sessionUrlParamsKeys: Object.keys(sessionUrlParams),
          eventUrlParamsKeys: Object.keys(eventUrlParams),
          mergedUrlParamsKeys: Object.keys(urlParams),
          urlParamsCount: finalUrlParamsCount,
          finalUrlParams: urlParams,
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
        lastSeen: (() => {
          try {
            if (!session.updated_at) return Date.now();
            const d = session.updated_at instanceof Date ? session.updated_at : new Date(session.updated_at);
            return !isNaN(d.getTime()) ? Number(d.getTime()) : Date.now();
          } catch {
            return Date.now();
          }
        })(),
        url_params: finalUrlParams, // Always include url_params, even if empty
      });
      
      affiliateMap.set(key, existing);
    });

    // Calculate metrics per affiliate (all sessions for historical, active sessions for real-time)
    console.log(`[Analytics Stats] Found ${affiliateMap.size} unique affiliates with sessions (viewMode: ${viewMode})`);
    
    // Debug: Check specific affiliate if requested
    const debugAffiliateNumber = 30485;
    const debugAffiliate = Array.from(affiliateMap.values()).find(aff => aff.affiliate_number === debugAffiliateNumber);
    if (debugAffiliate) {
      const sessionsForDebugAffiliate = uniqueActiveSessions.filter(item => 
        item.session.affiliate_id === debugAffiliate.affiliate_id
      );
      console.log(`[Analytics Stats] Debug - Affiliate #${debugAffiliateNumber} (${debugAffiliate.affiliate_name}):`, {
        affiliate_id: debugAffiliate.affiliate_id,
        sessionsCount: debugAffiliate.sessions,
        uniqueVisitors: debugAffiliate.visitors.size,
        sessionsInUniqueActiveSessions: sessionsForDebugAffiliate.length,
        sampleSessionIds: sessionsForDebugAffiliate.slice(0, 5).map(item => item.session.id),
        viewMode,
        timeRange: viewMode === 'historical' ? timeRange : 'N/A',
      });
    }
    
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
        const visitorsWithParams = result.active_visitors.filter(v => v.url_params && Object.keys(v.url_params).length > 0);
        console.log('[Analytics Stats] Sample affiliate active_visitors:', {
          affiliate_id: aff.affiliate_id,
          affiliate_name: aff.affiliate_name,
          active_visitors_count: result.active_visitors.length,
          visitors_with_url_params: visitorsWithParams.length,
          first_visitor: result.active_visitors[0] ? {
            session_id: result.active_visitors[0].session_id,
            currentPage: result.active_visitors[0].currentPage,
            has_url_params: !!result.active_visitors[0].url_params,
            url_params_keys: result.active_visitors[0].url_params ? Object.keys(result.active_visitors[0].url_params) : [],
            url_params: result.active_visitors[0].url_params,
          } : null,
          sample_visitor_with_params: visitorsWithParams[0] ? {
            session_id: visitorsWithParams[0].session_id,
            url_params: visitorsWithParams[0].url_params,
          } : null,
        });
      }
      
      return result;
    }).sort((a, b) => b.sessions - a.sessions);

    // Final debug log before returning
    console.log('[Analytics Stats] Final response data:', {
      viewMode,
      metrics: {
        total_visitors: totalVisitors,
        unique_visitors: uniqueVisitors,
        sessions: totalVisitors,
      },
      affiliatesCount: affiliates.length,
      topPagesCount: topPages.length,
      activeVisitorsCount: activeVisitors.length,
      sessionsListLength: sessionsList.length,
    });

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
