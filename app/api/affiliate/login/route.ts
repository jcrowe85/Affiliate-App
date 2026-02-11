import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createAffiliateSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Affiliate login endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find affiliate
    const affiliate = await prisma.affiliate.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if affiliate is active
    if (affiliate.status !== 'active') {
      return NextResponse.json(
        { error: 'Your account is not active. Please contact support.' },
        { status: 403 }
      );
    }

    // Check if affiliate has a password set
    if (!affiliate.password_hash) {
      return NextResponse.json(
        { error: 'No password set. Please contact support to set up your account.' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, affiliate.password_hash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create session
    const sessionToken = await createAffiliateSession(affiliate.id);

    // Set cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: affiliate.id,
        email: affiliate.email,
        name: affiliate.name,
        affiliate_number: affiliate.affiliate_number,
      },
    });

    const cookieStore = await cookies();
    cookieStore.set('affiliate_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Affiliate login error:', error);
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}
