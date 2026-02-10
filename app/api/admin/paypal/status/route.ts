import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { getPayPalPayoutStatus } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

/**
 * Check PayPal payout batch status
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const batchId = searchParams.get('batch_id');

    if (!batchId) {
      return NextResponse.json(
        { error: 'batch_id query parameter is required' },
        { status: 400 }
      );
    }

    const status = await getPayPalPayoutStatus(batchId);

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      status: status.batch_header?.batch_status,
      payout_batch_id: status.batch_header?.payout_batch_id,
      sender_batch_id: status.batch_header?.sender_batch_id,
      amount: status.batch_header?.amount,
      fees: status.batch_header?.fees,
      created_time: status.batch_header?.time_created,
      completed_time: status.batch_header?.time_completed,
      items: status.items?.map((item: any) => ({
        payout_item_id: item.payout_item_id,
        transaction_id: item.transaction_id,
        transaction_status: item.transaction_status,
        payout_item_fee: item.payout_item_fee,
        amount: item.amount,
        receiver: item.receiver,
        note: item.note,
        sender_item_id: item.sender_item_id,
        errors: item.errors,
      })),
    });
  } catch (error: any) {
    console.error('PayPal status check error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check PayPal payout status',
    }, { status: 500 });
  }
}
