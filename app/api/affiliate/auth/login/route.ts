import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createAffiliateSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Affiliate login endpoint
 * SECURITY: Only allows active affiliates to log in
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

    // Find affiliate by email
    const affiliate = await prisma.affiliate.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!affiliate) {
      // Don't reveal if email exists or not (security best practice)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // SECURITY: Check if affiliate has a password set
    if (!affiliate.password_hash) {
      return NextResponse.json(
        { error: 'Account not set up. Please contact support.' },
        { status: 401 }
      );
    }

    // SECURITY: Only allow active affiliates to log in
    if (affiliate.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is not active. Please contact support.' },
        { status: 403 }
      );
    }

    // Verify password (trim to handle any whitespace issues)
    const trimmedPassword = password.trim();
    console.log('[Affiliate Login] Attempting login for:', email.toLowerCase());
    console.log('[Affiliate Login] Password length:', trimmedPassword.length);
    console.log('[Affiliate Login] Hash exists:', !!affiliate.password_hash);
    console.log('[Affiliate Login] Hash length:', affiliate.password_hash?.length || 0);
    
    const isValid = await verifyPassword(trimmedPassword, affiliate.password_hash);
    
    console.log('[Affiliate Login] Password verification result:', isValid);
    
    if (!isValid) {
      console.log('[Affiliate Login] Password verification failed for:', email.toLowerCase());
      // Try to verify with the raw password (in case trimming is the issue)
      const rawIsValid = await verifyPassword(password, affiliate.password_hash);
      console.log('[Affiliate Login] Raw password verification result:', rawIsValid);
    }

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
      path: '/',
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
