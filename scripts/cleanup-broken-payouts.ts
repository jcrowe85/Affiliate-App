import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clean up payout runs that don't have valid commissions or affiliate data
 * These are the ones showing "Unknown" affiliate names and "$0.00" amounts
 */
async function cleanupBrokenPayouts() {
  try {
    console.log('\n🔍 Finding all paid payout runs...\n');
    
    // Get all paid payout runs
    const payoutRuns = await prisma.payoutRun.findMany({
      where: {
        status: 'paid',
      },
      include: {
        commissions: {
          include: {
            commission: {
              include: {
                affiliate: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            commissions: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    console.log(`Found ${payoutRuns.length} paid payout runs\n`);

    // Identify broken payout runs
    const brokenPayouts: Array<{
      id: string;
      created_at: Date;
      commissionCount: number;
      reason: string;
    }> = [];

    for (const run of payoutRuns) {
      // Check if commissions array is empty
      if (run.commissions.length === 0) {
        brokenPayouts.push({
          id: run.id,
          created_at: run.created_at,
          commissionCount: run._count.commissions,
          reason: 'No commissions loaded (empty array)',
        });
        continue;
      }

      // Check if all commissions are null or have no affiliate
      const validCommissions = run.commissions.filter(
        pc => pc.commission !== null && pc.commission.affiliate !== null
      );

      if (validCommissions.length === 0) {
        brokenPayouts.push({
          id: run.id,
          created_at: run.created_at,
          commissionCount: run.commissions.length,
          reason: 'No valid commissions with affiliate data',
        });
        continue;
      }

      // Check if total amount would be $0.00
      const totalAmount = validCommissions.reduce(
        (sum, pc) => {
          if (!pc.commission) return sum;
          const amount = parseFloat(pc.commission.amount.toString());
          return isNaN(amount) ? sum : sum + amount;
        },
        0
      );

      if (totalAmount === 0) {
        brokenPayouts.push({
          id: run.id,
          created_at: run.created_at,
          commissionCount: validCommissions.length,
          reason: 'Total amount is $0.00',
        });
      }
    }

    if (brokenPayouts.length === 0) {
      console.log('✅ No broken payout runs found. All payouts look good!\n');
      return;
    }

    console.log(`\n⚠️  Found ${brokenPayouts.length} broken payout run(s):\n`);
    brokenPayouts.forEach((payout, index) => {
      console.log(`${index + 1}. Payout Run ID: ${payout.id}`);
      console.log(`   Created: ${payout.created_at.toISOString()}`);
      console.log(`   Commission Count: ${payout.commissionCount}`);
      console.log(`   Reason: ${payout.reason}`);
      console.log('');
    });

    console.log('\n🗑️  Deleting broken payout runs...\n');

    // Delete the broken payout runs
    // This will cascade delete PayoutRunCommission records
    const deleteResult = await prisma.payoutRun.deleteMany({
      where: {
        id: { in: brokenPayouts.map(p => p.id) },
      },
    });

    console.log(`✅ Successfully deleted ${deleteResult.count} broken payout run(s)\n`);

    // Verify deletion
    const remainingPaidRuns = await prisma.payoutRun.count({
      where: {
        status: 'paid',
      },
    });

    console.log(`📊 Remaining paid payout runs: ${remainingPaidRuns}\n`);

  } catch (error: any) {
    console.error('❌ Error cleaning up broken payouts:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupBrokenPayouts();
