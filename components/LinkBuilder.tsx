'use client';

import { useState, useEffect } from 'react';

interface Affiliate {
  id: string;
  name: string;
  email: string;
}

interface Link {
  id: string;
  affiliate_name: string;
  affiliate_email: string;
  destination_url: string;
  campaign_name: string | null;
  coupon_code: string | null;
  click_url: string;
  clicks: number;
  created_at: string;
}

export default function LinkBuilder() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    affiliate_id: '',
    destination_url: '',
    campaign_name: '',
    coupon_code: '',
  });

  useEffect(() => {
    fetchAffiliates();
    fetchLinks();
  }, []);

  const fetchAffiliates = async () => {
    try {
      const res = await fetch('/api/admin/affiliates');
      const data = await res.json();
      setAffiliates(data.affiliates || []);
    } catch (err) {
      console.error('Error fetching affiliates:', err);
    }
  };

  const fetchLinks = async () => {
    try {
      const res = await fetch('/api/admin/links');
      const data = await res.json();
      setLinks(data.links || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching links:', err);
      setLoading(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/links/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchLinks();
        setShowCreateForm(false);
        setFormData({ affiliate_id: '', destination_url: '', campaign_name: '', coupon_code: '' });
        alert('Link created successfully!');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error creating link:', err);
      alert('Failed to create link');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-900 dark:text-gray-100">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          {showCreateForm ? 'Cancel' : 'Create New Link'}
        </button>
      </div>

      {/* Create Link Form */}
      {showCreateForm && (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow dark:shadow-gray-900 border border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Create Affiliate Link</h3>
          <form onSubmit={handleCreateLink} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Affiliate *
              </label>
              <select
                required
                value={formData.affiliate_id}
                onChange={(e) => setFormData({ ...formData, affiliate_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select affiliate...</option>
                {affiliates.map((aff) => (
                  <option key={aff.id} value={aff.id}>
                    {aff.name} ({aff.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Destination URL *
              </label>
              <input
                type="url"
                required
                value={formData.destination_url}
                onChange={(e) => setFormData({ ...formData, destination_url: e.target.value })}
                placeholder="https://yourstore.com/products/product-name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Can be a product page, collection page, or any custom URL
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Campaign Name (optional)
              </label>
              <input
                type="text"
                value={formData.campaign_name}
                onChange={(e) => setFormData({ ...formData, campaign_name: e.target.value })}
                placeholder="Summer Sale 2024"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Coupon Code (optional)
              </label>
              <input
                type="text"
                value={formData.coupon_code}
                onChange={(e) => setFormData({ ...formData, coupon_code: e.target.value })}
                placeholder="SUMMER20"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                If provided, coupon attribution will override link attribution
              </p>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              Create Link
            </button>
          </form>
        </div>
      )}

      {/* Links List */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-900 overflow-hidden border border-gray-200 dark:border-gray-800">
        {links.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">No links created yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Affiliate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Destination</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Campaign</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Coupon</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Clicks</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tracking URL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="text-gray-900 dark:text-gray-100">{link.affiliate_name}</div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">{link.affiliate_email}</div>
                    </td>
                    <td className="px-6 py-4 text-sm max-w-xs truncate text-gray-900 dark:text-gray-100">{link.destination_url}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{link.campaign_name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {link.coupon_code ? (
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded text-xs">{link.coupon_code}</span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{link.clicks}</td>
                    <td className="px-6 py-4 text-sm max-w-xs truncate">
                      <code className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 rounded">{link.click_url}</code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => copyToClipboard(link.click_url)}
                        className="px-3 py-1 bg-blue-600 dark:bg-blue-500 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 text-xs"
                      >
                        Copy URL
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}