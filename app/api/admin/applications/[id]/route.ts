import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Reject an application. Approval is not handled here — it happens through
 * POST /api/admin/affiliates with an application_id, which creates the
 * affiliate and marks the application approved in one transaction.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status } = await request.json();
    if (status !== 'rejected') {
      return NextResponse.json(
        { error: 'Only rejection is supported here. Approve via the affiliate form.' },
        { status: 400 }
      );
    }

    const application = await prisma.affiliateApplication.findFirst({
      where: { id: params.id, shopify_shop_id: admin.shopify_shop_id },
    });
    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    if (application.status !== 'pending') {
      return NextResponse.json(
        { error: `This application was already ${application.status}` },
        { status: 400 }
      );
    }

    await prisma.affiliateApplication.update({
      where: { id: params.id },
      data: { status: 'rejected', reviewed_at: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[applications] Failed to reject application:', error);
    return NextResponse.json(
      { error: 'Failed to reject application' },
      { status: 500 }
    );
  }
}
