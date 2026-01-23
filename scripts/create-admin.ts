/**
 * Script to create initial admin user
 * Run: npx tsx scripts/create-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function main() {
  console.log('Create Admin User\n');

  const email = await question('Email: ');
  const password = await question('Password: ');
  const name = await question('Name (optional): ');
  const shopifyShopId = await question('Shopify Shop ID (e.g., yourstore): ');

  if (!email || !password || !shopifyShopId) {
    console.error('Email, password, and Shopify Shop ID are required');
    process.exit(1);
  }

  // Check if admin already exists
  const existing = await prisma.adminUser.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existing) {
    console.error('Admin user already exists');
    process.exit(1);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create admin user
  const admin = await prisma.adminUser.create({
    data: {
      email: email.toLowerCase(),
      password_hash: passwordHash,
      name: name || null,
      shopify_shop_id: shopifyShopId,
      role: 'admin',
    },
  });

  console.log('\n✅ Admin user created successfully!');
  console.log(`ID: ${admin.id}`);
  console.log(`Email: ${admin.email}`);
  console.log(`Shopify Shop ID: ${admin.shopify_shop_id}`);

  rl.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });