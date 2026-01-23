import { NextRequest, NextResponse } from 'next/server';
import { deleteAdminSession } from '@/lib/auth';
import { cookies } from 'next/headers';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Admin logout endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('admin_session')?.value;

    if (sessionToken) {
      await deleteAdminSession(sessionToken);
    }

    const response = NextResponse.json({ success: true });
    cookieStore.delete('admin_session');

    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: error.message || 'Logout failed' },
      { status: 500 }
    );
  }
}