import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Starting commission fixes...\n');

  // Task 1: Remove transactions for jcrowe120485@gmail.com
  console.log('1️⃣ Removing commissions for jcrowe120485@gmail.com...');
  
  const affiliate1 = await prisma.affiliate.findFirst({
    where: {
      email: 'jcrowe120485@gmail.com',
    },
  });

  if (!affiliate1) {
    console.log('   ⚠️  Affiliate jcrowe120485@gmail.com not found');
  } else {
    console.log(`   ✅ Found affiliate: ${affiliate1.name || affiliate1.email} (ID: ${affiliate1.id})`);
    
    // Count commissions before deletion
    const commissionCount = await prisma.commission.count({
      where: {
        affiliate_id: affiliate1.id,
      },
    });
    
    console.log(`   📊 Found ${commissionCount} commission(s) to delete`);
    
    if (commissionCount > 0) {
      // Delete related payout run commissions first (if any)
      const payoutRunCommissions = await prisma.payoutRunCommission.findMany({
        where: {
          commission: {
            affiliate_id: affiliate1.id,
          },
        },
      });
      
      if (payoutRunCommissions.length > 0) {
        console.log(`   🗑️  Deleting ${payoutRunCommissions.length} payout run commission link(s)...`);
        await prisma.payoutRunCommission.deleteMany({
          where: {
            commission: {
              affiliate_id: affiliate1.id,
            },
          },
        });
      }
      
      // Delete fraud flags
      const fraudFlagsCount = await prisma.fraudFlag.count({
        where: {
          commission: {
            affiliate_id: affiliate1.id,
          },
        },
      });
      
      if (fraudFlagsCount > 0) {
        console.log(`   🗑️  Deleting ${fraudFlagsCount} fraud flag(s)...`);
        await prisma.fraudFlag.deleteMany({
          where: {
            commission: {
              affiliate_id: affiliate1.id,
            },
          },
        });
      }
      
      // Delete commissions
      const deleted = await prisma.commission.deleteMany({
        where: {
          affiliate_id: affiliate1.id,
        },
      });
      
      console.log(`   ✅ Deleted ${deleted.count} commission(s)`);
    } else {
      console.log('   ℹ️  No commissions found to delete');
    }
  }

  console.log('\n');

  // Task 2: Move kaigon9@gmail.com paid commissions back to eligible
  console.log('2️⃣ Reverting paid commissions for kaigon9@gmail.com to eligible...');
  
  const affiliate2 = await prisma.affiliate.findFirst({
    where: {
      email: 'kaigon9@gmail.com',
    },
  });

  if (!affiliate2) {
    console.log('   ⚠️  Affiliate kaigon9@gmail.com not found');
  } else {
    console.log(`   ✅ Found affiliate: ${affiliate2.name || affiliate2.email} (ID: ${affiliate2.id})`);
    
    // Find paid commissions
    const paidCommissions = await prisma.commission.findMany({
      where: {
        affiliate_id: affiliate2.id,
        status: 'paid',
      },
      include: {
        order_attribution: {
          select: {
            shopify_order_number: true,
          },
        },
      },
    });
    
    console.log(`   📊 Found ${paidCommissions.length} paid commission(s)`);
    
    if (paidCommissions.length > 0) {
      console.log('   📋 Commission details:');
      paidCommissions.forEach((c, idx) => {
        console.log(`      ${idx + 1}. Order: ${c.order_attribution?.shopify_order_number || c.shopify_order_id}, Amount: ${c.amount} ${c.currency}, Status: ${c.status}`);
      });
      
      // Update status from 'paid' to 'eligible'
      const updated = await prisma.commission.updateMany({
        where: {
          affiliate_id: affiliate2.id,
          status: 'paid',
        },
        data: {
          status: 'eligible',
        },
      });
      
      console.log(`   ✅ Updated ${updated.count} commission(s) from 'paid' to 'eligible'`);
      
      // Also update any payout runs that reference these commissions
      const payoutRuns = await prisma.payoutRun.findMany({
        where: {
          commissions: {
            some: {
              commission: {
                affiliate_id: affiliate2.id,
                status: 'eligible', // Now eligible after update
              },
            },
          },
          status: 'paid',
        },
      });
      
      if (payoutRuns.length > 0) {
        console.log(`   ⚠️  Found ${payoutRuns.length} payout run(s) with status 'paid' that reference these commissions`);
        console.log('   ℹ️  Note: Payout run statuses were not automatically updated. You may want to review them manually.');
      }
    } else {
      console.log('   ℹ️  No paid commissions found');
    }
  }

  console.log('\n✅ Commission fixes completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
