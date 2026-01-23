'use client';

import { useState, useEffect } from 'react';

/**
 * Browser-side tracking debug component
 * Shows cookies, sessionStorage, and cart attributes
 */
export default function TrackingDebug() {
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    // Get cookies
    function getCookie(name: string): string | null {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
      return null;
    }

    // Get URL parameters
    function getUrlParams(): Record<string, string> {
      const params: Record<string, string> = {};
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.forEach((value, key) => {
        params[key] = value;
      });
      return params;
    }

    // Get sessionStorage
    const sessionStorageData: Record<string, string | null> = {};
    try {
      sessionStorageData.affiliate_click_id = sessionStorage.getItem('affiliate_click_id');
      sessionStorageData.affiliate_id = sessionStorage.getItem('affiliate_id');
    } catch (e) {
      // sessionStorage might not be available
    }

    // Get cookies
    const cookies: Record<string, string | null> = {};
    cookies.affiliate_click_id = getCookie('affiliate_click_id');
    cookies.affiliate_id = getCookie('affiliate_id');

    // Get URL parameters
    const urlParams = getUrlParams();

    // Get cart attributes (if Shopify is available)
    let cartAttributes: any = null;
    if (typeof window !== 'undefined' && (window as any).Shopify) {
      // Try to get cart attributes
      fetch('/cart.js')
        .then(res => res.json())
        .then(cart => {
          cartAttributes = cart.attributes || {};
          setDebugInfo({
            cookies,
            sessionStorage: sessionStorageData,
            urlParams,
            cartAttributes,
            currentUrl: window.location.href,
          });
        })
        .catch(() => {
          setDebugInfo({
            cookies,
            sessionStorage: sessionStorageData,
            urlParams,
            cartAttributes: null,
            currentUrl: window.location.href,
          });
        });
    } else {
      setDebugInfo({
        cookies,
        sessionStorage: sessionStorageData,
        urlParams,
        cartAttributes: null,
        currentUrl: window.location.href,
      });
    }
  }, []);

  if (!debugInfo) {
    return <div className="p-4">Loading debug info...</div>;
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Tracking Debug Info</h3>
      
      <div className="space-y-4">
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Current URL</h4>
          <code className="text-xs bg-gray-100 p-2 rounded block break-all">
            {debugInfo.currentUrl}
          </code>
        </div>

        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">URL Parameters</h4>
          {Object.keys(debugInfo.urlParams).length > 0 ? (
            <pre className="text-xs bg-gray-100 p-2 rounded">
              {JSON.stringify(debugInfo.urlParams, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-500">No URL parameters found</p>
          )}
        </div>

        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Cookies</h4>
          {debugInfo.cookies.affiliate_click_id || debugInfo.cookies.affiliate_id ? (
            <pre className="text-xs bg-gray-100 p-2 rounded">
              {JSON.stringify(debugInfo.cookies, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-500">No affiliate tracking cookies found</p>
          )}
        </div>

        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Session Storage</h4>
          {debugInfo.sessionStorage.affiliate_click_id || debugInfo.sessionStorage.affiliate_id ? (
            <pre className="text-xs bg-gray-100 p-2 rounded">
              {JSON.stringify(debugInfo.sessionStorage, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-500">No affiliate tracking in sessionStorage</p>
          )}
        </div>

        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Cart Attributes</h4>
          {debugInfo.cartAttributes ? (
            Object.keys(debugInfo.cartAttributes).length > 0 ? (
              <pre className="text-xs bg-gray-100 p-2 rounded">
                {JSON.stringify(debugInfo.cartAttributes, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">No cart attributes found</p>
            )
          ) : (
            <p className="text-sm text-gray-500">Cart not accessible (not on Shopify store)</p>
          )}
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-blue-800">
          <strong>How to use:</strong> Add <code className="bg-blue-100 px-1 rounded">?ref=YOUR_AFFILIATE_NUMBER</code> to any URL (e.g., <code className="bg-blue-100 px-1 rounded">https://tryfleur.com/?ref=30843</code>)
        </p>
      </div>
    </div>
  );
}
