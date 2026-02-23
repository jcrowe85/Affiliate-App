'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AffiliateManagement from '@/components/AffiliateManagement';
import OffersManagement from '@/components/OffersManagement';
import PayoutRuns from '@/components/PayoutRuns';
import PixelTest from '@/components/PixelTest';
import Conversions from '@/components/Conversions';
import WebhookManager from '@/components/WebhookManager';
import Analytics from '@/components/Analytics';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/components/ThemeProvider';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardStats {
  pendingApprovals: number;
  fraudFlags: number;
  upcomingPayouts: number;
  totalCommissions: number;
  totalRevenue: string;
  totalCommissionsAmount: string;
  paidCommissions: string;
  owedCommissions: string;
  outstandingCommissions: string;
  totalClicks: number;
  totalConversions: number;
  conversionRate: string;
}

interface PendingCommission {
  id: string;
  status: string; // 'pending' or 'eligible'
  affiliate_name: string;
  affiliate_email: string;
  order_number: string;
  amount: string;
  currency: string;
  eligible_date: string;
  created_at: string;
  has_fraud_flags: boolean;
  fraud_flags: Array<{ type: string; score: number; reason: string }>;
}

interface FraudFlag {
  id: string;
  commission_id: string;
  flag_type: string;
  score: number;
  reason: string;
  created_at: string;
  commission: {
    id: string;
    amount: string;
    currency: string;
    status: string;
    order_number: string;
  };
  affiliate: {
    id: string;
    name: string;
    email: string;
  };
}

interface AffiliatePerformance {
  affiliate_id: string;
  name: string;
  email: string;
  clicks: number;
  orders: number;
  conversion_rate: string;
  revenue?: string;
  total_commission: string;
  paid_commission: string;
  pending_commission: string;
  outstanding_commission?: string;
  earliest_due_date?: string | null;
  total_commissions_count?: number;
}

interface PayoutObligation {
  affiliate_id: string;
  affiliate_name: string;
  affiliate_email: string;
  payout_method: string | null;
  payout_identifier: string | null;
  total_amount: string;
  currency: string;
  commission_count: number;
  commissions: Array<{
    id: string;
    amount: string;
    order_id: string;
    order_number?: string;
    eligible_date: string;
    created_at?: string;
  }>;
}

interface PaidPayout {
  id: string;
  affiliate_id: string;
  affiliate_name: string;
  affiliate_email: string;
  paypal_email: string | null;
  total_amount: string;
  currency: string;
  commission_count: number;
  payout_reference: string | null;
  paypal_batch_id: string | null;
  paypal_status: string | null;
  payout_method: string;
  created_at: string;
  commissions: Array<{
    id: string;
    order_number: string;
    amount: string;
    currency: string;
    created_at: string;
  }>;
}

type Tab = 'overview' | 'pending' | 'fraud' | 'payouts' | 'performance' | 'affiliates' | 'offers' | 'payout-runs' | 'pixel-test' | 'conversions' | 'webhooks' | 'analytics';
type ReportSubTab = 'performance' | 'payouts';

// Payout Reports Section Component
function PayoutReportsSectionComponent({
  reportData,
  setReportData,
  filters,
  setFilters,
  affiliates,
  formatCurrency,
  formatDate,
}: {
  reportData: any;
  setReportData: (data: any) => void;
  filters: { start_date: string; end_date: string; affiliate_id: string };
  setFilters: (filters: any) => void;
  affiliates: Array<{ id: string; name: string; email: string }>;
  formatCurrency: (amount: string, currency?: string) => string;
  formatDate: (dateString: string) => string;
}) {
  const [loading, setLoading] = useState(false);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.affiliate_id) params.append('affiliate_id', filters.affiliate_id);

      const res = await fetch(`/api/admin/payouts/reports?${params.toString()}`);
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error('Error generating report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.affiliate_id) params.append('affiliate_id', filters.affiliate_id);
      params.append('format', 'csv');

      const res = await fetch(`/api/admin/payouts/reports?${params.toString()}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payout-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting CSV:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Payout Reports</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Affiliate</label>
            <select
              value={filters.affiliate_id}
              onChange={(e) => setFilters({ ...filters, affiliate_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Affiliates</option>
              {affiliates.map(aff => (
                <option key={aff.id} value={aff.id}>{aff.name} ({aff.email})</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              title="Export CSV"
            >
              📥 CSV
            </button>
          </div>
        </div>
      </div>

      {/* Report Summary */}
      {reportData?.summary && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Payouts</div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{reportData.summary.total_payouts}</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Amount</div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {formatCurrency(reportData.summary.total_amount, reportData.summary.currency)}
              </div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Commissions</div>
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{reportData.summary.total_commissions}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Date Range</div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {reportData.summary.date_range.start ? formatDate(reportData.summary.date_range.start) : 'All time'} - {reportData.summary.date_range.end ? formatDate(reportData.summary.date_range.end) : 'Today'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Details */}
      {reportData?.payouts && reportData.payouts.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-800">
          <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 dark:from-gray-800 dark:to-gray-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Payout Details</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Affiliate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Commissions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PayPal Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reference</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {reportData.payouts.map((payout: any) => (
                  <tr key={payout.payout_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatDate(payout.payout_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{payout.affiliate_name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{payout.affiliate_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">
                      {formatCurrency(payout.total_amount, payout.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {payout.commission_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {payout.paypal_batch_id ? (
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          payout.paypal_status === 'SUCCESS' ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300' :
                          payout.paypal_status === 'PENDING' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300' :
                          'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                        }`}>
                          {payout.paypal_status || 'PENDING'}
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {payout.payout_reference || payout.paypal_batch_id || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportData && (!reportData.payouts || reportData.payouts.length === 0) && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-12 text-center border border-gray-200 dark:border-gray-800">
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100">No payouts found</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your filters</p>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pendingCommissions, setPendingCommissions] = useState<PendingCommission[]>([]);
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);
  const [affiliatePerformance, setAffiliatePerformance] = useState<AffiliatePerformance[]>([]);
  const [payoutObligations, setPayoutObligations] = useState<PayoutObligation[]>([]);
  const [paidPayouts, setPaidPayouts] = useState<PaidPayout[]>([]);
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>('performance');
  const [reportData, setReportData] = useState<any>(null);
  const [reportFilters, setReportFilters] = useState({
    start_date: '',
    end_date: '',
    affiliate_id: '',
  });
  const [affiliates, setAffiliates] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<PayoutObligation | null>(null);
  const [payoutReference, setPayoutReference] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<{ message: string; details?: any } | null>(null);
  const [chartData, setChartData] = useState<Array<{ date: string; revenue: number; commissions: number }>>([]);
  const [chartTimeRange, setChartTimeRange] = useState<string>('30d');
  const [chartLoading, setChartLoading] = useState(false);
  const [performancePeriod, setPerformancePeriod] = useState<string>('30d'); // Shared period for performance tab and overview stats/top affiliates
  const [conversionsInitialAffiliateId, setConversionsInitialAffiliateId] = useState<string | null>(null);

  // Clear conversions initial affiliate when leaving Conversions tab so filter doesn't stick on next visit
  useEffect(() => {
    if (activeTab !== 'conversions') {
      setConversionsInitialAffiliateId(null);
    }
  }, [activeTab]);

  const fetchChartData = useCallback(async (timeRange: string) => {
    try {
      setChartLoading(true);
      const response = await fetch(`/api/admin/chart-data?timeRange=${timeRange}`);
      if (response.ok) {
        const result = await response.json();
        setChartData(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching chart data:', error);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChartData(chartTimeRange);
  }, [chartTimeRange, fetchChartData]);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch stats with period filter for overview tab
      const statsUrl = activeTab === 'overview' 
        ? `/api/admin/stats?period=${performancePeriod}`
        : '/api/admin/stats';
      const statsRes = await fetch(statsUrl);
      if (statsRes.status === 401) {
        router.push('/login');
        return;
      }
      const statsData = await statsRes.json();
      setStats(statsData);

      // Fetch tab-specific data
      if (activeTab === 'pending') {
        const pendingRes = await fetch('/api/admin/commissions/pending');
        const pendingData = await pendingRes.json();
        setPendingCommissions(pendingData.commissions || []);
      } else if (activeTab === 'fraud') {
        const fraudRes = await fetch('/api/admin/fraud');
        const fraudData = await fraudRes.json();
        setFraudFlags(fraudData.fraudFlags || []);
      } else if (activeTab === 'payouts') {
        const payoutsRes = await fetch('/api/admin/payouts/upcoming');
        const payoutsData = await payoutsRes.json();
        setPayoutObligations(payoutsData.payouts || []);
        
        // Also fetch paid payouts for history section
        const paidRes = await fetch('/api/admin/payouts/paid?limit=10');
        const paidData = await paidRes.json();
        setPaidPayouts(paidData.payouts || []);
        
      } else if (activeTab === 'performance' || activeTab === 'overview') {
        const perfUrl = activeTab === 'overview'
          ? `/api/admin/affiliates/performance?limit=10&period=${performancePeriod}`
          : `/api/admin/affiliates/performance?period=${performancePeriod}`;
        const perfRes = await fetch(perfUrl);
        const perfData = await perfRes.json();
        setAffiliatePerformance(perfData.affiliates || []);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setLoading(false);
    }
  }, [activeTab, router, performancePeriod]);

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds for live updates
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000); // 30 seconds
    
    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [fetchDashboardData, performancePeriod]);

  const handleValidate = async (commissionId: string) => {
    setActionLoading(commissionId);
    try {
      const res = await fetch('/api/admin/commissions/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionIds: [commissionId] }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDashboardData(); // Refresh data - status will update automatically
      }
    } catch (err) {
      console.error('Error validating commission:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (commissionId: string) => {
    setActionLoading(commissionId);
    try {
      const res = await fetch('/api/admin/commissions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionIds: [commissionId] }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDashboardData(); // Refresh data
      }
    } catch (err) {
      console.error('Error approving commission:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (commissionId: string) => {
    if (!confirm('Are you sure you want to reject this commission?')) return;
    setActionLoading(commissionId);
    try {
      const res = await fetch('/api/admin/commissions/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionIds: [commissionId], reason: 'Rejected by admin' }),
      });
      if (res.ok) {
        await fetchDashboardData(); // Refresh data
      }
    } catch (err) {
      console.error('Error rejecting commission:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveFraud = async (fraudFlagId: string) => {
    setActionLoading(fraudFlagId);
    try {
      const res = await fetch('/api/admin/fraud/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fraudFlagId }),
      });
      if (res.ok) {
        await fetchDashboardData(); // Refresh data
      }
    } catch (err) {
      console.error('Error resolving fraud flag:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async (status?: string) => {
    try {
      const url = `/api/admin/export/commissions${status ? `?status=${status}` : ''}`;
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error exporting:', err);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };


  const handlePayPayout = async () => {
    if (!selectedPayout) return;

    setActionLoading(selectedPayout.affiliate_id);
    setProcessingPayment(true);
    
    try {
      const commissionIds = selectedPayout.commissions.map(c => c.id);
      const res = await fetch('/api/admin/payouts/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliate_id: selectedPayout.affiliate_id,
          commission_ids: commissionIds,
          payout_reference: payoutReference.trim() || null,
        }),
      });

      const data = await res.json();
      
      if (res.ok && data.success) {
        // Show success message
        const successMessage = data.paypal_batch_id 
          ? `Payment sent successfully!\n\nPayPal Batch ID: ${data.paypal_batch_id}\nStatus: ${data.paypal_status || 'PENDING'}\nAmount: ${data.total_amount} ${data.currency}\nCommissions: ${data.paid_count || selectedPayout.commissions.length}`
          : `Payout processed successfully!\n\nAmount: ${data.total_amount} ${data.currency}\nCommissions: ${data.paid_count || selectedPayout.commissions.length}`;
        
        setPaymentSuccess({
          message: successMessage,
          details: data,
        });
        
        // Refresh data
        await fetchDashboardData();
        
        // Close modal after 3 seconds
        setTimeout(() => {
          setShowPaymentModal(false);
          setSelectedPayout(null);
          setPayoutReference('');
          setPaymentSuccess(null);
        }, 3000);
      } else {
        // Show detailed error message
        let errorMessage = `Payment Failed: ${data.error || 'Failed to process payout'}`;
        
        // Show the specific error reason if available
        if (data.error_reason) {
          errorMessage += `\n\nReason: ${data.error_reason}`;
        }
        
        if (data.message) {
          errorMessage += `\n\n${data.message}`;
        }
        
        alert(errorMessage);
      }
    } catch (err: any) {
      console.error('Error processing payout:', err);
      alert(`Payment Failed: Network error - ${err.message || 'Failed to connect to server'}`);
    } finally {
      setActionLoading(null);
      setProcessingPayment(false);
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
      month: 'short',
      day: 'numeric',
    });
  };


  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 dark:border-gray-700 border-t-indigo-600 dark:border-t-indigo-500 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const headerHeight = 64;

  const nav = (tab: Tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const btn = (tab: Tab, label: string, icon: React.ReactNode, badge?: number) => {
    const active = activeTab === tab;
    const collapsed = sidebarCollapsed;
    return (
      <button
        type="button"
        onClick={() => nav(tab)}
        className={`relative w-full flex items-center rounded-lg transition-colors ${
          active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        } ${collapsed ? 'justify-start px-4 py-3 md:justify-center md:px-2 gap-3 md:gap-0' : 'px-4 py-3 justify-start gap-3'}`}
        title={collapsed ? label : undefined}
      >
        <span className="shrink-0 w-6 h-6 flex items-center justify-center">{icon}</span>
        <span className={`text-sm font-medium flex items-center min-w-0 ${collapsed ? 'max-md:flex md:hidden' : 'flex'}`}>
          <span className="truncate">{label}</span>
          {badge != null && badge > 0 && (
            <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full shrink-0">{badge}</span>
          )}
        </span>
        {collapsed && badge != null && badge > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 max-md:hidden" aria-hidden />
        )}
      </button>
    );
  };

  const icons = {
    menu: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
    ),
    overview: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
    ),
    chart: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    ),
    users: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
    ),
    tag: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
    ),
    link: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
    ),
    cash: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    ),
    clock: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
    alert: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    ),
    cog: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    ),
    wallet: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
    ),
    check: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
    target: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" /></svg>
    ),
    document: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    ),
    logout: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
    ),
    chevronLeft: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
    ),
    chevronRight: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
    ),
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 dark:bg-gray-950">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-900 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 dark:border-gray-800 z-20 flex items-center px-4 sm:px-6 gap-3">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="md:hidden p-2 -ml-2 rounded-lg text-gray-600 dark:text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-800"
          aria-label="Toggle menu"
        >
          {icons.menu}
        </button>
        <button
          type="button"
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="hidden md:flex p-2 rounded-lg text-gray-600 dark:text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? icons.chevronRight : icons.chevronLeft}
        </button>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 dark:text-white truncate flex-1">Affiliate Dashboard</h1>
        <ThemeToggle />
      </header>

      {/* Mobile backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close menu"
        onClick={() => setMobileMenuOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setMobileMenuOpen(false)}
        className={`fixed inset-0 bg-black/50 z-20 transition-opacity md:hidden ${mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Sidebar: mobile drawer, desktop collapsible */}
      <aside
        className={`fixed top-16 bottom-0 left-0 z-30 md:z-10 bg-slate-900 text-white flex flex-col transition-all duration-200 ease-out
          w-64 md:transition-[width]
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${sidebarCollapsed ? 'md:w-16' : 'md:w-64'}`}
      >
        <nav className="flex-1 p-3 md:p-4 space-y-1 overflow-y-auto">
          <div className={`pt-2 px-2 pb-1 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Main</div>
          </div>
          {btn('overview', 'Overview', icons.overview)}
          <div className={`pt-2 px-2 pb-1 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Performance</div>
          </div>
          {btn('performance', 'Reports', icons.document)}
          {btn('analytics', 'Analytics', icons.chart)}
          {btn('conversions', 'Conversions', icons.target)}
          {btn('affiliates', 'Affiliates', icons.users)}
          {btn('offers', 'Offers', icons.tag)}
          {btn('payouts', 'Payouts', icons.cash)}
          <div className={`pt-2 px-2 pb-1 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tools</div>
          </div>
          {btn('pixel-test', 'Pixel Test', icons.check)}
          {btn('webhooks', 'Webhooks', icons.cog)}
          <div className={`pt-2 px-2 pb-1 ${sidebarCollapsed ? 'md:hidden' : ''}`}>
            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Management</div>
          </div>
          {btn('pending', 'Pending', icons.clock, stats?.pendingApprovals ?? 0)}
          {btn('fraud', 'Fraud Queue', icons.alert, stats?.fraudFlags ?? 0)}
          {btn('payout-runs', 'Payout Runs', icons.wallet)}
        </nav>
        <div className="p-3 md:p-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleLogout}
            className={`w-full flex items-center rounded-lg transition-colors text-slate-300 hover:bg-slate-800 hover:text-white ${
              sidebarCollapsed ? 'justify-start px-4 py-3 md:justify-center md:px-2 gap-3 md:gap-0' : 'px-4 py-3 justify-start gap-3'
            }`}
            title={sidebarCollapsed ? 'Logout' : undefined}
          >
            <span className="shrink-0 w-6 h-6 flex items-center justify-center">{icons.logout}</span>
            <span className={`text-sm font-medium ${sidebarCollapsed ? 'max-md:inline md:hidden' : ''}`}>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main
        className={`bg-gray-50 dark:bg-gray-950 min-h-screen pt-16 transition-[margin] duration-200 ml-0 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}
      >
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-16 z-10">
          <div className="px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {activeTab === 'overview' && 'Overview'}
              {activeTab === 'pending' && 'Pending Approvals'}
              {activeTab === 'fraud' && 'Fraud Queue'}
              {activeTab === 'payouts' && 'Upcoming Payouts'}
              {activeTab === 'performance' && 'Reports'}
              {activeTab === 'affiliates' && 'Affiliates'}
              {activeTab === 'offers' && 'Offers'}
              {activeTab === 'conversions' && 'Conversions'}
              {activeTab === 'pixel-test' && 'Pixel Test'}
              {activeTab === 'webhooks' && 'Webhooks'}
              {activeTab === 'payout-runs' && 'Payout Runs'}
              {activeTab === 'analytics' && 'Analytics'}
            </h2>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
            {/* Performance Graph */}
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4 sm:p-6">
              <div className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Performance</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Revenue and commissions over time</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {['1h', '24h', '7d', '30d', '90d'].map((range) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => {
                          setChartTimeRange(range);
                          setPerformancePeriod(range);
                        }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                          performancePeriod === range
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {range === '1h' ? '1 Hour' : range === '24h' ? '24 Hours' : range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="h-64">
                {chartLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-indigo-600 dark:border-t-indigo-500 mb-2"></div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Loading chart data...</p>
                    </div>
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No data available for this time range</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#6b7280"
                        className="dark:stroke-gray-400"
                        style={{ fontSize: '12px' }}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis 
                        stroke="#6b7280"
                        className="dark:stroke-gray-400"
                        style={{ fontSize: '12px' }}
                        tickFormatter={(value) => `$${value}`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#1f2937' : '#fff', 
                          border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`, 
                          borderRadius: '6px',
                          color: theme === 'dark' ? '#f3f4f6' : '#000'
                        }}
                        formatter={(value: any, name: string) => {
                          const label = name === 'revenue' ? 'Revenue' : 'Commissions Paid';
                          return [`$${parseFloat(value).toFixed(2)}`, label];
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        dot={{ fill: '#10b981', r: 3 }}
                        activeDot={{ r: 5 }}
                        name="revenue"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="commissions" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 3 }}
                        activeDot={{ r: 5 }}
                        name="commissions"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Total Revenue */}
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Revenue</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  {formatCurrency(stats?.totalRevenue || '0')}
                </p>
                <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Profit</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(String(parseFloat(stats?.totalRevenue || '0') - parseFloat(stats?.totalCommissionsAmount || '0')))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Commissions</span>
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      {formatCurrency(stats?.totalCommissionsAmount || '0')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Commissions */}
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Commissions</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  {formatCurrency(stats?.totalCommissionsAmount || '0')}
                </p>
                <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Paid</span>
                    <span className="text-sm font-semibold text-green-600">
                      {formatCurrency(stats?.paidCommissions || '0')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Owed</span>
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      {formatCurrency(stats?.owedCommissions || '0')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Outstanding Commissions */}
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Outstanding Commissions</h3>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-4">
                  {formatCurrency(stats?.outstandingCommissions || '0')}
                </p>
                <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Yet to be paid</span>
                    <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                      {formatCurrency(stats?.outstandingCommissions || '0')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      Pending Payment
                    </span>
                  </div>
                </div>
              </div>

              {/* Conversion Rate */}
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Conversion Rate</h3>
                <div className="mb-4">
                  <div className="relative w-24 h-24 mx-auto">
                    <svg className="transform -rotate-90 w-24 h-24">
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="#e5e7eb"
                        strokeWidth="8"
                        fill="none"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="#10b981"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - parseFloat(stats?.conversionRate || '0') / 100)}`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {parseFloat(stats?.conversionRate || '0').toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Clicks</span>
                    <span className="text-sm font-semibold text-green-600">
                      {stats?.totalClicks || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Conversions</span>
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      {stats?.totalConversions || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Affiliates Table */}
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Affiliates</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Data filtered by Performance tab period selector
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Affiliate Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Clicks
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Conversions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Commission
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Outstanding
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Due Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Last Conversion
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Last Payment
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {affiliatePerformance.length > 0 ? (
                      affiliatePerformance.slice(0, 10).map((affiliate) => (
                        <tr
                          key={affiliate.affiliate_id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setConversionsInitialAffiliateId(affiliate.affiliate_id);
                            setActiveTab('conversions');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setConversionsInitialAffiliateId(affiliate.affiliate_id);
                              setActiveTab('conversions');
                            }
                          }}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{affiliate.name}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{affiliate.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{affiliate.clicks}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{affiliate.orders}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {formatCurrency(affiliate.revenue || '0')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {formatCurrency(affiliate.total_commission)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-orange-600 dark:text-orange-400">
                            {formatCurrency(affiliate.outstanding_commission || affiliate.pending_commission || '0')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {affiliate.earliest_due_date ? (
                              <span className={new Date(affiliate.earliest_due_date) < new Date() ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                                {formatDate(affiliate.earliest_due_date)}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">—</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">—</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          No affiliate data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          )}

          {/* Pending Approvals Tab */}
          {activeTab === 'pending' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pending Approvals</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review and approve eligible commissions</p>
              </div>
              <button
                onClick={() => handleExport('eligible')}
                className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 transition-colors shadow-sm hover:shadow"
              >
                Export CSV
              </button>
            </div>
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-indigo-600 dark:border-t-indigo-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading...</p>
              </div>
            ) : pendingCommissions.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <p className="text-lg font-medium">No pending approvals</p>
                <p className="text-sm">All eligible commissions have been reviewed</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Order #</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Affiliate</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Eligible Date</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                    {pendingCommissions.map((commission) => (
                      <tr key={commission.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${commission.has_fraud_flags ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">#{commission.order_number}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{commission.affiliate_name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{commission.affiliate_email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(commission.amount, commission.currency)}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{formatDate(commission.eligible_date)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {commission.status === 'pending' && (
                              <span className="px-2.5 py-1 text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 rounded-full w-fit">Pending Validation</span>
                            )}
                            {commission.status === 'eligible' && (
                              <span className="px-2.5 py-1 text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded-full w-fit">Eligible</span>
                            )}
                            {commission.has_fraud_flags && (
                              <span className="px-2.5 py-1 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 rounded-full w-fit">Fraud Flagged</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                          {commission.status === 'pending' ? (
                            <button
                              onClick={() => handleValidate(commission.id)}
                              disabled={commission.has_fraud_flags || actionLoading === commission.id}
                              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium shadow-sm hover:shadow transition-all disabled:hover:shadow-sm"
                            >
                              {actionLoading === commission.id ? 'Processing...' : 'Validate'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleApprove(commission.id)}
                              disabled={commission.has_fraud_flags || actionLoading === commission.id}
                              className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium shadow-sm hover:shadow transition-all disabled:hover:shadow-sm"
                            >
                              {actionLoading === commission.id ? 'Processing...' : 'Approve'}
                            </button>
                          )}
                          <button
                            onClick={() => handleReject(commission.id)}
                            disabled={actionLoading === commission.id}
                            className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium shadow-sm hover:shadow transition-all"
                          >
                            {actionLoading === commission.id ? 'Processing...' : 'Reject'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {/* Fraud Queue Tab */}
          {activeTab === 'fraud' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-red-50 to-white dark:from-gray-800 dark:to-gray-900 dark:from-gray-800 dark:to-gray-900">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fraud Queue</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review and resolve fraud flags</p>
            </div>
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-red-600 dark:border-t-red-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading...</p>
              </div>
            ) : fraudFlags.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <p className="text-lg font-medium">No unresolved fraud flags</p>
                <p className="text-sm">All fraud flags have been resolved</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Risk Score</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Flag Type</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Order #</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Affiliate</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Commission</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                    {fraudFlags.map((flag) => (
                      <tr key={flag.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-l-4 ${
                        flag.score > 70 ? 'bg-red-50 dark:bg-red-900/20 border-red-400' : 
                        flag.score > 50 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400' : 
                        'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
                      }`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1.5 text-xs rounded-full font-bold ${
                            flag.score > 70 ? 'bg-red-200 text-red-900' :
                            flag.score > 50 ? 'bg-yellow-200 text-yellow-900' :
                            'bg-gray-200 text-gray-800'
                          }`}>
                            {flag.score}/100
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium capitalize text-gray-900 dark:text-gray-100">{flag.flag_type.replace('_', ' ')}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">#{flag.commission.order_number}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{flag.affiliate.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{flag.affiliate.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(flag.commission.amount, flag.commission.currency)}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs">{flag.reason}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleResolveFraud(flag.id)}
                            disabled={actionLoading === flag.id}
                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium shadow-sm hover:shadow transition-all"
                          >
                            {actionLoading === flag.id ? 'Processing...' : 'Resolve'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}

          {/* Upcoming Payouts Tab */}
          {activeTab === 'payouts' && (
          <div className="space-y-6">

            {loading ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-12 text-center border border-gray-200 dark:border-gray-800">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-green-600 dark:border-t-green-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading...</p>
              </div>
            ) : payoutObligations.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-12 text-center border border-gray-200 dark:border-gray-800">
                <p className="text-lg font-medium text-gray-900 dark:text-gray-100">No upcoming payout obligations</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">All payouts are up to date</p>
              </div>
            ) : (
              payoutObligations.map((payout) => (
                <div key={payout.affiliate_id} className="bg-gradient-to-br from-white to-green-50 dark:from-gray-900 dark:to-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-800 hover:shadow-xl transition-shadow">
                  <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-green-50 to-white dark:from-gray-800 dark:to-gray-900 dark:from-gray-800 dark:to-gray-900">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{payout.affiliate_name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{payout.affiliate_email}</p>
                        {payout.payout_method && (
                          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Payout Method:</span> {payout.payout_method}
                            {payout.payout_identifier && (
                              <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">{payout.payout_identifier}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-700 bg-clip-text text-transparent">
                          {formatCurrency(payout.total_amount, payout.currency)}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{payout.commission_count} commission(s)</div>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-4 bg-white dark:bg-gray-900">
                    <div className="flex justify-between items-center mb-3">
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Commissions ({payout.commission_count}):
                      </div>
                      <button
                        onClick={() => {
                          setSelectedPayout(payout);
                          setShowPaymentModal(true);
                        }}
                        disabled={actionLoading === payout.affiliate_id}
                        className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm hover:shadow transition-all"
                      >
                        {actionLoading === payout.affiliate_id ? 'Processing...' : 'Pay'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {payout.commissions.slice(0, 5).map((comm) => (
                        <div key={comm.id} className="flex justify-between items-center text-sm py-4 px-4 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            Order #{comm.order_number || comm.order_id.split('/').pop()}
                          </span>
                          <span className="font-bold text-green-700 dark:text-green-400">{formatCurrency(comm.amount, payout.currency)}</span>
                        </div>
                      ))}
                      {payout.commissions.length > 5 && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-2">
                          ... and {payout.commissions.length - 5} more commission(s)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Recent Paid Payouts Section */}
            {paidPayouts.length > 0 && (
              <div className="mt-8">
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                  <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-white dark:from-gray-800 dark:to-gray-900 dark:from-gray-800 dark:to-gray-900">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Recent Paid Payouts</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Payment history for completed payouts</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Affiliate</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Commissions</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PayPal Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                        {paidPayouts.map((payout) => (
                          <tr key={payout.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                              {formatDate(payout.created_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{payout.affiliate_name}</div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">{payout.affiliate_email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">
                              {formatCurrency(payout.total_amount, payout.currency)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {payout.commission_count}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {payout.paypal_batch_id ? (
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  payout.paypal_status === 'SUCCESS' ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300' :
                                  payout.paypal_status === 'PENDING' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300' :
                                  'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                                }`}>
                                  {payout.paypal_status || 'PENDING'}
                                </span>
                              ) : (
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800">
                                  Manual
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {payout.payout_reference || payout.paypal_batch_id || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Confirmation Modal */}
            {showPaymentModal && selectedPayout && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-green-50 to-white dark:from-gray-800 dark:to-gray-900">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Confirm Payout</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Review transaction history before processing payment</p>
                  </div>
                  
                  <div className="px-6 py-4 overflow-y-auto flex-1">
                    <div className="mb-6">
                      <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 mb-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Affiliate</div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{selectedPayout.affiliate_name}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{selectedPayout.affiliate_email}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Total Amount</div>
                            <div className="text-2xl font-bold text-green-600">
                              {formatCurrency(selectedPayout.total_amount, selectedPayout.currency)}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{selectedPayout.commission_count} commission(s)</div>
                          </div>
                        </div>
                        {selectedPayout.payout_method && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                            <div className="text-sm text-gray-600 dark:text-gray-400">Payout Method</div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {selectedPayout.payout_method}
                              {selectedPayout.payout_identifier && (
                                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">({selectedPayout.payout_identifier})</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Payout Reference (Optional)
                        </label>
                        <input
                          type="text"
                          value={payoutReference}
                          onChange={(e) => setPayoutReference(e.target.value)}
                          placeholder="e.g., Payment ID, Transaction #, etc."
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                      </div>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Transaction History</h4>
                      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                        <div className="max-h-96 overflow-y-auto">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Order #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Eligible Date</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                              {selectedPayout.commissions.map((comm) => (
                                <tr key={comm.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {comm.order_number || comm.order_id.split('/').pop()}
                                  </td>
                                  <td className="px-4 py-3 text-sm font-bold text-green-700">
                                    {formatCurrency(comm.amount, selectedPayout.currency)}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                    {formatDate(comm.eligible_date)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowPaymentModal(false);
                        setSelectedPayout(null);
                        setPayoutReference('');
                        setProcessingPayment(false);
                        setPaymentSuccess(null);
                      }}
                      disabled={processingPayment || !!paymentSuccess}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {paymentSuccess ? 'Close' : 'Cancel'}
                    </button>
                    <button
                      onClick={handlePayPayout}
                      disabled={processingPayment || actionLoading === selectedPayout.affiliate_id}
                      className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all flex items-center gap-2"
                    >
                      {processingPayment ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          <span>Sending Payment to PayPal...</span>
                        </>
                      ) : (
                        'Confirm & Pay'
                      )}
                    </button>
                  </div>
                  
                  {processingPayment && !paymentSuccess && (
                    <div className="px-6 py-3 bg-blue-50 border-t border-blue-200">
                      <div className="flex items-center gap-2 text-blue-700">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                        <span className="text-sm font-medium">Processing payment through PayPal...</span>
                      </div>
                      <p className="text-xs text-blue-600 mt-1 ml-6">Please wait, this may take a few seconds.</p>
                    </div>
                  )}
                  
                  {paymentSuccess && (
                    <div className="px-6 py-4 bg-green-50 border-t border-green-200">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-green-900 mb-1">Payment Successful!</h4>
                          <div className="text-sm text-green-800 whitespace-pre-line">
                            {paymentSuccess.message}
                          </div>
                          {paymentSuccess.details?.paypal_batch_id && (
                            <p className="text-xs text-green-700 mt-2">
                              Check PayPal Dashboard to verify the transaction.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          {/* Reports Tab (Performance & Payout Reports) */}
          {activeTab === 'performance' && (
          <div className="space-y-6">
            {/* Sub-tab Navigation */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800 pb-4">
                <button
                  onClick={() => setReportSubTab('performance')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    reportSubTab === 'performance'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  Performance Ranking
                </button>
                <button
                  onClick={() => {
                    setReportSubTab('payouts');
                    // Fetch affiliates for filter dropdown when switching to payout reports
                    if (affiliates.length === 0) {
                      fetch('/api/admin/affiliates')
                        .then(res => res.json())
                        .then(data => {
                          setAffiliates(data.affiliates || []);
                        })
                        .catch(err => console.error('Error fetching affiliates:', err));
                    }
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    reportSubTab === 'payouts'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  Payout Reports
                </button>
              </div>
            </div>

            {/* Performance Ranking Sub-tab */}
            {reportSubTab === 'performance' && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-white dark:from-gray-800 dark:to-gray-900">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Affiliate Performance Ranking</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Top performing affiliates by total commission earned</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select 
                        value={performancePeriod}
                        onChange={(e) => setPerformancePeriod(e.target.value)}
                        className="text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                        <option value="max">All Time</option>
                      </select>
                    </div>
                  </div>
                </div>
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-500 mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading...</p>
              </div>
            ) : affiliatePerformance.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <p className="text-lg font-medium">No affiliate performance data</p>
                <p className="text-sm">Performance metrics will appear here once affiliates generate commissions</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Rank</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Affiliate</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Clicks</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Orders</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Conv. Rate</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Total Earned</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Paid</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Outstanding</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {affiliatePerformance.map((affiliate, index) => (
                      <tr key={affiliate.affiliate_id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">#{index + 1}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{affiliate.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{affiliate.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{affiliate.clicks}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{affiliate.orders}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-blue-700">{affiliate.conversion_rate}%</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(affiliate.total_commission)}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-green-700">{formatCurrency(affiliate.paid_commission)}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(affiliate.outstanding_commission || '0')}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          {affiliate.earliest_due_date ? (
                            <span className={new Date(affiliate.earliest_due_date) < new Date() ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                              {formatDate(affiliate.earliest_due_date)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
              </div>
            )}

            {/* Payout Reports Sub-tab */}
            {reportSubTab === 'payouts' && (
              <PayoutReportsSectionComponent
                reportData={reportData}
                setReportData={setReportData}
                filters={reportFilters}
                setFilters={setReportFilters}
                affiliates={affiliates}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            )}
          </div>
          )}

          {/* Affiliates Tab */}
          {activeTab === 'affiliates' && (
            <AffiliateManagement />
          )}

          {activeTab === 'offers' && (
            <OffersManagement />
          )}

          {/* Payout Runs Tab */}
          {activeTab === 'payout-runs' && (
            <PayoutRuns />
          )}

          {/* Conversions Tab */}
          {activeTab === 'conversions' && (
            <Conversions
              initialAffiliateId={conversionsInitialAffiliateId}
              onInitialAffiliateConsumed={() => setConversionsInitialAffiliateId(null)}
            />
          )}

          {/* Pixel Test Tab */}
          {activeTab === 'pixel-test' && (
            <PixelTest />
          )}

          {/* Webhooks Tab */}
          {activeTab === 'webhooks' && (
            <WebhookManager />
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <Analytics />
          )}
        </div>
      </main>
    </div>
  );
}