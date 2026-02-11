/**
 * Script to check how URL parameters are stored in the database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUrlParams() {
  try {
    console.log('Checking URL parameters storage in database...\n');

    // Get a few recent sessions with affiliate_id
    const sessions = await prisma.visitorSession.findMany({
      where: {
        affiliate_id: { not: null },
      },
      select: {
        id: true,
        session_id: true,
        affiliate_id: true,
        landing_page: true,
        entry_page: true,
        start_time: true,
      },
      orderBy: {
        start_time: 'desc',
      },
      take: 10,
    });

    console.log(`Found ${sessions.length} recent affiliate sessions\n`);

    for (const session of sessions) {
      console.log(`Session: ${session.session_id}`);
      console.log(`  ID: ${session.id}`);
      console.log(`  Affiliate ID: ${session.affiliate_id}`);
      console.log(`  Landing Page: ${session.landing_page || '(null)'}`);
      console.log(`  Entry Page: ${session.entry_page || '(null)'}`);
      console.log(`  Start Time: ${session.start_time.toISOString()}`);
      
      // Check if landing_page has query parameters
      if (session.landing_page?.includes('?')) {
        const url = new URL(session.landing_page, 'https://example.com');
        const params = Object.fromEntries(url.searchParams.entries());
        console.log(`  URL Params in landing_page:`, params);
      } else {
        console.log(`  No URL params in landing_page`);
      }

      // Get events for this session
      const events = await prisma.visitorEvent.findMany({
        where: {
          visitor_session_id: session.id,
          event_type: 'page_view',
        },
        select: {
          id: true,
          page_url: true,
          page_path: true,
          event_data: true,
          timestamp: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 3,
      });

      console.log(`  Events: ${events.length}`);
      for (const event of events) {
        console.log(`    Event ${event.id}:`);
        console.log(`      Page URL: ${event.page_url || '(null)'}`);
        console.log(`      Page Path: ${event.page_path || '(null)'}`);
        if (event.event_data) {
          const eventData = event.event_data as any;
          if (eventData.url_params) {
            console.log(`      URL Params in event_data:`, eventData.url_params);
          } else {
            console.log(`      event_data exists but no url_params:`, Object.keys(eventData));
          }
        } else {
          console.log(`      No event_data`);
        }
        console.log(`      Timestamp: ${event.timestamp.toISOString()}`);
      }

      console.log('');
    }

    // Check if there's a url_params field in VisitorSession
    const sampleSession = await prisma.visitorSession.findFirst({
      select: {
        id: true,
        landing_page: true,
      },
    });

    console.log('\nChecking schema fields...');
    console.log('VisitorSession has landing_page field:', sampleSession?.landing_page !== undefined);
    
    // Try to query for sessions with URL params in landing_page
    const sessionsWithParams = await prisma.visitorSession.findMany({
      where: {
        affiliate_id: { not: null },
        landing_page: {
          contains: '?',
        },
      },
      select: {
        id: true,
        session_id: true,
        landing_page: true,
      },
      take: 5,
    });

    console.log(`\nSessions with '?' in landing_page: ${sessionsWithParams.length}`);
    for (const s of sessionsWithParams) {
      console.log(`  ${s.session_id}: ${s.landing_page}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUrlParams();
