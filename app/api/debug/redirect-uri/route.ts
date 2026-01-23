import { NextRequest, NextResponse } from 'next/server';

/**
 * Debug endpoint to show what redirect URI will be used
 */
export async function GET(request: NextRequest) {
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
  const redirectUri = `${appUrl}/api/auth/shopify`;

  return NextResponse.json({
    message: 'Debug: Redirect URI that will be sent to Shopify',
    redirect_uri: redirectUri,
    app_url: appUrl,
    environment_variable: process.env.SHOPIFY_APP_URL || 'NOT SET',
    request_origin: request.nextUrl.origin,
    request_host: request.headers.get('host'),
    request_protocol: request.headers.get('x-forwarded-proto') || 'http',
    instructions: {
      step1: 'Fix your .env file - SHOPIFY_APP_URL is set to "https://undefined"',
      step2: 'Either remove SHOPIFY_APP_URL or set it to "http://localhost:3000"',
      step3: 'After fixing, restart your dev server',
      step4: 'Visit this debug endpoint again to verify',
      step5: 'Copy the redirect_uri value and add to Shopify Partners',
      step6: 'Make sure there are no extra spaces or characters',
      step7: 'Save and wait 30 seconds before trying OAuth again',
    },
    fix_needed: process.env.SHOPIFY_APP_URL && process.env.SHOPIFY_APP_URL.includes('undefined') 
      ? '⚠️ SHOPIFY_APP_URL in .env is set to "https://undefined" - remove it or set to "http://localhost:3000"'
      : null,
  }, { status: 200 });
}