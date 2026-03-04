/**
 * Create a second admin user (same shop as existing admin).
 * Run: npx tsx scripts/create-second-admin.ts
 *
 * Or with env: EMAIL=... PASSWORD=... npx tsx scripts/create-second-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@/lib/auth';

const prisma = new PrismaClient();

const EMAIL = process.env.EMAIL ?? 'mwalialec@gmail.com';
const PASSWORD = process.env.PASSWORD ?? 'Andolo123!';
const NAME = process.env.NAME ?? null;

async function main() {
  console.log('Create second admin user\n');

  // Get shop ID from existing admin or env
  const existingAdmin = await prisma.adminUser.findFirst({
    orderBy: { created_at: 'asc' },
    select: { shopify_shop_id: true },
  });
  const shopifyShopId =
    existingAdmin?.shopify_shop_id ?? process.env.SHOPIFY_SHOP_ID;

  if (!shopifyShopId) {
    console.error(
      'No Shopify Shop ID found. Create a first admin with scripts/create-admin.ts or set SHOPIFY_SHOP_ID.'
    );
    process.exit(1);
  }

  const email = EMAIL.toLowerCase().trim();
  if (!email || !PASSWORD) {
    console.error('Email and password are required');
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (existing) {
    console.error(`Admin user already exists for ${email}`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(PASSWORD);

  const admin = await prisma.adminUser.create({
    data: {
      email,
      password_hash: passwordHash,
      name: NAME || null,
      shopify_shop_id: shopifyShopId,
      role: 'admin',
    },
  });

  console.log('Admin user created successfully.');
  console.log(`ID: ${admin.id}`);
  console.log(`Email: ${admin.email}`);
  console.log(`Shopify Shop ID: ${admin.shopify_shop_id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
