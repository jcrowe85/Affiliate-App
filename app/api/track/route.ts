import { NextRequest, NextResponse } from 'next/server';
import { hashIP, hashUserAgent, generateClickId } from '@/lib/utils';
import { recordClick } from '@/lib/attribution';
import { prisma } from '@/lib/db';

/**
 * Track affiliate click via POST with deduplication
 * 
 * Handles: POST with { ref, shop, landing_url, referrer, user_agent_hint, timestamp }
 * 
 * This endpoint is called client-side from the Shopify theme script
 * when ?ref= parameter is detected on any page.
 * 
 * Features:
 * - Deduplication: Prevents duplicate clicks from same visitor within short window
 * - Bot detection: Filters obvious bots/link scanners
 * - Works on any page without redirects - perfect for affiliate tracking.
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
    
    // Skip tracking for internal traffic markers
    if (affiliateNumberParam === 'internal' || affiliateNumberParam === 'direct') {
      return NextResponse.json(
        { error: 'Internal traffic - no tracking' },
        { status: 400 }
      );
    }
    
    if (!affiliateNumberParam || !shop) {
      return NextResponse.json(
        { error: 'Missing ref parameter or shop' },
        { status: 400 }
      );
    }

    const affiliateNumber = parseInt(affiliateNumberParam, 10);
    if (isNaN(affiliateNumber)) {
      return NextResponse.json(
        { error: 'Invalid affiliate number' },
        { status: 400 }
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
        { status: 400 }
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
      // Use existing click ID (deduplication)
      clickId = recentClick.id;
      console.log(`Deduplicated click: Using existing click ID ${clickId} (within 5 min window)`);
    } else {
      // Generate new click ID
      clickId = generateClickId();
      
      // Record click in database (SERVER-SIDE - always reliable)
      await recordClick({
        clickId,
        affiliateId: affiliate.id,
        linkId: undefined, // Auto-generated link, no specific link_id
        landingUrl,
        ipHash,
        userAgentHash,
        shopifyShopId,
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
      { status: 500 }
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

    // Convert GET to POST format for processing
    const body = {
      ref: parseInt(affiliateNumberParam, 10),
      shop,
      landing_url: searchParams.get('url') || request.headers.get('referer') || '/',
      referrer: request.headers.get('referer') || '',
      user_agent_hint: request.headers.get('user-agent')?.substring(0, 100) || '',
      timestamp: Date.now(),
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
