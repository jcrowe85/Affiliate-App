'use client';

import { useState } from 'react';

export default function WebhookManager() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [currentWebhooks, setCurrentWebhooks] = useState<any[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);

  const fetchWebhooks = async () => {
    setLoadingWebhooks(true);
    try {
      const res = await fetch('/api/admin/verify-webhooks');
      if (res.ok) {
        const data = await res.json();
        setCurrentWebhooks(data.webhooks || []);
      }
    } catch (err) {
      console.error('Error fetching webhooks:', err);
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const updateWebhooks = async () => {
    if (!webhookUrl.trim()) {
      alert('Please enter a webhook URL');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/update-webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webhookUrl }),
      });

      const data = await res.json();
      setResult(data);
      
      if (data.success) {
        // Refresh webhook list
        await fetchWebhooks();
      }
    } catch (err) {
      console.error('Error updating webhooks:', err);
      setResult({ success: false, error: 'Failed to update webhooks' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold mb-4">Update Webhook URLs</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          After restarting Cloudflare Tunnel, update your webhook URLs with the new tunnel URL.
        </p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Webhook URL (e.g., https://abc123.trycloudflare.com)
            </label>
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-tunnel-url.trycloudflare.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Or set CLOUDFLARE_TUNNEL_URL in .env and leave empty to use that
            </p>
          </div>

          <button
            onClick={updateWebhooks}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating...' : 'Update Webhooks'}
          </button>

          {result && (
            <div className={`p-4 rounded-md ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {result.success ? (
                <div>
                  <p className="text-green-800 font-medium">✅ Webhooks updated successfully!</p>
                  <p className="text-sm text-green-700 mt-1">New URL: {result.webhookUrl}</p>
                  {result.updated && (
                    <ul className="text-sm text-green-700 mt-2 list-disc list-inside">
                      {result.updated.map((item: string) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-red-800 font-medium">❌ Failed to update webhooks</p>
                  {result.errors && (
                    <ul className="text-sm text-red-700 mt-2 list-disc list-inside">
                      {result.errors.map((error: string) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  )}
                  {result.error && (
                    <p className="text-sm text-red-700 mt-2">{result.error}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Current Webhooks</h2>
          <button
            onClick={fetchWebhooks}
            disabled={loadingWebhooks}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            {loadingWebhooks ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {currentWebhooks.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No webhooks found. Click Refresh to load.</p>
        ) : (
          <div className="space-y-2">
            {currentWebhooks.map((webhook: any) => (
              <div key={webhook.id} className="p-3 bg-gray-50 rounded-md">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{webhook.topic}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 break-all">{webhook.address}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
