/**
 * Script to clear tracking/performance data for a specific affiliate
 * while preserving the affiliate record and configuration.
 * 
 * Usage: npx tsx scripts/clear-affiliate-data.ts <affiliate_number>
 * Example: npx tsx scripts/clear-affiliate-data.ts 30485
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearAffiliateData(affiliateNumber: number) {
  try {
    console.log(`\n🔍 Looking for affiliate with number: ${affiliateNumber}...`);

    // Find the affiliate
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        affiliate_number: affiliateNumber,
      },
      select: {
        id: true,
        affiliate_number: true,
        name: true,
        email: true,
        first_name: true,
        last_name: true,
      },
    });

    if (!affiliate) {
      console.error(`❌ Affiliate with number ${affiliateNumber} not found.`);
      process.exit(1);
    }

    console.log(`✅ Found affiliate: ${affiliate.name || `${affiliate.first_name} ${affiliate.last_name}`} (${affiliate.email})`);
    console.log(`   Affiliate ID: ${affiliate.id}`);
    console.log(`\n⚠️  This will delete ALL tracking data for this affiliate:`);
    console.log(`   - Clicks`);
    console.log(`   - Order Attributions`);
    console.log(`   - Commissions`);
    console.log(`   - Subscription Attributions`);
    console.log(`   - Fraud Flags`);
    console.log(`   - Webhook Logs`);
    console.log(`   - Visitor Sessions & Events`);
    console.log(`   - Affiliate Links (optional)`);
    console.log(`\n✅ The affiliate record and configuration will be preserved.`);

    // Count records to be deleted
    const [
      clicksCount,
      orderAttributionsCount,
      commissionsCount,
      subscriptionsCount,
      fraudFlagsCount,
      webhookLogsCount,
      visitorSessionsCount,
      linksCount,
    ] = await Promise.all([
      prisma.click.count({ where: { affiliate_id: affiliate.id } }),
      prisma.orderAttribution.count({ where: { affiliate_id: affiliate.id } }),
      prisma.commission.count({ where: { affiliate_id: affiliate.id } }),
      prisma.subscriptionAttribution.count({ where: { affiliate_id: affiliate.id } }),
      prisma.fraudFlag.count({ where: { affiliate_id: affiliate.id } }),
      prisma.affiliateWebhookLog.count({ where: { affiliate_id: affiliate.id } }),
      prisma.visitorSession.count({ where: { affiliate_id: affiliate.id } }),
      prisma.affiliateLink.count({ where: { affiliate_id: affiliate.id } }),
    ]);

    // Get visitor session IDs for event deletion
    const visitorSessions = await prisma.visitorSession.findMany({
      where: { affiliate_id: affiliate.id },
      select: { id: true },
    });
    const sessionIds = visitorSessions.map(s => s.id);
    const visitorEventsCount = sessionIds.length > 0 
      ? await prisma.visitorEvent.count({ where: { visitor_session_id: { in: sessionIds } } })
      : 0;

    console.log(`\n📊 Records to be deleted:`);
    console.log(`   - Clicks: ${clicksCount}`);
    console.log(`   - Order Attributions: ${orderAttributionsCount}`);
    console.log(`   - Commissions: ${commissionsCount}`);
    console.log(`   - Subscription Attributions: ${subscriptionsCount}`);
    console.log(`   - Fraud Flags: ${fraudFlagsCount}`);
    console.log(`   - Webhook Logs: ${webhookLogsCount}`);
    console.log(`   - Visitor Sessions: ${visitorSessionsCount}`);
    console.log(`   - Visitor Events: ${visitorEventsCount}`);
    console.log(`   - Affiliate Links: ${linksCount}`);

    if (clicksCount === 0 && orderAttributionsCount === 0 && commissionsCount === 0) {
      console.log(`\n✅ No tracking data found for this affiliate. Nothing to delete.`);
      process.exit(0);
    }

    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      console.log(`\n🗑️  Deleting data...`);

      // 1. Delete Visitor Events first (they reference sessions)
      if (sessionIds.length > 0) {
        const deletedEvents = await tx.visitorEvent.deleteMany({
          where: { visitor_session_id: { in: sessionIds } },
        });
        console.log(`   ✅ Deleted ${deletedEvents.count} visitor events`);
      }

      // 2. Delete Visitor Sessions
      const deletedSessions = await tx.visitorSession.deleteMany({
        where: { affiliate_id: affiliate.id },
      });
      console.log(`   ✅ Deleted ${deletedSessions.count} visitor sessions`);

      // 3. Delete Webhook Logs (they reference commissions)
      const deletedWebhookLogs = await tx.affiliateWebhookLog.deleteMany({
        where: { affiliate_id: affiliate.id },
      });
      console.log(`   ✅ Deleted ${deletedWebhookLogs.count} webhook logs`);

      // 4. Delete Fraud Flags (they reference commissions)
      const deletedFraudFlags = await tx.fraudFlag.deleteMany({
        where: { affiliate_id: affiliate.id },
      });
      console.log(`   ✅ Deleted ${deletedFraudFlags.count} fraud flags`);

      // 5. Delete PayoutRunCommissions (they reference commissions)
      // First get commission IDs
      const commissions = await tx.commission.findMany({
        where: { affiliate_id: affiliate.id },
        select: { id: true },
      });
      const commissionIds = commissions.map(c => c.id);
      
      if (commissionIds.length > 0) {
        const deletedPayoutRuns = await tx.payoutRunCommission.deleteMany({
          where: { commission_id: { in: commissionIds } },
        });
        console.log(`   ✅ Deleted ${deletedPayoutRuns.count} payout run commissions`);
      }

      // 6. Delete PostbackLogs (they reference commissions)
      if (commissionIds.length > 0) {
        const deletedPostbacks = await tx.postbackLog.deleteMany({
          where: { commission_id: { in: commissionIds } },
        });
        console.log(`   ✅ Deleted ${deletedPostbacks.count} postback logs`);
      }

      // 7. Delete Commissions (they reference order attributions)
      const deletedCommissions = await tx.commission.deleteMany({
        where: { affiliate_id: affiliate.id },
      });
      console.log(`   ✅ Deleted ${deletedCommissions.count} commissions`);

      // 8. Delete Order Attributions (they reference clicks)
      const deletedOrderAttributions = await tx.orderAttribution.deleteMany({
        where: { affiliate_id: affiliate.id },
      });
      console.log(`   ✅ Deleted ${deletedOrderAttributions.count} order attributions`);

      // 9. Delete Subscription Attributions
      const deletedSubscriptions = await tx.subscriptionAttribution.deleteMany({
        where: { affiliate_id: affiliate.id },
      });
      console.log(`   ✅ Deleted ${deletedSubscriptions.count} subscription attributions`);

      // 10. Delete Clicks (they reference links, but links are optional)
      const deletedClicks = await tx.click.deleteMany({
        where: { affiliate_id: affiliate.id },
      });
      console.log(`   ✅ Deleted ${deletedClicks.count} clicks`);

      // 11. Delete Affiliate Links (optional - uncomment if you want to delete these too)
      // const deletedLinks = await tx.affiliateLink.deleteMany({
      //   where: { affiliate_id: affiliate.id },
      // });
      // console.log(`   ✅ Deleted ${deletedLinks.count} affiliate links`);

      console.log(`\n✅ Successfully cleared all tracking data for affiliate ${affiliateNumber}`);
    });

    // Verify deletion
    const remainingCounts = await Promise.all([
      prisma.click.count({ where: { affiliate_id: affiliate.id } }),
      prisma.orderAttribution.count({ where: { affiliate_id: affiliate.id } }),
      prisma.commission.count({ where: { affiliate_id: affiliate.id } }),
      prisma.subscriptionAttribution.count({ where: { affiliate_id: affiliate.id } }),
      prisma.fraudFlag.count({ where: { affiliate_id: affiliate.id } }),
      prisma.affiliateWebhookLog.count({ where: { affiliate_id: affiliate.id } }),
      prisma.visitorSession.count({ where: { affiliate_id: affiliate.id } }),
    ]);

    const totalRemaining = remainingCounts.reduce((sum, count) => sum + count, 0);

    if (totalRemaining === 0) {
      console.log(`\n✅ Verification: All tracking data has been cleared.`);
    } else {
      console.log(`\n⚠️  Warning: Some data may still remain. Please check manually.`);
    }

    // Verify affiliate record still exists
    const affiliateStillExists = await prisma.affiliate.findUnique({
      where: { id: affiliate.id },
    });

    if (affiliateStillExists) {
      console.log(`✅ Affiliate record preserved: ${affiliateStillExists.name || `${affiliateStillExists.first_name} ${affiliateStillExists.last_name}`}`);
    } else {
      console.log(`❌ ERROR: Affiliate record was deleted! This should not happen.`);
    }

  } catch (error) {
    console.error(`\n❌ Error clearing affiliate data:`, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get affiliate number from command line
const affiliateNumber = process.argv[2];

if (!affiliateNumber) {
  console.error('❌ Please provide an affiliate number.');
  console.error('Usage: npx tsx scripts/clear-affiliate-data.ts <affiliate_number>');
  console.error('Example: npx tsx scripts/clear-affiliate-data.ts 30485');
  process.exit(1);
}

const affiliateNumberInt = parseInt(affiliateNumber, 10);

if (isNaN(affiliateNumberInt)) {
  console.error(`❌ Invalid affiliate number: ${affiliateNumber}`);
  process.exit(1);
}

clearAffiliateData(affiliateNumberInt)
  .then(() => {
    console.log(`\n✅ Script completed successfully.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Script failed:`, error);
    process.exit(1);
  });
