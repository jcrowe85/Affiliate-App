/**
 * Script to update an affiliate's affiliate_number
 * Run: npx tsx scripts/update-affiliate-number.ts <affiliate-id> <new-number>
 * Or run without args to update the most recent affiliate to 30485
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Update the most recent affiliate to 30485
    const affiliate = await prisma.affiliate.findFirst({
      orderBy: { created_at: 'desc' },
    });
    
    if (!affiliate) {
      console.error('No affiliates found');
      process.exit(1);
    }
    
    // Check if 30485 is already taken
    const existing = await prisma.affiliate.findFirst({
      where: { affiliate_number: 30485 },
    });
    
    if (existing && existing.id !== affiliate.id) {
      console.error(`Affiliate number 30485 is already taken by: ${existing.email}`);
      process.exit(1);
    }
    
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { affiliate_number: 30485 },
    });
    
    console.log(`✅ Updated affiliate ${affiliate.email} to affiliate_number: 30485`);
  } else if (args.length === 2) {
    const affiliateId = args[0];
    const newNumber = parseInt(args[1], 10);
    
    if (isNaN(newNumber)) {
      console.error('Invalid affiliate number');
      process.exit(1);
    }
    
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
    });
    
    if (!affiliate) {
      console.error('Affiliate not found');
      process.exit(1);
    }
    
    // Check if number is already taken
    const existing = await prisma.affiliate.findFirst({
      where: { affiliate_number: newNumber },
    });
    
    if (existing && existing.id !== affiliate.id) {
      console.error(`Affiliate number ${newNumber} is already taken by: ${existing.email}`);
      process.exit(1);
    }
    
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { affiliate_number: newNumber },
    });
    
    console.log(`✅ Updated affiliate ${affiliate.email} to affiliate_number: ${newNumber}`);
  } else {
    console.log('Usage: npx tsx scripts/update-affiliate-number.ts [affiliate-id] [new-number]');
    console.log('  Or run without args to update most recent affiliate to 30485');
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
