import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';

/**
 * Debug endpoint to capture raw webhook data from Shopify
 * This helps verify what Shopify is actually sending vs what we're calculating
 *
 * Requires an admin session — it echoes the full request body and headers back,
 * so it must never be open. Note this means Shopify can't post here directly;
 * it's for replaying a captured webhook by hand, not for live traffic.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Read raw body
    const body = await request.text();
    const hmac = request.headers.get('x-shopify-hmac-sha256');
    const topic = request.headers.get('x-shopify-topic');
    const shop = request.headers.get('x-shopify-shop-domain');
    
    // Get all headers for debugging
    const allHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      allHeaders[key] = value;
    });
    
    // Get secret
    const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_WEBHOOK_SECRET;
    
    // Calculate HMAC
    let calculatedHmac = '';
    if (secret) {
      const crypto = require('crypto');
      calculatedHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');
    }
    
    // Parse body to get app_id
    let parsedBody: any = null;
    let appId: number | null = null;
    try {
      parsedBody = JSON.parse(body);
      appId = parsedBody.app_id || null;
    } catch (e) {
      // Body parse failed, ignore
    }
    
    // Create capture data
    const captureData = {
      timestamp: new Date().toISOString(),
      shop,
      topic,
      isTestWebhook: allHeaders['x-shopify-test'] === 'true',
      appId: appId,
      headers: allHeaders,
      shopifyHmac: hmac,
      ourCalculatedHmac: calculatedHmac,
      hmacMatch: hmac === calculatedHmac,
      bodyLength: body.length,
      bodyPreview: {
        first200: body.substring(0, 200),
        last200: body.substring(Math.max(0, body.length - 200)),
        full: body, // Full body for analysis
      },
      secretInfo: {
        // Only whether it's configured. The previous `preview` field returned
        // the first 10 and last 5 characters of SHOPIFY_API_SECRET in the HTTP
        // response — which told an attacker the signing secret's length and
        // both ends of it. Whether HMAC matches is the only useful signal here.
        isSet: !!secret,
      },
      analysis: {
        isTestWebhook: allHeaders['x-shopify-test'] === 'true',
        appIdFromBody: appId,
        note: appId === null 
          ? '⚠️ Test webhook - app_id is null. Test webhooks may use different verification.'
          : `✅ Real webhook from app_id: ${appId}. Check if this matches your app in Shopify Partners.`,
      },
    };
    
    // Log to console
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 WEBHOOK CAPTURE DEBUG ENDPOINT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(JSON.stringify(captureData, null, 2));
    console.log('═══════════════════════════════════════════════════════════');
    
    // Return captured data
    return NextResponse.json({
      success: true,
      message: 'Webhook data captured - check server logs for full details',
      capture: captureData,
    });
  } catch (error: any) {
    console.error('Webhook capture error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
