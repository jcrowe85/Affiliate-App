import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Server-Sent Events (SSE) endpoint for real-time analytics updates
 * Clients connect to this endpoint to receive live analytics data
 */
export async function GET(request: NextRequest) {
  try {
    let admin;
    try {
      admin = await getCurrentAdmin();
    } catch (authError: any) {
      console.error('Auth error in analytics stream:', authError);
      return new Response('Authentication error', { status: 500 });
    }
    
    if (!admin) {
      return new Response('Unauthorized', { status: 401 });
    }

  const shopifyShopId = admin.shopify_shop_id;
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Send initial connection message
      send(JSON.stringify({ type: 'connected', message: 'Analytics stream connected' }));

      // Function to fetch and send analytics data
      const fetchAndSendAnalytics = async () => {
        try {
          const fiveMinutesAgo = BigInt(Date.now() - 5 * 60 * 1000);
          const oneDayAgo = BigInt(Date.now() - 24 * 60 * 60 * 1000);

          // Get active visitors
          const activeEvents = await prisma.visitorEvent.findMany({
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
            distinct: ['session_id'],
            take: 50,
          });

          // Get recent sessions for metrics
          const recentSessions = await prisma.visitorSession.findMany({
            where: {
              shopify_shop_id: shopifyShopId,
              start_time: {
                gte: oneDayAgo,
              },
            },
          });

          // Calculate metrics
          const totalVisitors = recentSessions.length;
          const uniqueVisitors = new Set(recentSessions.map(s => s.visitor_id)).size;
          const bouncedSessions = recentSessions.filter(s => s.is_bounce).length;
          const bounceRate = totalVisitors > 0 ? (bouncedSessions / totalVisitors) * 100 : 0;
          
          const totalSessionTime = recentSessions
            .filter(s => s.total_time)
            .reduce((sum, s) => sum + (s.total_time || 0), 0);
          const sessionsWithTime = recentSessions.filter(s => s.total_time).length;
          const avgSessionTime = sessionsWithTime > 0 ? totalSessionTime / sessionsWithTime : 0;
          
          const totalPages = recentSessions.reduce((sum, s) => sum + s.pages_visited.length, 0);
          const pagesPerSession = totalVisitors > 0 ? totalPages / totalVisitors : 0;

          // Format active visitors
          const activeVisitors = activeEvents.map(event => {
            const session = event.session;
            return {
              session_id: session.session_id,
              currentPage: session.pages_visited[session.pages_visited.length - 1] || '/',
              device: session.device_type || 'Unknown',
              location: session.location_country || 'Unknown',
              lastSeen: Number(session.updated_at.getTime()),
            };
          });

          // Send updated data
          send(JSON.stringify({
            type: 'update',
            data: {
              metrics: {
                total_visitors: totalVisitors,
                unique_visitors: uniqueVisitors,
                sessions: totalVisitors,
                bounce_rate: bounceRate,
                avg_session_time: avgSessionTime,
                pages_per_session: pagesPerSession,
              },
              activeVisitors,
              timestamp: Date.now(),
            },
          }));
        } catch (error: any) {
          console.error('SSE analytics error:', error);
          send(JSON.stringify({
            type: 'error',
            message: error.message || 'Failed to fetch analytics',
          }));
        }
      };

      // Send initial data
      await fetchAndSendAnalytics();

      // Set up interval to send updates every 5 seconds
      const interval = setInterval(async () => {
        await fetchAndSendAnalytics();
      }, 5000);

      // Clean up on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in nginx
    },
  });
}
