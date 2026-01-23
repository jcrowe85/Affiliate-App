import { NextRequest, NextResponse } from 'next/server';
import { shopify } from '@/lib/shopify';
import { prisma } from '@/lib/db';
import { createAppWebhooks } from '@/lib/webhooks';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Shopify OAuth callback handler
 * Receives the authorization code and exchanges it for access tokens
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const shop = searchParams.get('shop');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!shop || !code) {
    return NextResponse.json(
      { error: 'Missing shop or code parameter' },
      { status: 400 }
    );
  }

  try {
    console.log(`🔄 OAuth callback received!`);
    console.log(`   Shop: ${shop}`);
    console.log(`   Code: ${code ? 'present' : 'missing'}`);
    console.log(`   State: ${state || 'none'}`);
    console.log(`   Full URL: ${request.url}`);
    console.log(`🔄 Exchanging authorization code for access token...`);
    
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error('SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be set');
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

    console.log(`📡 Using app URL for token exchange: ${appUrl}`);

    // Exchange authorization code for access token
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to exchange code for token: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('No access token in response');
    }

    const accessToken = tokenData.access_token;
    const scope = tokenData.scope || '';

    console.log('✅ OAuth callback successful - Admin access token received');
    console.log(`   Admin Token: ${accessToken.substring(0, 15)}...`);

    // Get Storefront API access token from environment
    // Note: Storefront tokens are typically generated separately in Shopify Admin
    const storefrontAccessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || null;

    // Generate session ID (Shopify format: offline_{shop})
    const sessionId = `offline_${shop}`;

    // Store session and tokens in database
    await prisma.shopifySession.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        shop: shop,
        state: state || null,
        is_online: false,
        scope: scope,
        expires: null, // Offline tokens don't expire
        access_token: accessToken,
        storefront_access_token: storefrontAccessToken,
      },
      update: {
        state: state || null,
        is_online: false,
        scope: scope,
        expires: null,
        access_token: accessToken,
        storefront_access_token: storefrontAccessToken || null,
      },
    });

    console.log('✅ Tokens stored in database successfully!');
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Shop: ${shop}`);
    console.log(`   Admin Token: ${accessToken.substring(0, 10)}...`);

    // Verify it was actually saved
    const verifySession = await prisma.shopifySession.findUnique({
      where: { id: sessionId },
    });
    
    if (verifySession && verifySession.access_token) {
      console.log(`✅ Verification: Token confirmed in database`);
    } else {
      console.error(`❌ Verification failed: Token not found in database`);
      throw new Error('Token was not saved to database');
    }

    // Create app-level webhooks (these use the app's Client secret for HMAC)
    // Use HTTPS URL for webhooks (Cloudflare Tunnel or production URL)
    const webhookUrl = process.env.CLOUDFLARE_TUNNEL_URL || 
                       (appUrl.startsWith('https://') ? appUrl : null);
    
    if (webhookUrl && webhookUrl.startsWith('https://')) {
      try {
        const webhookResult = await createAppWebhooks(shop, accessToken, webhookUrl);
      if (webhookResult.success) {
        console.log(`✅ App-level webhooks created successfully!`);
        console.log(`   Created: ${webhookResult.created.join(', ')}`);
      } else {
        console.warn(`⚠️  Some webhooks failed to create:`);
        console.warn(`   Errors: ${webhookResult.errors.join(', ')}`);
        // Don't fail OAuth if webhook creation fails - webhooks can be created manually
      }
      } catch (webhookError: any) {
        console.error(`⚠️  Webhook creation failed (non-fatal):`, webhookError.message);
        // Don't fail OAuth if webhook creation fails - webhooks can be created manually
      }
    } else {
      console.warn('⚠️  Skipping webhook creation: HTTPS URL required');
      console.warn('   Set CLOUDFLARE_TUNNEL_URL in .env with your Cloudflare Tunnel URL');
      console.warn('   Example: CLOUDFLARE_TUNNEL_URL=https://abc123.trycloudflare.com');
      console.warn('   Or create webhooks manually in Shopify Partners → Your App → Webhooks');
    }

    // Redirect to success page or app home
    // You can customize this redirect URL
    const redirectUrl = new URL('/api/auth/shopify/success', request.url);
    redirectUrl.searchParams.set('shop', shop);
    console.log(`✅ Redirecting to success page: ${redirectUrl.toString()}`);
    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    console.error('❌ Shopify OAuth error:', error);
    
    // Redirect to error page
    const errorUrl = new URL('/api/auth/shopify/error', request.url);
    errorUrl.searchParams.set('error', error.message || 'OAuth authentication failed');
    return NextResponse.redirect(errorUrl);
  }
}