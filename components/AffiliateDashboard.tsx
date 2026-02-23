'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Analytics from '@/components/Analytics';
import ThemeToggle from '@/components/ThemeToggle';

interface DashboardStats {
  totalCommissions: number;
  pendingCommissions: number;
  eligibleCommissions: number;
  paidCommissions: number;
  totalRevenue: string;
  totalCommissionsAmount: string;
  paidCommissionsAmount: string;
  pendingCommissionsAmount: string;
  totalClicks: number;
  totalConversions: number;
  conversionRate: string;
  fraudFlags: number;
  upcomingPayouts: number;
  currency: string;
}

interface Conversion {
  id: string;
  order_number: string;
  amount: string;
  currency: string;
  status: string;
  eligible_date: string;
  created_at: string;
  landing_url_params?: Record<string, string>;
}

interface Payout {
  id: string;
  order_number: string;
  amount: string;
  currency: string;
  status: string;
  eligible_date: string;
  payout_runs: Array<{
    id: string;
    period_start: string;
    period_end: string;
    status: string;
    payout_reference: string | null;
  }>;
}

interface FraudFlag {
  id: string;
  commission_id: string;
  flag_type: string;
  score: number;
  reason: string;
  resolved: boolean;
  created_at: string;
  commission: {
    id: string;
    order_number: string;
    amount: string;
    currency: string;
    status: string;
  };
}

type Tab = 'overview' | 'analytics' | 'conversions' | 'payouts' | 'fraud';

export default function AffiliateDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Always fetch stats
      const statsRes = await fetch('/api/affiliate/stats');
      if (statsRes.status === 401) {
        router.push('/affiliates/login');
        return;
      }
      const statsData = await statsRes.json();
      setStats(statsData);

      // Fetch tab-specific data
      if (activeTab === 'conversions') {
        const conversionsRes = await fetch('/api/affiliate/conversions');
        const conversionsData = await conversionsRes.json();
        setConversions(conversionsData.conversions || []);
      } else if (activeTab === 'payouts') {
        const payoutsRes = await fetch('/api/affiliate/payouts');
        const payoutsData = await payoutsRes.json();
        setPayouts(payoutsData.payouts || []);
      } else if (activeTab === 'fraud') {
        const fraudRes = await fetch('/api/affiliate/fraud');
        const fraudData = await fraudRes.json();
        setFraudFlags(fraudData.fraudFlags || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  }, [activeTab, router]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleLogout = async () => {
    try {
      await fetch('/api/affiliate/logout', { method: 'POST' });
      router.push('/affiliates/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const nav = (tab: Tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const formatCurrency = (amount: string, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
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

  const btn = (tab: Tab, label: string, icon: React.ReactNode) => {
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
        </span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full bg-slate-900 dark:bg-gray-950 text-white transition-all duration-300 z-50 ${
        sidebarCollapsed ? 'w-20' : 'w-64'
      } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          <div className={`border-b border-slate-800 dark:border-gray-800 ${sidebarCollapsed ? 'p-3 flex flex-col items-center gap-2' : 'p-4'}`}>
            <div className={`flex items-center justify-between w-full ${sidebarCollapsed ? 'flex-col gap-2' : ''}`}>
              {sidebarCollapsed ? (
                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800 dark:bg-slate-800/80 text-white shrink-0" title="Partner Portal">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
              ) : (
                <h1 className="text-xl font-bold truncate">
                  Partner Portal
                </h1>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden md:flex items-center justify-center shrink-0 text-slate-400 hover:text-white w-8 h-8 rounded hover:bg-slate-800 transition-colors"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                )}
              </button>
            </div>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {btn('overview', 'Overview', '📊')}
            {btn('analytics', 'Analytics', '📈')}
            {btn('conversions', 'Conversions', '💰')}
            {btn('payouts', 'Payouts', '💳')}
            {btn('fraud', 'Fraud Queue', '⚠️')}
          </nav>
          <div className="p-4 border-t border-slate-800 dark:border-gray-800">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ☰
              </button>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {activeTab === 'overview' ? 'Dashboard' : activeTab}
              </h2>
              <div className="flex items-center gap-3">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {activeTab === 'overview' && stats && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Revenue</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(stats.totalRevenue, stats.currency)}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Commissions</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(stats.totalCommissionsAmount, stats.currency)}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Paid Commissions</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(stats.paidCommissionsAmount, stats.currency)}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pending Payouts</div>
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {formatCurrency(stats.pendingCommissionsAmount, stats.currency)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Clicks</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalClicks.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Conversions</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalConversions.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Conversion Rate</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.conversionRate}%</div>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Fraud Flags</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.fraudFlags}</div>
                </div>
              </div>

              {/* Commission Status Breakdown */}
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Commission Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                    <div className="text-sm text-yellow-800 dark:text-yellow-300 mb-1">Pending</div>
                    <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-200">{stats.pendingCommissions}</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <div className="text-sm text-blue-800 dark:text-blue-300 mb-1">Eligible</div>
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{stats.eligibleCommissions}</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                    <div className="text-sm text-green-800 dark:text-green-300 mb-1">Paid</div>
                    <div className="text-2xl font-bold text-green-900 dark:text-green-200">{stats.paidCommissions}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <Analytics apiEndpoint="/api/affiliate/analytics" redirectOn401="/affiliates/login" />
            </div>
          )}

          {activeTab === 'conversions' && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Conversions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Order</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Eligible Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Link / Campaign params</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {conversions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                          No conversions found
                        </td>
                      </tr>
                    ) : (
                      conversions.map((conv) => (
                        <tr key={conv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{conv.order_number}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatCurrency(conv.amount, conv.currency)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded ${
                              conv.status === 'paid' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                              conv.status === 'eligible' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
                              'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                            }`}>
                              {conv.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(conv.eligible_date)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(conv.created_at)}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {conv.landing_url_params && Object.keys(conv.landing_url_params).length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 max-w-xs">
                                {Object.entries(conv.landing_url_params).map(([key, value]) => (
                                  <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs border border-gray-200 dark:border-gray-700">
                                    <span className="font-medium text-gray-700 dark:text-gray-300">{key}:</span>
                                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[120px]" title={String(value)}>{String(value)}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'payouts' && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Payouts</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Order</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Eligible Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payout Reference</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {payouts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                          No payouts found
                        </td>
                      </tr>
                    ) : (
                      payouts.map((payout) => (
                        <tr key={payout.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{payout.order_number}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatCurrency(payout.amount, payout.currency)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded ${
                              payout.status === 'paid' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                              'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                            }`}>
                              {payout.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(payout.eligible_date)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {payout.payout_runs.length > 0 && payout.payout_runs[0].payout_reference
                              ? payout.payout_runs[0].payout_reference
                              : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'fraud' && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Fraud Flags</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Order</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Flag Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Score</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {fraudFlags.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                          No fraud flags found
                        </td>
                      </tr>
                    ) : (
                      fraudFlags.map((flag) => (
                        <tr key={flag.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{flag.commission.order_number}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{flag.flag_type}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{flag.score}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{flag.reason}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded ${
                              flag.resolved ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                            }`}>
                              {flag.resolved ? 'Resolved' : 'Active'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDate(flag.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
