import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Create initial admin user (run once to setup)
 * TODO: Remove or protect this route in production
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, name, shopifyShopId } = await request.json();

    if (!email || !password || !shopifyShopId) {
      return NextResponse.json(
        { error: 'Email, password, and shopifyShopId are required' },
        { status: 400 }
      );
    }

    // Check if admin already exists
    const existing = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Admin user already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

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

    return NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
    });
  } catch (error: any) {
    console.error('Create admin error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create admin user' },
      { status: 500 }
    );
  }
}