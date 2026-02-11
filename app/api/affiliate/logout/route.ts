import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAffiliate, deleteAffiliateSession } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Affiliate logout endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const affiliate = await getCurrentAffiliate();
    
    if (affiliate) {
      const cookieStore = await cookies();
      const sessionToken = cookieStore.get('affiliate_session')?.value;
      
      if (sessionToken) {
        await deleteAffiliateSession(sessionToken);
      }
    }

    const response = NextResponse.json({ success: true });
    const cookieStore = await cookies();
    cookieStore.delete('affiliate_session');

    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: error.message || 'Logout failed' },
      { status: 500 }
    );
  }
}
