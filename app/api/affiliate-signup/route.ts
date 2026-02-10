import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Public affiliate signup endpoint
 * Creates a new affiliate account with 'pending' status for admin approval
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      first_name,
      last_name,
      company,
      email,
      paypal_email,
      address_line1,
      address_line2,
      city,
      state,
      zip,
      phone,
      password,
      source,
    } = body;

    // Validate required fields
    if (!first_name || !last_name || !email || !password) {
      return NextResponse.json(
        { error: 'First name, last name, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Get shopify_shop_id from environment
    // For single-tenant: use SHOPIFY_SHOP_ID env var (without .myshopify.com)
    // For multi-tenant: could derive from subdomain or request
    let shopifyShopId = process.env.SHOPIFY_SHOP_ID || '';
    
    // If not in env, try to get from ShopifySession (first active session)
    if (!shopifyShopId) {
      const session = await prisma.shopifySession.findFirst({
        where: {
          access_token: { not: null },
        },
        orderBy: {
          created_at: 'desc',
        },
      });
      
      if (session && session.shop) {
        // Remove .myshopify.com if present
        shopifyShopId = session.shop.replace('.myshopify.com', '');
      }
    }
    
    if (!shopifyShopId) {
      return NextResponse.json(
        { error: 'Shop configuration error. Please contact support.' },
        { status: 500 }
      );
    }

    // Check if email already exists
    const existingAffiliate = await prisma.affiliate.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingAffiliate) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password.trim());

    // Generate name from first and last name
    const name = `${first_name.trim()} ${last_name.trim()}`.trim();

    // Create affiliate with 'pending' status (admin will approve)
    const affiliate = await prisma.affiliate.create({
      data: {
        name,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        company: company?.trim() || null,
        email: email.toLowerCase().trim(),
        paypal_email: paypal_email?.trim() || null,
        address_line1: address_line1?.trim() || null,
        address_line2: address_line2?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip: zip?.trim() || null,
        phone: phone?.trim() || null,
        source: source || 'Public Signup Page',
        password_hash: passwordHash,
        status: 'pending', // Requires admin approval
        shopify_shop_id: shopifyShopId,
        payout_terms_days: 30, // Default Net-30
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. Your account is pending approval.',
      affiliate_id: affiliate.id,
    });
  } catch (error: any) {
    console.error('Affiliate signup error:', error);
    
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }
}
