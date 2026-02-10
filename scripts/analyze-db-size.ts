/**
 * Script to analyze database table sizes and suggest cleanup strategies
 * 
 * Usage: npx tsx scripts/analyze-db-size.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeDatabase() {
  try {
    console.log('\n📊 Database Size Analysis\n');

    // Get counts for high-volume tables
    const [
      visitorEvents,
      visitorSessions,
      clicks,
      postbackLogs,
      webhookLogs,
      commissions,
      orderAttributions,
    ] = await Promise.all([
      prisma.visitorEvent.count(),
      prisma.visitorSession.count(),
      prisma.click.count(),
      prisma.postbackLog.count(),
      prisma.affiliateWebhookLog.count(),
      prisma.commission.count(),
      prisma.orderAttribution.count(),
    ]);

    console.log('📈 Record Counts:');
    console.log(`   VisitorEvents: ${visitorEvents.toLocaleString()}`);
    console.log(`   VisitorSessions: ${visitorSessions.toLocaleString()}`);
    console.log(`   Clicks: ${clicks.toLocaleString()}`);
    console.log(`   PostbackLogs: ${postbackLogs.toLocaleString()}`);
    console.log(`   WebhookLogs: ${webhookLogs.toLocaleString()}`);
    console.log(`   Commissions: ${commissions.toLocaleString()}`);
    console.log(`   OrderAttributions: ${orderAttributions.toLocaleString()}`);

    // Get oldest records
    const oldestEvent = await prisma.visitorEvent.findFirst({
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true },
    });

    const oldestSession = await prisma.visitorSession.findFirst({
      orderBy: { start_time: 'asc' },
      select: { start_time: true },
    });

    const oldestClick = await prisma.click.findFirst({
      orderBy: { created_at: 'asc' },
      select: { created_at: true },
    });

    console.log('\n📅 Oldest Records:');
    if (oldestEvent) {
      console.log(`   Oldest VisitorEvent: ${oldestEvent.timestamp.toISOString()}`);
    }
    if (oldestSession) {
      console.log(`   Oldest VisitorSession: ${oldestSession.start_time.toISOString()}`);
    }
    if (oldestClick) {
      console.log(`   Oldest Click: ${oldestClick.created_at.toISOString()}`);
    }

    // Calculate estimated sizes (rough estimates)
    // VisitorEvent: ~500 bytes per record (with JSON data)
    // VisitorSession: ~1KB per record
    // Click: ~200 bytes per record
    const estimatedSize = 
      (visitorEvents * 500) +
      (visitorSessions * 1024) +
      (clicks * 200) +
      (postbackLogs * 300) +
      (webhookLogs * 400) +
      (commissions * 300) +
      (orderAttributions * 250);

    const estimatedSizeMB = estimatedSize / (1024 * 1024);
    console.log(`\n💾 Estimated Database Size: ~${estimatedSizeMB.toFixed(2)} MB`);

    // Recommendations
    console.log('\n💡 Recommendations:');
    
    if (visitorEvents > 10000) {
      console.log(`   ⚠️  VisitorEvents table has ${visitorEvents.toLocaleString()} records`);
      console.log('      Consider archiving events older than 90 days');
    }

    if (visitorSessions > 5000) {
      console.log(`   ⚠️  VisitorSessions table has ${visitorSessions.toLocaleString()} records`);
      console.log('      Consider archiving sessions older than 90 days');
    }

    if (clicks > 50000) {
      console.log(`   ⚠️  Clicks table has ${clicks.toLocaleString()} records`);
      console.log('      Consider archiving clicks older than 180 days');
    }

    if (postbackLogs > 10000 || webhookLogs > 10000) {
      console.log(`   ⚠️  Log tables have many records`);
      console.log('      Consider archiving logs older than 30 days');
    }

    if (estimatedSizeMB < 50) {
      console.log('   ✅ Database size is healthy (< 50MB)');
      console.log('   ✅ No immediate cleanup needed');
    } else if (estimatedSizeMB < 200) {
      console.log('   ⚠️  Database is growing but still manageable');
      console.log('   💡 Consider implementing data retention policies');
    } else {
      console.log('   🚨 Database is getting large');
      console.log('   🔥 Implement data retention policies immediately');
    }

    console.log('\n📝 Suggested Retention Policies:');
    console.log('   - VisitorEvents: Keep 90 days, archive older');
    console.log('   - VisitorSessions: Keep 90 days, archive older');
    console.log('   - Clicks: Keep 180 days, archive older');
    console.log('   - PostbackLogs: Keep 30 days, delete older');
    console.log('   - WebhookLogs: Keep 30 days, delete older');
    console.log('   - Commissions: Keep forever (financial data)');
    console.log('   - OrderAttributions: Keep forever (financial data)');

  } catch (error: any) {
    console.error('Error analyzing database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDatabase()
  .then(() => {
    console.log('\n✅ Analysis complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  });
