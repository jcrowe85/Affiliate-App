import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Resolve fraud flag (mark as resolved)
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fraudFlagId } = await request.json();

    if (!fraudFlagId) {
      return NextResponse.json(
        { error: 'fraudFlagId is required' },
        { status: 400 }
      );
    }

    await prisma.fraudFlag.update({
      where: { id: fraudFlagId },
      data: {
        resolved: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Fraud flag resolved',
    });
  } catch (error: any) {
    console.error('Error resolving fraud flag:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resolve fraud flag' },
      { status: 500 }
    );
  }
}