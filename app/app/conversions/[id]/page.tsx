'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface ConversionDetail {
  conversion: {
    id: string;
    shopify_order_id: string;
    shopify_order_number: string;
    customer_email: string;
    customer_name: string;
    order_total: string;
    order_currency: string;
    order_date: string;
    affiliate: {
      id: string;
      name: string;
      email: string;
      affiliate_number: number | null;
    };
    offer: {
      id: string | null;
      name: string | null;
      offer_number: number | null;
      commission_type: string | null;
      amount: string | null;
      selling_subscriptions: string | null;
      subscription_max_payments: number | null;
      subscription_rebill_commission_type: string | null;
      subscription_rebill_commission_value: string | null;
    };
    commission: {
      id: string;
      amount: string;
      currency: string;
      status: string;
      created_at: string;
      eligible_date: string;
    };
    attribution: {
      type: string;
      click_id: string | null;
    };
    subscription: {
      id: string;
      original_order_id: string;
      selling_plan_id: string;
      interval_months: number;
      max_payments: number | null;
      payments_made: number;
      active: boolean;
      created_at: string;
    } | null;
    subscription_summary: {
      is_subscription: boolean;
      max_payments?: number | null;
      payments_made?: number;
      total_payments_expected?: number | null;
      payments_remaining?: number | null;
      total_commission_paid?: string;
      total_commission_pending?: string;
    };
    subscription_commissions: Array<{
      id: string;
      shopify_order_id: string;
      amount: string;
      currency: string;
      status: string;
      created_at: string;
    }>;
  };
}

interface WebhookLog {
  id: string;
  webhook_url: string;
  request_method: string;
  request_params: Record<string, string> | null;
  response_code: number | null;
  response_body: string | null;
  status: string;
  error_message: string | null;
  attempts: number;
  last_attempt_at: string;
  created_at: string;
  affiliate: {
    id: string;
    name: string;
    affiliate_number: number | null;
    email: string;
  };
}

function WebhookLogs({ commissionId, refreshTrigger }: { commissionId: string; refreshTrigger?: number }) {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWebhookLogs = async () => {
      try {
        const res = await fetch(`/api/admin/webhook-logs/${commissionId}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Error fetching webhook logs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWebhookLogs();
  }, [commissionId, refreshTrigger]);

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading webhook logs...</div>;
  }

  if (logs.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No webhook attempts yet. Click &quot;Test Webhook&quot; to fire a test webhook.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div
          key={log.id}
          className={`border rounded-lg p-4 ${
            log.status === 'success'
              ? 'bg-green-50 border-green-200'
              : log.status === 'failed'
              ? 'bg-red-50 border-red-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-2 py-1 text-xs font-semibold rounded ${
                    log.status === 'success'
                      ? 'bg-green-200 text-green-800'
                      : log.status === 'failed'
                      ? 'bg-red-200 text-red-800'
                      : 'bg-yellow-200 text-yellow-800'
                  }`}
                >
                  {log.status.toUpperCase()}
                </span>
                {log.response_code && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">HTTP {log.response_code}</span>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Attempt {log.attempts} • {new Date(log.last_attempt_at).toLocaleString()}
                </span>
              </div>
              <div className="text-sm font-mono text-gray-700 dark:text-gray-300 break-all mb-2">
                {log.webhook_url}
              </div>
              {log.request_params && Object.keys(log.request_params).length > 0 && (
                <details className="mt-2 mb-2">
                  <summary className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:text-gray-100">
                    View Request Parameters ({Object.keys(log.request_params).length} parameters)
                  </summary>
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-blue-300">
                          <th className="text-left py-1 px-2 font-semibold text-gray-700 dark:text-gray-300">Parameter</th>
                          <th className="text-left py-1 px-2 font-semibold text-gray-700 dark:text-gray-300">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(log.request_params).map(([key, value]) => (
                          <tr key={key} className="border-b border-blue-200">
                            <td className="py-1 px-2 font-mono text-gray-800">{key}</td>
                            <td className="py-1 px-2 font-mono text-gray-600 dark:text-gray-400 break-all">{String(value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              {log.error_message && (
                <div className="text-sm text-red-600 mb-2">
                  <strong>Error:</strong> {log.error_message}
                </div>
              )}
              {log.response_body && (
                <details className="mt-2">
                  <summary className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:text-gray-100">
                    View Response Body
                  </summary>
                  <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                    {log.response_body}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ConversionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ConversionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [webhookRefreshTrigger, setWebhookRefreshTrigger] = useState(0);

  useEffect(() => {
    if (params.id) {
      fetchConversionDetail(params.id as string);
    }
  }, [params.id]);

  const fetchConversionDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/conversions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setData(data);
      } else {
        console.error('Failed to fetch conversion details');
      }
    } catch (err) {
      console.error('Error fetching conversion details:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: string, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading conversion details...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Conversion not found</p>
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-800"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const { conversion } = data;
  const isSubscription = conversion.subscription_summary.is_subscription;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 pt-16">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-16 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/app?tab=conversions')}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Conversions
              </button>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                Order #{conversion.shopify_order_number}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* Order Details */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Order Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Order Number</label>
              <p className="text-sm text-gray-900 dark:text-gray-100">#{conversion.shopify_order_number}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Order ID</label>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">{conversion.shopify_order_id.slice(-12)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer Name</label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{conversion.customer_name || '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer Email</label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{conversion.customer_email || '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Order Total</label>
              <p className="text-sm text-gray-900 dark:text-gray-100 font-semibold">
                {formatCurrency(conversion.order_total, conversion.order_currency)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Order Date</label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{formatDate(conversion.order_date)}</p>
            </div>
          </div>
        </div>

        {/* Affiliate & Offer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Affiliate</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Affiliate Name</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">{conversion.affiliate.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Affiliate ID</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {conversion.affiliate.affiliate_number ? `#${conversion.affiliate.affiliate_number}` : '—'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">{conversion.affiliate.email}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Offer</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Offer Name</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">{conversion.offer.name || '—'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Offer ID</label>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {conversion.offer.offer_number ? `#${conversion.offer.offer_number}` : '—'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Commission Type</label>
                <p className="text-sm text-gray-900 dark:text-gray-100 capitalize">
                  {conversion.offer.commission_type?.replace('_', ' ') || '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Commission Details */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Commission</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Amount</label>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(conversion.commission.amount, conversion.commission.currency)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</label>
              <span
                className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(
                  conversion.commission.status
                )}`}
              >
                {conversion.commission.status}
              </span>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{formatDate(conversion.commission.created_at)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Eligible Date</label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{formatDate(conversion.commission.eligible_date)}</p>
            </div>
          </div>
        </div>

        {/* Webhook Logs */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Affiliate Webhook Logs</h2>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/admin/webhook-logs/${conversion.commission.id}`, {
                    method: 'POST',
                  });
                  const data = await res.json();
                  if (res.ok) {
                    alert(data.message);
                    // Trigger refresh of webhook logs
                    setWebhookRefreshTrigger(prev => prev + 1);
                  } else {
                    alert(`Error: ${data.error}`);
                  }
                } catch (err) {
                  alert('Failed to fire webhook');
                }
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
            >
              Test Webhook
            </button>
          </div>
          <WebhookLogs commissionId={conversion.commission.id} refreshTrigger={webhookRefreshTrigger} />
        </div>

        {/* Subscription Details */}
        {isSubscription && conversion.subscription && (
          <>
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Subscription Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Payments Made</label>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {conversion.subscription_summary.payments_made || 0}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Expected</label>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {conversion.subscription_summary.total_payments_expected || '∞'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Remaining</label>
                  <p className="text-2xl font-bold text-yellow-600">
                    {conversion.subscription_summary.payments_remaining ?? '∞'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Interval</label>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {conversion.subscription.interval_months} month{conversion.subscription.interval_months !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Commission Paid</label>
                  <p className="text-lg font-semibold text-green-600">
                    {formatCurrency(
                      conversion.subscription_summary.total_commission_paid || '0',
                      conversion.commission.currency
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Commission Pending</label>
                  <p className="text-lg font-semibold text-yellow-600">
                    {formatCurrency(
                      conversion.subscription_summary.total_commission_pending || '0',
                      conversion.commission.currency
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Subscription Payments */}
            {conversion.subscription_commissions.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Subscription Payments</h2>
                <div className="space-y-3">
                  {/* Initial Payment */}
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">Initial Payment</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{formatDate(conversion.order_date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-green-700">
                        {formatCurrency(conversion.commission.amount, conversion.commission.currency)}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(conversion.commission.status)}`}>
                        {conversion.commission.status}
                      </span>
                    </div>
                  </div>

                  {/* Rebill Payments */}
                  {conversion.subscription_commissions.map((rebill, index) => (
                    <div
                      key={rebill.id}
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        rebill.status === 'paid'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-800'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          Rebill Payment #{index + 1}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{formatDate(rebill.created_at)}</div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-semibold ${
                            rebill.status === 'paid' ? 'text-green-700' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {formatCurrency(rebill.amount, conversion.commission.currency)}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(rebill.status)}`}>
                          {rebill.status}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Pending Payments */}
                  {conversion.subscription_summary.payments_remaining &&
                    conversion.subscription_summary.payments_remaining > 0 &&
                    Array.from({ length: conversion.subscription_summary.payments_remaining }).map((_, index) => {
                      const rebillCount = conversion.subscription_commissions.length;
                      const paymentNumber = rebillCount + index + 1;
                      return (
                        <div
                          key={`pending-${index}`}
                          className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg opacity-60"
                        >
                          <div>
                            <div className="font-medium text-gray-500 dark:text-gray-400">Rebill Payment #{paymentNumber}</div>
                            <div className="text-sm text-gray-400">Pending</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-400">
                              {conversion.offer.subscription_rebill_commission_type === 'percentage'
                                ? `${conversion.offer.subscription_rebill_commission_value || 0}%`
                                : formatCurrency(
                                    conversion.offer.subscription_rebill_commission_value || '0',
                                    conversion.commission.currency
                                  )}
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:text-gray-400">
                              Pending
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
