'use client';

import React, { useEffect, useState, useCallback } from 'react';

interface AnalyticsMetrics {
  total_visitors: number;
  unique_visitors: number;
  sessions: number;
  bounce_rate: number;
  avg_session_time: number;
  pages_per_session: number;
}

interface ActiveVisitor {
  session_id: string;
  currentPage: string;
  device: string;
  location: string;
  lastSeen: number;
  affiliate_id?: string;
  affiliate_number?: number | null;
  affiliate_name?: string;
}

interface PageData {
  path: string;
  url: string;
  views?: number;
  entries?: number;
  exits?: number;
  bounceRate?: number;
}

interface TrafficSource {
  source: string;
  visitors: number;
  percentage: number;
}

interface DeviceData {
  type: string;
  count: number;
  percentage: number;
}

interface BrowserData {
  name: string;
  count: number;
  percentage: number;
}

interface GeographyData {
  country: string;
  visitors: number;
  percentage: number;
}

interface ActiveVisitorInfo {
  session_id: string;
  currentPage: string;
  device: string;
  location: string;
  lastSeen: number;
  url_params?: Record<string, string>;
}

interface AffiliateData {
  affiliate_id: string;
  affiliate_number: number | null;
  affiliate_name: string;
  sessions: number;
  visitors: number;
  page_views: number;
  bounce_rate: number;
  avg_session_time: number;
  active_visitors?: ActiveVisitorInfo[];
}

interface AnalyticsData {
  metrics: AnalyticsMetrics;
  activeVisitors: ActiveVisitor[];
  topPages: PageData[];
  entryPages: PageData[];
  exitPages: PageData[];
  trafficSources: TrafficSource[];
  devices: DeviceData[];
  browsers: BrowserData[];
  geography: GeographyData[];
  affiliates: AffiliateData[];
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('24h');
  const [viewMode, setViewMode] = useState<'realtime' | 'historical'>('realtime');
  const [refreshInterval, setRefreshInterval] = useState(10); // seconds

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await fetch(`/api/analytics/stats?timeRange=${timeRange}&viewMode=${viewMode}`);
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const analyticsData = await response.json();
      setData(analyticsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setLoading(false);
    }
  }, [timeRange, viewMode]);

  // Set up Server-Sent Events for real-time updates
  useEffect(() => {
    // Initial fetch
    fetchAnalytics();

    // Set up SSE connection for real-time updates
    const eventSource = new EventSource('/api/analytics/stream');
    
    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'update' && message.data) {
          // Only update in real-time mode (SSE doesn't make sense for historical)
          if (viewMode === 'realtime' && message.data.affiliates) {
            setData(prevData => {
              if (!prevData) return prevData;
              return {
                ...prevData,
                affiliates: message.data.affiliates,
                metrics: {
                  ...prevData.metrics,
                  ...message.data.metrics,
                },
              };
            });
          }
        } else if (message.type === 'error') {
          console.error('SSE error:', message.message);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // Fallback to polling if SSE fails
      const interval = setInterval(fetchAnalytics, refreshInterval * 1000);
      return () => {
        clearInterval(interval);
        eventSource.close();
      };
    };

    // Fallback polling for time range changes (SSE only updates active visitors)
    // Only poll in real-time mode
    const interval = viewMode === 'realtime' 
      ? setInterval(fetchAnalytics, refreshInterval * 1000)
      : null;

    return () => {
      eventSource.close();
      if (interval) clearInterval(interval);
    };
  }, [fetchAnalytics, refreshInterval, viewMode]);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-gray-200">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-indigo-600 mb-4"></div>
        <p className="text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Time Range:</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
          <button
            onClick={fetchAnalytics}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
          >
            Refresh
          </button>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">View Mode:</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('realtime')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'realtime'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Real-Time
            </button>
            <button
              onClick={() => setViewMode('historical')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'historical'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Historical
            </button>
          </div>
          <span className="text-xs text-gray-500">
            {viewMode === 'realtime' 
              ? 'Showing active sessions (last 30 minutes)' 
              : `Showing all sessions (${timeRange === '1h' ? 'last hour' : timeRange === '24h' ? 'last 24 hours' : timeRange === '7d' ? 'last 7 days' : 'last 30 days'})`}
          </span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Total Visitors</div>
          <div className="text-2xl font-bold text-gray-900">
            {data?.metrics.total_visitors.toLocaleString() || '0'}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Unique Visitors</div>
          <div className="text-2xl font-bold text-gray-900">
            {data?.metrics.unique_visitors.toLocaleString() || '0'}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Bounce Rate</div>
          <div className="text-2xl font-bold text-gray-900">
            {data?.metrics.bounce_rate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Avg Session Time</div>
          <div className="text-2xl font-bold text-gray-900">
            {data ? formatTime(data.metrics.avg_session_time) : '0s'}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Pages/Session</div>
          <div className="text-2xl font-bold text-gray-900">
            {data?.metrics.pages_per_session.toFixed(1) || '0'}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600 mb-1">Active Now</div>
          <div className="text-2xl font-bold text-indigo-600">
            {data?.affiliates?.reduce((sum, aff) => sum + (aff.active_visitors?.length || 0), 0) || 0}
          </div>
        </div>
      </div>

      {/* Affiliate Traffic Overview */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Traffic by Affiliate</h3>
          <p className="text-sm text-gray-500 mt-1">
            {viewMode === 'realtime' 
              ? 'Active sessions (updated in last 30 minutes)' 
              : `Historical sessions (${timeRange === '1h' ? 'last hour' : timeRange === '24h' ? 'last 24 hours' : timeRange === '7d' ? 'last 7 days' : 'last 30 days'})`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Affiliate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visitors</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Page Views</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bounce Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Session</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.affiliates && data.affiliates.length > 0 ? (
                data.affiliates.map((affiliate, idx) => (
                  <React.Fragment key={idx}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">
                          {affiliate.affiliate_name}
                          {affiliate.affiliate_number && (
                            <span className="ml-2 text-sm text-gray-500">#{affiliate.affiliate_number}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{affiliate.sessions}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{affiliate.visitors}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{affiliate.page_views}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{affiliate.bounce_rate.toFixed(1)}%</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatTime(affiliate.avg_session_time)}</td>
                    </tr>
                    {affiliate.active_visitors && affiliate.active_visitors.length > 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-3 bg-gray-50">
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-gray-600 mb-2">Active Pages:</div>
                            {affiliate.active_visitors.map((visitor, vIdx) => (
                              <div key={vIdx} className="bg-white rounded px-3 py-2 border border-gray-200">
                                <div className="flex items-center justify-between text-sm text-gray-700 mb-2">
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium">{visitor.currentPage}</span>
                                    <span className="text-xs text-gray-500">•</span>
                                    <span className="text-xs text-gray-500">{visitor.device}</span>
                                    <span className="text-xs text-gray-500">•</span>
                                    <span className="text-xs text-gray-500">{visitor.location}</span>
                                  </div>
                                  <span className="text-xs text-gray-500">{formatTimeAgo(visitor.lastSeen)}</span>
                                </div>
                                {visitor.url_params && Object.keys(visitor.url_params).length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-gray-100">
                                    <div className="text-xs font-medium text-gray-600 mb-1">URL Parameters:</div>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(visitor.url_params).map(([key, value]) => (
                                        <div key={key} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs">
                                          <span className="font-medium text-gray-700">{key}:</span>
                                          <span className="text-gray-600">{value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No active affiliate sessions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Pages</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {data?.topPages.length ? (
              data.topPages.map((page, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 truncate flex-1">{page.path}</div>
                    <div className="ml-4 text-sm text-gray-600">
                      {page.views} views • {page.bounceRate?.toFixed(1)}% bounce
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">No page data</div>
            )}
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Traffic Sources</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {data?.trafficSources.length ? (
              data.trafficSources.map((source, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">{source.source}</div>
                    <div className="ml-4 text-sm text-gray-600">
                      {source.visitors} ({source.percentage.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">No traffic source data</div>
            )}
          </div>
        </div>
      </div>

      {/* Entry/Exit Pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Entry Pages</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {data?.entryPages.length ? (
              data.entryPages.map((page, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 truncate flex-1">{page.path}</div>
                    <div className="ml-4 text-sm text-gray-600">{page.entries} entries</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">No entry page data</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Exit Pages</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {data?.exitPages.length ? (
              data.exitPages.map((page, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 truncate flex-1">{page.path}</div>
                    <div className="ml-4 text-sm text-gray-600">{page.exits} exits</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">No exit page data</div>
            )}
          </div>
        </div>
      </div>

      {/* Devices & Browsers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Devices</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {data?.devices.length ? (
              data.devices.map((device, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 capitalize">{device.type}</div>
                    <div className="ml-4 text-sm text-gray-600">
                      {device.count} ({device.percentage.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">No device data</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Browsers</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {data?.browsers.length ? (
              data.browsers.map((browser, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">{browser.name}</div>
                    <div className="ml-4 text-sm text-gray-600">
                      {browser.count} ({browser.percentage.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">No browser data</div>
            )}
          </div>
        </div>
      </div>

      {/* Geography */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Geographic Distribution</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {data?.geography.length ? (
            data.geography.map((geo, idx) => (
              <div key={idx} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{geo.country}</div>
                  <div className="ml-4 text-sm text-gray-600">
                    {geo.visitors} visitors ({geo.percentage.toFixed(1)}%)
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">No geographic data</div>
          )}
        </div>
      </div>
    </div>
  );
}
