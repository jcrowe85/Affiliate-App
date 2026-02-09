import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to protect admin routes and handle Shopify OAuth
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Always allow API routes (OAuth, webhooks, etc.)
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Always allow login pages
  if (pathname.startsWith('/login') || pathname.startsWith('/affiliate/login')) {
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