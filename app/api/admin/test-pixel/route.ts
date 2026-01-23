import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';

/**
 * Test if affiliate tracking pixel is active on a target URL
 * 
 * This endpoint:
 * 1. Fetches the target URL
 * 2. Checks for the affiliate tracking script
 * 3. Checks for tracking cookies
 * 4. Returns results
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    let testUrl: URL;
    try {
      testUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Only allow testing URLs from the same domain or Shopify domains
    const allowedDomains = [
      'tryfleur.com',
      'myshopify.com',
      'shopify.com',
    ];

    const isAllowedDomain = allowedDomains.some(domain => 
      testUrl.hostname.includes(domain)
    );

    if (!isAllowedDomain) {
      return NextResponse.json(
        { error: 'URL must be from an allowed domain (tryfleur.com, myshopify.com, shopify.com)' },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    let scriptFound = false;
    let scriptContent: string | null = null;
    const cookiesDetected: string[] = [];

    try {
      // Fetch the page
      const response = await fetch(testUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        errors.push(`Failed to fetch page: ${response.status} ${response.statusText}`);
        return NextResponse.json({
          success: false,
          scriptFound: false,
          scriptContent: null,
          cookiesDetected: [],
          errors,
        });
      }

      const html = await response.text();

      // Check for affiliate tracking script
      // Look for various patterns that indicate the script is present
      const scriptPatterns = [
        /affiliate.*tracking/i,
        /TRACKING_API_URL/i,
        /affiliate_click_id/i,
        /getUrlParameter.*ref/i,
        /ref=.*affiliate/i,
        /render.*affiliate-tracking/i,
      ];

      // Find script tags that might contain our tracking code
      const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
      
      for (const scriptTag of scriptMatches) {
        // Check if this script matches our tracking patterns
        const matchesPattern = scriptPatterns.some(pattern => pattern.test(scriptTag));
        
        if (matchesPattern) {
          scriptFound = true;
          // Extract script content (first 1000 chars)
          const contentMatch = scriptTag.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
          if (contentMatch && contentMatch[1]) {
            scriptContent = contentMatch[1].trim().substring(0, 1000);
          }
          break;
        }
      }

      // Check for snippet render (Shopify snippet pattern)
      if (html.includes('affiliate-tracking') || html.includes('affiliate_tracking')) {
        scriptFound = true;
        if (!scriptContent) {
          scriptContent = 'Script detected via snippet render (affiliate-tracking)';
        }
      }

      // Check for cookies in Set-Cookie headers
      const setCookieHeaders = response.headers.getSetCookie();
      for (const cookieHeader of setCookieHeaders) {
        const cookieMatch = cookieHeader.match(/([^=;]+)=/);
        if (cookieMatch) {
          const cookieName = cookieMatch[1];
          if (cookieName.includes('affiliate') || cookieName.includes('ref')) {
            cookiesDetected.push(cookieName);
          }
        }
      }

      // Check for cookie-related code in HTML
      if (html.includes('affiliate_click_id') || html.includes('affiliate_id')) {
        if (!cookiesDetected.includes('affiliate_click_id')) {
          cookiesDetected.push('affiliate_click_id (detected in code)');
        }
        if (!cookiesDetected.includes('affiliate_id')) {
          cookiesDetected.push('affiliate_id (detected in code)');
        }
      }

      // Additional checks
      if (!scriptFound) {
        errors.push('Tracking script not found in page HTML');
        errors.push('Make sure the script is added to theme.liquid or as a snippet');
      }

      if (scriptFound && scriptContent && scriptContent.includes('your-app-domain.com')) {
        errors.push('Script contains placeholder URL - update TRACKING_API_URL with your actual app domain');
      }

      if (scriptFound && !scriptContent?.includes('TRACKING_API_URL')) {
        errors.push('Script found but may not be the correct version - check for TRACKING_API_URL');
      }

      return NextResponse.json({
        success: scriptFound,
        scriptFound,
        scriptContent,
        cookiesDetected,
        errors,
      });
    } catch (fetchError: any) {
      errors.push(`Error fetching page: ${fetchError.message}`);
      return NextResponse.json({
        success: false,
        scriptFound: false,
        scriptContent: null,
        cookiesDetected: [],
        errors,
      });
    }
  } catch (error: any) {
    console.error('Test pixel error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to test pixel' },
      { status: 500 }
    );
  }
}
