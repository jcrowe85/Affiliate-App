'use client';

import { useState } from 'react';
import TrackingDebug from './TrackingDebug';

interface TestResult {
  url: string;
  success: boolean;
  scriptFound: boolean;
  scriptContent: string | null;
  cookiesDetected: string[];
  errors: string[];
  timestamp: Date;
}

export default function PixelTest() {
  const [testUrl, setTestUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');

  const testPixel = async () => {
    if (!testUrl.trim()) {
      setError('Please enter a URL');
      return;
    }

    // Validate URL format
    let urlToTest = testUrl.trim();
    if (!urlToTest.startsWith('http://') && !urlToTest.startsWith('https://')) {
      urlToTest = `https://${urlToTest}`;
    }

    try {
      new URL(urlToTest);
    } catch {
      setError('Invalid URL format');
      return;
    }

    setTesting(true);
    setError('');
    setResult(null);

    try {
      // Call API to test the pixel
      const response = await fetch('/api/admin/test-pixel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlToTest }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          url: urlToTest,
          success: data.success || false,
          scriptFound: data.scriptFound || false,
          scriptContent: data.scriptContent || null,
          cookiesDetected: data.cookiesDetected || [],
          errors: data.errors || [],
          timestamp: new Date(),
        });
      } else {
        setError(data.error || 'Failed to test pixel');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to test pixel');
    } finally {
      setTesting(false);
    }
  };

  const formatScriptPreview = (content: string | null) => {
    if (!content) return null;
    // Show first 500 characters
    const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
    return preview;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pixel Test Tool</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Test if the affiliate tracking script is active on a target page
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="test-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Enter URL to Test
            </label>
            <div className="flex gap-2">
              <input
                id="test-url"
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://tryfleur.com/?ref=30483"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    testPixel();
                  }
                }}
              />
              <button
                onClick={testPixel}
                disabled={testing}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {testing ? 'Testing...' : 'Test Pixel'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Enter any URL from your store (e.g., homepage, product page, blog post)
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <div className={`p-4 rounded-lg border-2 ${
                result.success && result.scriptFound
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  {result.success && result.scriptFound ? (
                    <>
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <h3 className="text-lg font-semibold text-green-800">Pixel Active ✓</h3>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <h3 className="text-lg font-semibold text-red-800">Pixel Not Found ✗</h3>
                    </>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  Tested: <span className="font-mono text-xs">{result.url}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Tested at: {result.timestamp.toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Script Detection</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {result.scriptFound ? (
                        <>
                          <span className="text-green-600">✓</span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Tracking script found</span>
                        </>
                      ) : (
                        <>
                          <span className="text-red-600">✗</span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">Tracking script not found</span>
                        </>
                      )}
                    </div>
                    {result.scriptContent && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800">
                          View script preview
                        </summary>
                        <pre className="mt-2 p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded text-xs overflow-auto max-h-40">
                          {formatScriptPreview(result.scriptContent)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Cookies Detected</h4>
                  {result.cookiesDetected.length > 0 ? (
                    <ul className="space-y-1">
                      {result.cookiesDetected.map((cookie, idx) => (
                        <li key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="font-mono text-xs bg-white dark:bg-gray-900 px-1 rounded">{cookie}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No tracking cookies detected</p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="font-semibold text-yellow-800 mb-2">Warnings</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {result.errors.map((err, idx) => (
                      <li key={idx} className="text-sm text-yellow-700">{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">What to Check</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                  <li>Script should contain <code className="bg-white dark:bg-gray-900 px-1 rounded">TRACKING_API_URL</code></li>
                  <li>Script should detect <code className="bg-white dark:bg-gray-900 px-1 rounded">?ref=</code> parameter</li>
                  <li>Script should set cookies: <code className="bg-white dark:bg-gray-900 px-1 rounded">affiliate_click_id</code> and <code className="bg-white dark:bg-gray-900 px-1 rounded">affiliate_id</code></li>
                  <li>Script should update cart attributes for checkout</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Browser-Side Tracking Debug</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Check cookies, sessionStorage, and cart attributes in your current browser session.
          <strong className="block mt-2">Note:</strong> This only works when viewing this page from your Shopify store.
        </p>
        <TrackingDebug />
      </div>
    </div>
  );
}
