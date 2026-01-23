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

export default function ConversionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ConversionDetail | null>(null);
  const [loading, setLoading] = useState(true);

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
        return 'bg-green-100 text-green-800';
      case 'approved':
        return 'bg-blue-100 text-blue-800';
      case 'eligible':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'reversed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600 mb-4"></div>
          <p className="text-gray-500">Loading conversion details...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900 mb-2">Conversion not found</p>
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
    <div className="min-h-screen bg-gray-50 pt-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/app?tab=conversions')}
                className="text-gray-600 hover:text-gray-900 mb-2 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Conversions
              </button>
              <h1 className="text-2xl font-semibold text-gray-900">
                Order #{conversion.shopify_order_number}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* Order Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Order Number</label>
              <p className="text-sm text-gray-900">#{conversion.shopify_order_number}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Order ID</label>
              <p className="text-sm text-gray-900 font-mono">{conversion.shopify_order_id.slice(-12)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Customer Name</label>
              <p className="text-sm text-gray-900">{conversion.customer_name || '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Customer Email</label>
              <p className="text-sm text-gray-900">{conversion.customer_email || '—'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Order Total</label>
              <p className="text-sm text-gray-900 font-semibold">
                {formatCurrency(conversion.order_total, conversion.order_currency)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Order Date</label>
              <p className="text-sm text-gray-900">{formatDate(conversion.order_date)}</p>
            </div>
          </div>
        </div>

        {/* Affiliate & Offer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Affiliate</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Affiliate Name</label>
                <p className="text-sm text-gray-900">{conversion.affiliate.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Affiliate ID</label>
                <p className="text-sm text-gray-900">
                  {conversion.affiliate.affiliate_number ? `#${conversion.affiliate.affiliate_number}` : '—'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Email</label>
                <p className="text-sm text-gray-900">{conversion.affiliate.email}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Offer</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Offer Name</label>
                <p className="text-sm text-gray-900">{conversion.offer.name || '—'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Offer ID</label>
                <p className="text-sm text-gray-900">
                  {conversion.offer.offer_number ? `#${conversion.offer.offer_number}` : '—'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Commission Type</label>
                <p className="text-sm text-gray-900 capitalize">
                  {conversion.offer.commission_type?.replace('_', ' ') || '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Commission Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Commission</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Amount</label>
              <p className="text-lg font-semibold text-gray-900">
                {formatCurrency(conversion.commission.amount, conversion.commission.currency)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Status</label>
              <span
                className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(
                  conversion.commission.status
                )}`}
              >
                {conversion.commission.status}
              </span>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Created</label>
              <p className="text-sm text-gray-900">{formatDate(conversion.commission.created_at)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Eligible Date</label>
              <p className="text-sm text-gray-900">{formatDate(conversion.commission.eligible_date)}</p>
            </div>
          </div>
        </div>

        {/* Subscription Details */}
        {isSubscription && conversion.subscription && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Payments Made</label>
                  <p className="text-2xl font-bold text-gray-900">
                    {conversion.subscription_summary.payments_made || 0}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Expected</label>
                  <p className="text-2xl font-bold text-gray-900">
                    {conversion.subscription_summary.total_payments_expected || '∞'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Remaining</label>
                  <p className="text-2xl font-bold text-yellow-600">
                    {conversion.subscription_summary.payments_remaining ?? '∞'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Interval</label>
                  <p className="text-lg font-semibold text-gray-900">
                    {conversion.subscription.interval_months} month{conversion.subscription.interval_months !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Commission Paid</label>
                  <p className="text-lg font-semibold text-green-600">
                    {formatCurrency(
                      conversion.subscription_summary.total_commission_paid || '0',
                      conversion.commission.currency
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Commission Pending</label>
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
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription Payments</h2>
                <div className="space-y-3">
                  {/* Initial Payment */}
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">Initial Payment</div>
                      <div className="text-sm text-gray-500">{formatDate(conversion.order_date)}</div>
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
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          Rebill Payment #{index + 1}
                        </div>
                        <div className="text-sm text-gray-500">{formatDate(rebill.created_at)}</div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-semibold ${
                            rebill.status === 'paid' ? 'text-green-700' : 'text-gray-700'
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
                          className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg opacity-60"
                        >
                          <div>
                            <div className="font-medium text-gray-500">Rebill Payment #{paymentNumber}</div>
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
                            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
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
