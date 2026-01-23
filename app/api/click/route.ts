import { NextRequest, NextResponse } from 'next/server';
import { hashIP, hashUserAgent, extractClickId, generateClickId } from '@/lib/utils';
import { recordClick } from '@/lib/attribution';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Track affiliate click and set cookie/cart attributes
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const affiliateId = searchParams.get('affiliate_id');
    const linkId = searchParams.get('link_id');
    const landingUrl = searchParams.get('url') || request.headers.get('referer') || '';
    const shop = searchParams.get('shop');

    if (!affiliateId || !shop) {
      return NextResponse.json(
        { error: 'Missing affiliate_id or shop' },
        { status: 400 }
      );
    }

    // Verify affiliate exists and is active
    const shopifyShopId = shop.replace('.myshopify.com', '');
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        id: affiliateId,
        shopify_shop_id: shopifyShopId,
        status: 'active',
      },
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Invalid affiliate' },
        { status: 404 }
      );
    }

    // Get or generate click ID
    let clickId = extractClickId(Object.fromEntries(searchParams));
    if (!clickId) {
      clickId = generateClickId();
    }

    // Get IP and user agent
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const ipHash = hashIP(ip);
    const userAgentHash = hashUserAgent(userAgent);

    // Record click
    await recordClick({
      clickId,
      affiliateId,
      linkId: linkId || undefined,
      landingUrl,
      ipHash,
      userAgentHash,
      shopifyShopId,
    });

    // Set cookie for click tracking (30 days)
    const response = NextResponse.redirect(landingUrl || searchParams.get('destination') || '/');
    response.cookies.set('affiliate_click_id', clickId, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: false, // Needs to be accessible to Shopify checkout
      sameSite: 'lax',
    });
    response.cookies.set('affiliate_id', affiliateId, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: false,
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    console.error('Click tracking error:', error);
    // Even if tracking fails, redirect to destination
    const landingUrl = request.nextUrl.searchParams.get('url') || 
                       request.nextUrl.searchParams.get('destination') || 
                       '/';
    return NextResponse.redirect(landingUrl);
  }
}