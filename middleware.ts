import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to protect admin routes and handle Shopify OAuth
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Debug endpoints expose session and config internals, so they require an
  // admin session. Enforced here rather than per-route: /api/debug/get-token
  // called getCurrentAdmin(), ignored the result, and served the shop's full
  // Shopify access token to anyone who asked. A central gate can't be opted out
  // of by forgetting to check a return value.
  // Cookie presence only — routes still validate the session properly.
  if (pathname.startsWith('/api/debug')) {
    if (!request.cookies.get('admin_session')?.value) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  // Always allow API routes (OAuth, webhooks, etc.)
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Always allow login pages and public marketing pages.
  // NOTE: /apply must be matched here — it is a public page, but it would
  // otherwise be caught by the `pathname.startsWith('/app')` admin guard below.
  if (pathname.startsWith('/login') ||
      pathname.startsWith('/affiliate/login') ||
      pathname.startsWith('/affiliates/login') ||
      pathname === '/affiliates' ||
      pathname === '/affiliate' ||
      pathname === '/apply') {
    return NextResponse.next();
  }

  // Check if this is a Shopify OAuth redirect (has shop parameter)
  const shop = searchParams.get('shop');
  // Only redirect to OAuth if shop is present and valid (not null or empty)
  if (shop && shop !== 'null' && shop.trim() !== '' && (pathname === '/' || pathname === '/app')) {
    // Redirect to OAuth install endpoint
    const installUrl = new URL('/api/auth/install', request.url);
    installUrl.searchParams.set('shop', shop);
    
    // Preserve hmac if present
    const hmac = searchParams.get('hmac');
    if (hmac) {
      installUrl.searchParams.set('hmac', hmac);
    }
    
    return NextResponse.redirect(installUrl);
  }

  // Protect admin routes (everything under /app except public assets)
  if (pathname.startsWith('/app')) {
    const sessionToken = request.cookies.get('admin_session')?.value;

    // If no session, redirect to login
    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect affiliate routes (everything under /affiliate or /affiliates except public pages)
  // Public pages are already handled above: /affiliates, /affiliate, and login pages
  if (pathname.startsWith('/affiliate') || pathname.startsWith('/affiliates')) {
    const sessionToken = request.cookies.get('affiliate_session')?.value;

    // If no session, redirect to affiliate login
    if (!sessionToken) {
      const loginUrl = new URL('/affiliates/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
