import { NextRequest, NextResponse } from 'next/server';
import { hashIP, hashUserAgent, generateClickId } from '@/lib/utils';
import { recordClick } from '@/lib/attribution';
import { prisma } from '@/lib/db';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Track affiliate click via POST with deduplication
 *
 * URL parameter semantics:
 * - ref: Constant. Our affiliate_number, created when we set up the affiliate; passed in the URL
 *        so we know which affiliate the click belongs to.
 * - transaction_id, affiliate_id, sub1, sub2, sub3, sub4: Dynamic. Passed by the affiliate in the
 *        URL (e.g. from their network); can be different every click. Stored per click so the
 *        webhook sends the values from the converting click.
 *
 * Handles: POST with { ref, shop, landing_url, referrer, user_agent_hint, timestamp, ... }
 * This endpoint is called client-side from the Shopify theme script when ?ref= is detected.
 *
 * Features:
 * - Deduplication: Prevents duplicate clicks from same visitor within short window
 * - Bot detection: Filters obvious bots/link scanners
 *
 * Note: ?ref=internal and ?ref=direct are handled separately (no tracking).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const affiliateNumberParam = body.ref?.toString();
    const shop = body.shop || process.env.SHOPIFY_SHOP_ID;
    const landingUrl = body.landing_url || '/';
    const referrer = body.referrer || '';
    const userAgentHint = body.user_agent_hint || '';
    const timestamp = body.timestamp || Date.now();
    
    // All URL params from affiliate link (stored per click for webhook postback)
    const rawUrlParams = body.url_params && typeof body.url_params === 'object' && !Array.isArray(body.url_params) ? body.url_params : null;
    const postbackTransactionId = rawUrlParams?.transaction_id ?? body.transaction_id ?? null;
    const postbackAffiliateId = rawUrlParams?.affiliate_id ?? body.affiliate_id ?? null;
    const postbackSub1 = rawUrlParams?.sub1 ?? body.sub1 ?? null;
    const postbackSub2 = rawUrlParams?.sub2 ?? body.sub2 ?? null;
    const postbackSub3 = rawUrlParams?.sub3 ?? body.sub3 ?? null;
    const postbackSub4 = rawUrlParams?.sub4 ?? body.sub4 ?? null;
    // Normalize url_params to Record<string, string> for storage (only string values)
    const urlParamsForStorage: Record<string, string> | null = rawUrlParams
      ? Object.fromEntries(
          Object.entries(rawUrlParams).filter(([, v]) => v != null && typeof v === 'string' && v !== '')
            .map(([k, v]) => [k, v as string])
        )
      : null;
    
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Skip tracking for internal traffic markers
    if (affiliateNumberParam === 'internal' || affiliateNumberParam === 'direct') {
      return NextResponse.json(
        { error: 'Internal traffic - no tracking' },
        { status: 400, headers: corsHeaders }
      );
    }
    
    if (!affiliateNumberParam || !shop) {
      return NextResponse.json(
        { error: 'Missing ref parameter or shop' },
        { status: 400, headers: corsHeaders }
      );
    }

    const affiliateNumber = parseInt(affiliateNumberParam, 10);
    if (isNaN(affiliateNumber)) {
      return NextResponse.json(
        { error: 'Invalid affiliate number' },
        { status: 400, headers: corsHeaders }
      );
    }

    const shopifyShopId = shop.replace('.myshopify.com', '');

    // Bot detection: Filter obvious bots/link scanners
    const botPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /curl/i, /wget/i, /python/i, /java/i,
      /headless/i, /phantom/i, /selenium/i,
    ];
    
    const userAgent = request.headers.get('user-agent') || userAgentHint || '';
    const isBot = botPatterns.some(pattern => pattern.test(userAgent));
    
    if (isBot && !userAgent.includes('shopify')) {
      // Allow Shopify bots but block others
      return NextResponse.json(
        { error: 'Bot detected - no tracking' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Find affiliate by affiliate_number
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        affiliate_number: affiliateNumber,
        shopify_shop_id: shopifyShopId,
        status: 'active',
      },
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found or inactive' },
        { status: 404 }
      );
    }

    // Update affiliate with postback parameters if provided
    if (postbackTransactionId || postbackAffiliateId || postbackSub1 || postbackSub2 || postbackSub3 || postbackSub4) {
      await prisma.affiliate.update({
        where: { id: affiliate.id },
        data: {
          ...(postbackTransactionId && { postback_transaction_id: postbackTransactionId }),
          ...(postbackAffiliateId && { postback_affiliate_id: postbackAffiliateId }),
          ...(postbackSub1 && { postback_sub1: postbackSub1 }),
          ...(postbackSub2 && { postback_sub2: postbackSub2 }),
          ...(postbackSub3 && { postback_sub3: postbackSub3 }),
          ...(postbackSub4 && { postback_sub4: postbackSub4 }),
        },
      });
    }

    // Get IP and user agent from request
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const fullUserAgent = request.headers.get('user-agent') || userAgent || 'unknown';

    const ipHash = hashIP(ip);
    const userAgentHash = hashUserAgent(fullUserAgent);

    // Deduplication: Check for recent click from same visitor (within 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentClick = await prisma.click.findFirst({
      where: {
        affiliate_id: affiliate.id,
        shopify_shop_id: shopifyShopId,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
        created_at: {
          gte: fiveMinutesAgo,
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    let clickId: string;
    if (recentClick) {
      clickId = recentClick.id;
      console.log(`Deduplicated click: Using existing click ID ${clickId} (within 5 min window)`);
      // Update existing click with latest URL params so we don't lose them when deduplicating
      const hasNewParams = postbackTransactionId || postbackAffiliateId || postbackSub1 || postbackSub2 || postbackSub3 || postbackSub4 || (urlParamsForStorage && Object.keys(urlParamsForStorage).length > 0);
      if (hasNewParams) {
        await prisma.click.update({
          where: { id: clickId },
          data: {
            ...(postbackTransactionId && { url_transaction_id: postbackTransactionId }),
            ...(postbackAffiliateId && { url_affiliate_id: postbackAffiliateId }),
            ...(postbackSub1 && { url_sub1: postbackSub1 }),
            ...(postbackSub2 && { url_sub2: postbackSub2 }),
            ...(postbackSub3 && { url_sub3: postbackSub3 }),
            ...(postbackSub4 && { url_sub4: postbackSub4 }),
            ...(urlParamsForStorage && Object.keys(urlParamsForStorage).length > 0 && { url_params: urlParamsForStorage }),
          },
        });
      }
    } else {
      // Generate new click ID
      clickId = generateClickId();
      
      // Record click in database (SERVER-SIDE - always reliable)
      // Store URL params on this click so webhook sends the params from the converting click
      await recordClick({
        clickId,
        affiliateId: affiliate.id,
        linkId: undefined, // Auto-generated link, no specific link_id
        landingUrl,
        ipHash,
        userAgentHash,
        shopifyShopId,
        urlTransactionId: postbackTransactionId,
        urlAffiliateId: postbackAffiliateId,
        urlSub1: postbackSub1,
        urlSub2: postbackSub2,
        urlSub3: postbackSub3,
        urlSub4: postbackSub4,
        urlParams: Object.keys(urlParamsForStorage || {}).length ? urlParamsForStorage! : undefined,
      });
    }

    // Return success with click ID and affiliate ID for cookie setting
    return NextResponse.json({
      success: true,
      clickId,
      affiliateId: affiliate.id,
      affiliateNumber: affiliate.affiliate_number,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow cross-origin requests from Shopify theme
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    console.error('Track API error:', error);
    return NextResponse.json(
      { error: error.message || 'Tracking failed' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Keep GET handler for backward compatibility (will be deprecated)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const affiliateNumberParam = searchParams.get('ref');
    const shop = searchParams.get('shop') || process.env.SHOPIFY_SHOP_ID;
    
    if (!affiliateNumberParam || !shop) {
      return NextResponse.json(
        { error: 'Missing ref parameter or shop' },
        { status: 400 }
      );
    }

    // Build url_params from all query params except ref, shop (same as Liquid)
    const url_params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key !== 'ref' && key !== 'shop') url_params[key] = value;
    });
    // Convert GET to POST format for processing
    const body = {
      ref: affiliateNumberParam,
      shop,
      landing_url: searchParams.get('url') || request.headers.get('referer') || '/',
      referrer: request.headers.get('referer') || '',
      user_agent_hint: request.headers.get('user-agent')?.substring(0, 100) || '',
      timestamp: Date.now(),
      transaction_id: searchParams.get('transaction_id') || null,
      affiliate_id: searchParams.get('affiliate_id') || null,
      sub1: searchParams.get('sub1') || null,
      sub2: searchParams.get('sub2') || null,
      sub3: searchParams.get('sub3') || null,
      sub4: searchParams.get('sub4') || null,
      url_params: Object.keys(url_params).length ? url_params : null,
    };

    // Create a new request-like object for POST handler
    const postRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body),
    });

    return POST(postRequest);
  } catch (error: any) {
    console.error('Track API GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Tracking failed' },
      { status: 500 }
    );
  }
}
