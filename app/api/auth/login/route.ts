import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createAdminSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

/**
 * Admin login endpoint (standalone, not Shopify OAuth)
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

    // Find admin user
    const admin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!admin) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, admin.password_hash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create session
    const sessionToken = await createAdminSession(admin.id);

    // Set cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
    });

    const cookieStore = await cookies();
    cookieStore.set('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}