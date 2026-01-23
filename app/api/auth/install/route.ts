import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Shopify app installation endpoint
 * Initiates OAuth flow by building the OAuth URL manually
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const shop = searchParams.get('shop');

  if (!shop) {
    return NextResponse.json(
      { error: 'Missing shop parameter. Make sure you select a store in Shopify.' },
      { status: 400 }
    );
  }

  // Validate shop format
  let shopDomain = shop;
  
  // Reject null or invalid shop values
  if (shop === 'null' || !shop || shop.trim() === '') {
    return NextResponse.json(
      { error: 'Invalid shop parameter' },
      { status: 400 }
    );
  }
  
  if (!shop.includes('.myshopify.com')) {
    shopDomain = shop.includes('.') ? shop : `${shop}.myshopify.com`;
    if (!shopDomain.endsWith('.myshopify.com')) {
      shopDomain = `${shopDomain}.myshopify.com`;
    }
  }

  try {
    console.log(`🚀 Initiating OAuth flow for shop: ${shopDomain}`);
    
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    const scopes = process.env.SHOPIFY_SCOPES || 'read_products,write_orders,read_orders';

    if (!apiKey || !apiSecret) {
      throw new Error('SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be set in environment variables');
    }

    // Build app URL from request if not in environment
    let appUrl = process.env.SHOPIFY_APP_URL;
    
    // Ignore invalid/undefined environment variable values
    if (!appUrl || appUrl.includes('undefined') || appUrl.trim() === '') {
      // Derive from request - use origin which handles protocol + host
      const origin = request.nextUrl.origin;
      if (origin && origin !== 'null') {
        appUrl = origin;
      } else {
        // Fallback: construct from headers
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const host = request.headers.get('host') || 'localhost:3000';
        appUrl = `${protocol}://${host}`;
      }
    }

    // Ensure no trailing slash
    appUrl = appUrl.replace(/\/$/, '');

    console.log(`📡 Using app URL: ${appUrl}`);
    console.log(`   Environment SHOPIFY_APP_URL: ${process.env.SHOPIFY_APP_URL || 'NOT SET'}`);
    console.log(`   Request origin: ${request.nextUrl.origin}`);
    console.log(`   Request host: ${request.headers.get('host')}`);

    // Build OAuth URL manually
    const redirectUri = `${appUrl}/api/auth/shopify`;
    const state = crypto.randomBytes(16).toString('hex');
    
    console.log(`🔗 Redirect URI being sent to Shopify: "${redirectUri}"`);
    console.log(`   ⚠️  This MUST exactly match what's in Shopify Partners`);
    console.log(`   ⚠️  Expected in Shopify: "http://localhost:3000/api/auth/shopify"`);
    
    // Store state in cookie for verification later (optional but recommended)
    const oauthUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    oauthUrl.searchParams.set('client_id', apiKey);
    oauthUrl.searchParams.set('scope', scopes);
    oauthUrl.searchParams.set('redirect_uri', redirectUri); // This will be URL-encoded automatically
    oauthUrl.searchParams.set('state', state);

    console.log(`✅ Redirecting to Shopify OAuth`);
    console.log(`   Full OAuth URL: ${oauthUrl.toString()}`);
    console.log(`   Redirect URI param (URL-encoded): ${oauthUrl.searchParams.get('redirect_uri')}`);
    
    const response = NextResponse.redirect(oauthUrl.toString());
    
    // Store state in cookie for verification (optional)
    response.cookies.set('shopify_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });
    
    return response;
  } catch (error: any) {
    console.error('❌ Shopify install error:', error);
    
    // Return detailed error for debugging
    return NextResponse.json(
      { 
        error: error.message || 'Installation failed',
        details: error.stack,
        shop: shopDomain,
      },
      { status: 500 }
    );
  }
}