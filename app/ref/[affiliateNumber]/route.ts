import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashIP, hashUserAgent, generateClickId } from '@/lib/utils';
import { recordClick } from '@/lib/attribution';

/**
 * Automatic referral link handler (Refersion-style)
 * 
 * Single URL for affiliates: yoursite.com/ref/30483
 * 
 * This automatically:
 * 1. Finds affiliate by affiliate_number
 * 2. Records the click
 * 3. Sets tracking cookies (30-day session)
 * 4. Redirects to homepage (or optional destination)
 * 
 * The tracking cookies persist for 30 days, so any purchase
 * made during that time will be attributed to the affiliate.
 * 
 * Optional: Add ?url=/products/serum to redirect to specific page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { affiliateNumber: string } }
) {
  try {
    const affiliateNumber = parseInt(params.affiliateNumber, 10);
    const searchParams = request.nextUrl.searchParams;
    
    // Optional: Allow custom destination URL, but default to homepage
    // This way affiliates can use: /ref/30483 or /ref/30483?url=/products/serum
    const destinationUrl = searchParams.get('url') || searchParams.get('destination') || '/';
    
    // Get shop from query param or environment (for multi-shop support)
    const shop = searchParams.get('shop') || process.env.SHOPIFY_SHOP_ID;

    if (!shop || isNaN(affiliateNumber)) {
      // Invalid request, redirect to home
      return NextResponse.redirect(new URL('/', request.url));
    }

    const shopifyShopId = shop.replace('.myshopify.com', '');

    // Find affiliate by affiliate_number
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        affiliate_number: affiliateNumber,
        shopify_shop_id: shopifyShopId,
        status: 'active',
      },
    });

    if (!affiliate) {
      // Affiliate not found or inactive, redirect to homepage without tracking
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Generate click ID
    const clickId = generateClickId();

    // Get IP and user agent
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const ipHash = hashIP(ip);
    const userAgentHash = hashUserAgent(userAgent);

    // Record click in database (SERVER-SIDE - always reliable)
    // This creates a permanent record even if cookies fail
    await recordClick({
      clickId,
      affiliateId: affiliate.id,
      linkId: undefined, // Auto-generated link, no specific link_id
      landingUrl: destinationUrl,
      ipHash,
      userAgentHash,
      shopifyShopId,
    });

    // Also store in URL parameter as backup (most reliable method)
    // This ensures tracking works even if cookies are blocked
    // URL parameters are always available server-side
    const urlWithTracking = new URL(destinationUrl, request.url);
    urlWithTracking.searchParams.set('ref', params.affiliateNumber.toString());
    urlWithTracking.searchParams.set('click_id', clickId);
    const finalDestination = urlWithTracking.toString();

    // Set cookies for tracking (30 days)
    // These cookies will persist across the entire site, so any purchase
    // made within 30 days will be attributed to this affiliate
    // NOTE: Cookies are a convenience, but we also have server-side click logging
    // and URL parameters as backup methods
    const response = NextResponse.redirect(new URL(finalDestination, request.url));
    response.cookies.set('affiliate_click_id', clickId, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: false, // Needs to be accessible to Shopify checkout
      sameSite: 'lax',
      path: '/',
    });
    response.cookies.set('affiliate_id', affiliate.id, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Referral link error:', error);
    // Even if tracking fails, redirect to homepage
    return NextResponse.redirect(new URL('/', request.url));
  }
}
