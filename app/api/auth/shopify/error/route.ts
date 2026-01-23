import { NextRequest, NextResponse } from 'next/server';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * OAuth error page - shows what went wrong
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const error = searchParams.get('error');

  return NextResponse.json({
    success: false,
    error: error || 'Unknown error occurred during OAuth authentication',
    troubleshooting: [
      '1. Check that your SHOPIFY_API_KEY and SHOPIFY_API_SECRET are correct in .env',
      '2. Verify your app is properly configured in Shopify Partners',
      '3. Ensure the redirect URL matches your app configuration',
      '4. Check server logs for detailed error messages',
    ],
  }, { status: 400 });
}