'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AffiliateManagement from '@/components/AffiliateManagement';
import OffersManagement from '@/components/OffersManagement';
import PayoutRuns from '@/components/PayoutRuns';
import PixelTest from '@/components/PixelTest';
import Conversions from '@/components/Conversions';
import WebhookManager from '@/components/WebhookManager';
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
  totalClicks: number;
  totalConversions: number;
  conversionRate: string;
}

interface PendingCommission {
  id: string;
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
  total_commission: string;
  paid_commission: string;
  pending_commission: string;
  total_commissions_count: number;
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
    eligible_date: string;
  }>;
}

type Tab = 'overview' | 'pending' | 'fraud' | 'payouts' | 'performance' | 'affiliates' | 'offers' | 'payout-runs' | 'pixel-test' | 'conversions' | 'webhooks';

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pendingCommissions, setPendingCommissions] = useState<PendingCommission[]>([]);
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);
  const [affiliatePerformance, setAffiliatePerformance] = useState<AffiliatePerformance[]>([]);
  const [payoutObligations, setPayoutObligations] = useState<PayoutObligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      // Always fetch stats
      const statsRes = await fetch('/api/admin/stats');
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
      } else if (activeTab === 'performance' || activeTab === 'overview') {
        const perfRes = await fetch('/api/admin/affiliates/performance');
        const perfData = await perfRes.json();
        setAffiliatePerformance(perfData.affiliates || []);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setLoading(false);
    }
  }, [activeTab, router]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error approving commission:', err);
      alert('Failed to approve commission');
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
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error rejecting commission:', err);
      alert('Failed to reject commission');
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
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error resolving fraud flag:', err);
      alert('Failed to resolve fraud flag');
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
      alert('Failed to export commissions');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
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

  const generateChartData = () => {
    // Generate last 30 days of data
    const data = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: 0, // This would come from actual API data in a real implementation
      });
    }
    return data;
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-indigo-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading dashboard...</p>
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
            <span className="ml-auto bg-red-600 text-white text-xs px-2 py-0.5 rounded-full shrink-0">{badge}</span>
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-20 flex items-center px-4 sm:px-6 gap-3">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="md:hidden p-2 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="Toggle menu"
        >
          {icons.menu}
        </button>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">Affiliate Dashboard</h1>
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
          {btn('performance', 'Reports', icons.chart)}
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
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="hidden md:flex w-full mt-2 items-center justify-center px-2 py-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? icons.chevronRight : icons.chevronLeft}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main
        className={`bg-gray-50 min-h-screen pt-16 transition-[margin] duration-200 ml-0 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}
      >
        <div className="bg-white border-b border-gray-200 sticky top-16 z-10">
          <div className="px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
              {activeTab === 'overview' && 'Overview'}
              {activeTab === 'pending' && 'Pending Approvals'}
              {activeTab === 'fraud' && 'Fraud Queue'}
              {activeTab === 'payouts' && 'Upcoming Payouts'}
              {activeTab === 'performance' && 'Performance Reports'}
              {activeTab === 'affiliates' && 'Affiliates'}
              {activeTab === 'offers' && 'Offers'}
              {activeTab === 'conversions' && 'Conversions'}
              {activeTab === 'pixel-test' && 'Pixel Test'}
              {activeTab === 'webhooks' && 'Webhooks'}
              {activeTab === 'payout-runs' && 'Payout Runs'}
            </h2>
          </div>
        </div>

        <div className="p-4 sm:p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Performance Graph */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Performance</h2>
                <p className="text-sm text-gray-500 mt-1">Revenue over time</p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={generateChartData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      style={{ fontSize: '12px' }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                      formatter={(value: any) => [`$${value}`, 'Revenue']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total Revenue */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Total Revenue</h3>
                <p className="text-3xl font-bold text-gray-900 mb-4">
                  {formatCurrency(stats?.totalRevenue || '0')}
                </p>
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Profit</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(String(parseFloat(stats?.totalRevenue || '0') - parseFloat(stats?.totalCommissionsAmount || '0')))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Commissions</span>
                    <span className="text-sm font-semibold text-gray-500">
                      {formatCurrency(stats?.totalCommissionsAmount || '0')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Commissions */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Total Commissions</h3>
                <p className="text-3xl font-bold text-gray-900 mb-4">
                  {formatCurrency(stats?.totalCommissionsAmount || '0')}
                </p>
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Paid</span>
                    <span className="text-sm font-semibold text-green-600">
                      {formatCurrency(stats?.paidCommissions || '0')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Owed</span>
                    <span className="text-sm font-semibold text-gray-500">
                      {formatCurrency(stats?.owedCommissions || '0')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Conversion Rate */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Conversion Rate</h3>
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
                      <span className="text-2xl font-bold text-gray-900">
                        {parseFloat(stats?.conversionRate || '0').toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Clicks</span>
                    <span className="text-sm font-semibold text-green-600">
                      {stats?.totalClicks || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Conversions</span>
                    <span className="text-sm font-semibold text-gray-500">
                      {stats?.totalConversions || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Affiliates Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Top Affiliates</h2>
                <div className="flex items-center gap-4">
                  <select className="text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option>All Offers</option>
                  </select>
                  <div className="text-sm text-gray-600">
                    {new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Affiliate Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Clicks
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Conversions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Commission
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Last Conversion
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Last Payment
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {affiliatePerformance.length > 0 ? (
                      affiliatePerformance.slice(0, 10).map((affiliate) => (
                        <tr key={affiliate.affiliate_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{affiliate.name}</div>
                            <div className="text-sm text-gray-500">{affiliate.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{affiliate.clicks}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{affiliate.orders}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {formatCurrency(affiliate.total_commission)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            {formatCurrency(affiliate.total_commission)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">—</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">—</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
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
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Pending Approvals</h2>
                <p className="text-sm text-gray-500 mt-1">Review and approve eligible commissions</p>
              </div>
              <button
                onClick={() => handleExport('eligible')}
                className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors shadow-sm hover:shadow"
              >
                Export CSV
              </button>
            </div>
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-indigo-600 mb-4"></div>
                <p className="text-gray-500">Loading...</p>
              </div>
            ) : pendingCommissions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p className="text-lg font-medium">No pending approvals</p>
                <p className="text-sm">All eligible commissions have been reviewed</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Order #</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Affiliate</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Eligible Date</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {pendingCommissions.map((commission) => (
                      <tr key={commission.id} className={`hover:bg-gray-50 transition-colors ${commission.has_fraud_flags ? 'bg-red-50 border-l-4 border-red-400' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-gray-900">#{commission.order_number}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{commission.affiliate_name}</div>
                          <div className="text-sm text-gray-500">{commission.affiliate_email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(commission.amount, commission.currency)}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatDate(commission.eligible_date)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {commission.has_fraud_flags && (
                            <span className="px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full">Fraud Flagged</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                          <button
                            onClick={() => handleApprove(commission.id)}
                            disabled={commission.has_fraud_flags || actionLoading === commission.id}
                            className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium shadow-sm hover:shadow transition-all disabled:hover:shadow-sm"
                          >
                            {actionLoading === commission.id ? 'Processing...' : 'Approve'}
                          </button>
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
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-red-50 to-white">
              <h2 className="text-2xl font-bold text-gray-900">Fraud Queue</h2>
              <p className="text-sm text-gray-500 mt-1">Review and resolve fraud flags</p>
            </div>
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-red-600 mb-4"></div>
                <p className="text-gray-500">Loading...</p>
              </div>
            ) : fraudFlags.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p className="text-lg font-medium">No unresolved fraud flags</p>
                <p className="text-sm">All fraud flags have been resolved</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Risk Score</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Flag Type</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Order #</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Affiliate</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Commission</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {fraudFlags.map((flag) => (
                      <tr key={flag.id} className={`hover:bg-gray-50 transition-colors border-l-4 ${
                        flag.score > 70 ? 'bg-red-50 border-red-400' : 
                        flag.score > 50 ? 'bg-yellow-50 border-yellow-400' : 
                        'bg-gray-50 border-gray-300'
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium capitalize">{flag.flag_type.replace('_', ' ')}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">#{flag.commission.order_number}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{flag.affiliate.name}</div>
                          <div className="text-sm text-gray-500">{flag.affiliate.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(flag.commission.amount, flag.commission.currency)}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">{flag.reason}</td>
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
              <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-gray-200">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-green-600 mb-4"></div>
                <p className="text-gray-500">Loading...</p>
              </div>
            ) : payoutObligations.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-gray-200">
                <p className="text-lg font-medium text-gray-900">No upcoming payout obligations</p>
                <p className="text-sm text-gray-500">All payouts are up to date</p>
              </div>
            ) : (
              payoutObligations.map((payout) => (
                <div key={payout.affiliate_id} className="bg-gradient-to-br from-white to-green-50 rounded-xl shadow-lg overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow">
                  <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-green-50 to-white">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{payout.affiliate_name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{payout.affiliate_email}</p>
                        {payout.payout_method && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">Payout Method:</span> {payout.payout_method}
                            {payout.payout_identifier && (
                              <span className="ml-2 px-2 py-0.5 bg-gray-100 rounded text-xs">{payout.payout_identifier}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-green-700 bg-clip-text text-transparent">
                          {formatCurrency(payout.total_amount, payout.currency)}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">{payout.commission_count} commission(s)</div>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-4 bg-white">
                    <div className="text-sm font-semibold text-gray-700 mb-3">
                      Commissions:
                    </div>
                    <div className="space-y-2">
                      {payout.commissions.slice(0, 5).map((comm) => (
                        <div key={comm.id} className="flex justify-between items-center text-sm py-2 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          <span className="font-medium text-gray-700">Order #{comm.order_id.split('/').pop()}</span>
                          <span className="font-bold text-green-700">{formatCurrency(comm.amount, payout.currency)}</span>
                        </div>
                      ))}
                      {payout.commissions.length > 5 && (
                        <div className="text-sm text-gray-500 italic text-center py-2">
                          ... and {payout.commissions.length - 5} more commission(s)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Affiliate Performance Tab */}
        {activeTab === 'performance' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
              <h2 className="text-2xl font-bold text-gray-900">Affiliate Performance Ranking</h2>
              <p className="text-sm text-gray-500 mt-1">Top performing affiliates by total commission earned</p>
            </div>
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600 mb-4"></div>
                <p className="text-gray-500">Loading...</p>
              </div>
            ) : affiliatePerformance.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <p className="text-lg font-medium">No affiliate performance data</p>
                <p className="text-sm">Performance metrics will appear here once affiliates generate commissions</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Rank</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Affiliate</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Clicks</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Orders</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Conv. Rate</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Total Earned</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Paid</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {affiliatePerformance.map((affiliate, index) => (
                      <tr key={affiliate.affiliate_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-700">#{index + 1}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">{affiliate.name}</div>
                          <div className="text-sm text-gray-500">{affiliate.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{affiliate.clicks}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{affiliate.orders}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-blue-700">{affiliate.conversion_rate}%</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-gray-900">{formatCurrency(affiliate.total_commission)}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-green-700">{formatCurrency(affiliate.paid_commission)}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-orange-600">{formatCurrency(affiliate.pending_commission)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
          <Conversions />
        )}

        {/* Pixel Test Tab */}
        {activeTab === 'pixel-test' && (
          <PixelTest />
        )}

        {/* Webhooks Tab */}
        {activeTab === 'webhooks' && (
          <WebhookManager />
        )}
        </div>
      </main>
    </div>
  );
}