import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { testPayPalConnection } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

/**
 * Test PayPal API connection and credentials
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await testPayPalConnection();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        details: result.details,
        environment: process.env.PAYPAL_MODE || 'sandbox',
        client_id_configured: !!process.env.PAYPAL_CLIENT_ID,
        client_secret_configured: !!process.env.PAYPAL_CLIENT_SECRET,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.message,
        details: result.details,
        environment: process.env.PAYPAL_MODE || 'sandbox',
        client_id_configured: !!process.env.PAYPAL_CLIENT_ID,
        client_secret_configured: !!process.env.PAYPAL_CLIENT_SECRET,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('PayPal test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to test PayPal connection',
      environment: process.env.PAYPAL_MODE || 'sandbox',
      client_id_configured: !!process.env.PAYPAL_CLIENT_ID,
      client_secret_configured: !!process.env.PAYPAL_CLIENT_SECRET,
    }, { status: 500 });
  }
}
