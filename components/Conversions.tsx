'use client';

import { useEffect, useState, useCallback } from 'react';

interface Conversion {
  id: string;
  shopify_order_id: string;
  shopify_order_number: string;
  customer_email: string;
  customer_name: string;
  order_total: string;
  order_currency: string;
  affiliate_id: string;
  affiliate_name: string;
  affiliate_email: string;
  affiliate_number: number | null;
  offer_id: string | null;
  offer_name: string | null;
  offer_number: number | null;
  commission_amount: string;
  commission_currency: string;
  commission_status: string;
  attribution_type: string;
  created_at: string;
  eligible_date: string;
  is_subscription?: boolean;
  subscription_payments_made?: number;
  subscription_max_payments?: number | null;
}

interface Affiliate {
  id: string;
  affiliate_number: number | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
}

interface Offer {
  id: string;
  offer_number: number | null;
  name: string;
}

interface ConversionsProps {
  initialAffiliateId?: string | null;
  onInitialAffiliateConsumed?: () => void;
}

export default function Conversions({ initialAffiliateId, onInitialAffiliateConsumed }: ConversionsProps = {}) {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    affiliate_id: '',
    offer_id: '',
    status: '',
    start_date: '',
    end_date: '',
    search: '',
  });

  useEffect(() => {
    fetchAffiliates();
    fetchOffers();
  }, []);

  // Apply initial affiliate filter when navigating from Overview → Top Affiliates row click
  useEffect(() => {
    if (initialAffiliateId) {
      setFilters((prev) => ({ ...prev, affiliate_id: initialAffiliateId }));
      onInitialAffiliateConsumed?.();
    }
  }, [initialAffiliateId]); // Intentionally not depending on onInitialAffiliateConsumed to avoid re-running

  const fetchAffiliates = async () => {
    try {
      const res = await fetch('/api/admin/affiliates');
      if (res.ok) {
        const data = await res.json();
        setAffiliates(data.affiliates || []);
      }
    } catch (err) {
      console.error('Error fetching affiliates:', err);
    }
  };

  const fetchOffers = async () => {
    try {
      const res = await fetch('/api/admin/offers');
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      }
    } catch (err) {
      console.error('Error fetching offers:', err);
    }
  };

  const fetchConversions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.affiliate_id) params.append('affiliate_id', filters.affiliate_id);
      if (filters.offer_id) params.append('offer_id', filters.offer_id);
      if (filters.status) params.append('status', filters.status);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.search) params.append('search', filters.search);

      const res = await fetch(`/api/admin/conversions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setConversions(data.conversions || []);
      } else {
        console.error('Failed to fetch conversions');
      }
    } catch (err) {
      console.error('Error fetching conversions:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchConversions();
  }, [fetchConversions]);

  const formatCurrency = (amount: string, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300';
      case 'approved':
        return 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300';
      case 'eligible':
        return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300';
      case 'pending':
        return 'bg-gray-100 dark:bg-yellow-900/40 text-gray-800 dark:text-yellow-300';
      case 'reversed':
        return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Search (Order #, Email, Name)
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Affiliate
            </label>
            <select
              value={filters.affiliate_id}
              onChange={(e) => setFilters({ ...filters, affiliate_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Affiliates</option>
              {affiliates.map((aff) => (
                <option key={aff.id} value={aff.id}>
                  {aff.affiliate_number ? `#${aff.affiliate_number} - ` : ''}
                  {aff.first_name && aff.last_name
                    ? `${aff.first_name} ${aff.last_name}`
                    : aff.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Offer
            </label>
            <select
              value={filters.offer_id}
              onChange={(e) => setFilters({ ...filters, offer_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Offers</option>
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.offer_number ? `#${offer.offer_number} - ` : ''}
                  {offer.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="eligible">Eligible</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Conversions Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading conversions...</div>
        ) : conversions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">No conversions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Affiliate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Offer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commission
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subscription
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {conversions.map((conversion) => (
                  <tr 
                    key={conversion.id} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => window.location.href = `/app/conversions/${conversion.id}`}
                    title="Click to view details"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        #{conversion.shopify_order_number}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {conversion.shopify_order_id.slice(-8)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {conversion.customer_name || '—'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {conversion.customer_email || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatCurrency(conversion.order_total, conversion.order_currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {conversion.affiliate_number ? `#${conversion.affiliate_number}` : '—'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {conversion.affiliate_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {conversion.offer_number ? `#${conversion.offer_number}` : '—'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {conversion.offer_name || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(conversion.commission_amount, conversion.commission_currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          conversion.commission_status
                        )}`}
                      >
                        {conversion.commission_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {conversion.is_subscription ? (
                        <div className="text-sm">
                          <div className="text-gray-900 dark:text-gray-100 font-medium">
                            {conversion.subscription_payments_made || 0} / {conversion.subscription_max_payments ? conversion.subscription_max_payments + 1 : '∞'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">payments</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">One-time</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(conversion.created_at)}
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
