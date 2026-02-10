/**
 * Script to clean up old analytics and log data
 * 
 * WARNING: This will permanently delete data. Use with caution!
 * 
 * Usage: npx tsx scripts/cleanup-old-data.ts [--dry-run] [--days=90]
 * 
 * Options:
 *   --dry-run: Show what would be deleted without actually deleting
 *   --days: Number of days to keep (default: 90)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CleanupOptions {
  dryRun: boolean;
  daysToKeep: number;
}

async function cleanupOldData(options: CleanupOptions) {
  const { dryRun, daysToKeep } = options;
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  console.log(`\n🧹 Cleaning up data older than ${daysToKeep} days (before ${cutoffDate.toISOString()})`);
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No data will be deleted\n');
  } else {
    console.log('⚠️  LIVE MODE - Data will be permanently deleted\n');
  }

  try {
    // 1. Clean up old VisitorEvents (keep sessions for now)
    const oldEvents = await prisma.visitorEvent.count({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    console.log(`📊 Found ${oldEvents.toLocaleString()} old VisitorEvents`);
    if (!dryRun && oldEvents > 0) {
      const deleted = await prisma.visitorEvent.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });
      console.log(`   ✅ Deleted ${deleted.count.toLocaleString()} VisitorEvents`);
    }

    // 2. Clean up old VisitorSessions (only if they have no events)
    const oldSessions = await prisma.visitorSession.count({
      where: {
        start_time: {
          lt: cutoffDate,
        },
        events: {
          none: {}, // Only sessions with no events
        },
      },
    });

    console.log(`📊 Found ${oldSessions.toLocaleString()} old VisitorSessions (with no events)`);
    if (!dryRun && oldSessions > 0) {
      const deleted = await prisma.visitorSession.deleteMany({
        where: {
          start_time: {
            lt: cutoffDate,
          },
          events: {
            none: {},
          },
        },
      });
      console.log(`   ✅ Deleted ${deleted.count.toLocaleString()} VisitorSessions`);
    }

    // 3. Clean up old PostbackLogs
    const oldPostbackLogs = await prisma.postbackLog.count({
      where: {
        created_at: {
          lt: cutoffDate,
        },
        status: 'success', // Only delete successful logs
      },
    });

    console.log(`📊 Found ${oldPostbackLogs.toLocaleString()} old successful PostbackLogs`);
    if (!dryRun && oldPostbackLogs > 0) {
      const deleted = await prisma.postbackLog.deleteMany({
        where: {
          created_at: {
            lt: cutoffDate,
          },
          status: 'success',
        },
      });
      console.log(`   ✅ Deleted ${deleted.count.toLocaleString()} PostbackLogs`);
    }

    // 4. Clean up old AffiliateWebhookLogs
    const oldWebhookLogs = await prisma.affiliateWebhookLog.count({
      where: {
        created_at: {
          lt: cutoffDate,
        },
        status: 'success', // Only delete successful logs
      },
    });

    console.log(`📊 Found ${oldWebhookLogs.toLocaleString()} old successful WebhookLogs`);
    if (!dryRun && oldWebhookLogs > 0) {
      const deleted = await prisma.affiliateWebhookLog.deleteMany({
        where: {
          created_at: {
            lt: cutoffDate,
          },
          status: 'success',
        },
      });
      console.log(`   ✅ Deleted ${deleted.count.toLocaleString()} WebhookLogs`);
    }

    // Note: We don't delete Clicks, Commissions, or OrderAttributions
    // as these are important for attribution and financial records

    console.log('\n✅ Cleanup complete!');
    if (dryRun) {
      console.log('💡 Run without --dry-run to actually delete the data');
    }

  } catch (error: any) {
    console.error('\n❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: CleanupOptions = {
  dryRun: args.includes('--dry-run'),
  daysToKeep: parseInt(args.find(arg => arg.startsWith('--days='))?.split('=')[1] || '90'),
};

if (options.daysToKeep < 7) {
  console.error('❌ Error: Cannot keep less than 7 days of data');
  process.exit(1);
}

cleanupOldData(options)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
