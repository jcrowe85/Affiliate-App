'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';

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

interface AnalyticsProps {
  apiEndpoint?: string; // Optional custom API endpoint (for affiliate context)
  redirectOn401?: string; // Optional redirect URL on 401 (defaults to /login)
}

export default function Analytics({ apiEndpoint, redirectOn401 = '/login' }: AnalyticsProps = {} as AnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d'); // Default to 30 days for historical mode
  // Default to real-time mode (shows active sessions in last 5 minutes)
  const [viewMode, setViewMode] = useState<'realtime' | 'historical'>('realtime');
  const [refreshInterval, setRefreshInterval] = useState(10); // seconds
  // Track which affiliate sections are expanded
  const [expandedAffiliates, setExpandedAffiliates] = useState<Set<string>>(new Set());
  // Use ref to track current viewMode to avoid stale closures in intervals/SSE handlers
  const viewModeRef = useRef(viewMode);
  const fetchAnalyticsRef = useRef<((isInitialLoad?: boolean) => Promise<void>) | null>(null);

  const fetchAnalytics = useCallback(async (isInitialLoad = false) => {
    try {
      // Only set loading state on initial load to prevent flashing during polling
      if (isInitialLoad) {
        setLoading(true);
      }
      
      // Use custom endpoint if provided, otherwise use default
      const baseUrl = apiEndpoint || '/api/analytics/stats';
      // Only include timeRange for historical mode
      const url = viewMode === 'historical' 
        ? `${baseUrl}?timeRange=${timeRange}&viewMode=${viewMode}`
        : `${baseUrl}?viewMode=${viewMode}`;
      const response = await fetch(url);
      if (response.status === 401) {
        window.location.href = redirectOn401;
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch analytics' }));
        console.error('Analytics API error:', errorData);
        if (isInitialLoad) {
          setLoading(false);
        }
        return;
      }
      const analyticsData = await response.json();
      
      // Debug logging for historical mode
      if (viewMode === 'historical') {
        console.log('[Analytics] Historical mode fetch:', {
          url,
          timeRange,
          responseStatus: response.status,
          hasData: !!analyticsData,
          hasMetrics: !!analyticsData.metrics,
          hasAffiliates: !!analyticsData.affiliates,
          affiliatesCount: analyticsData.affiliates?.length || 0,
          sessionsCount: analyticsData.metrics?.sessions || 0,
        });
      }
      
      // Validate that the response has the expected structure
      if (analyticsData.error) {
        console.error('Analytics API returned error:', analyticsData.error);
        if (isInitialLoad) {
          setLoading(false);
        }
        return;
      }
      // Ensure metrics exist with default values if missing
      if (!analyticsData.metrics) {
        console.warn('[Analytics] Missing metrics in response, using defaults');
        analyticsData.metrics = {
          total_visitors: 0,
          unique_visitors: 0,
          sessions: 0,
          bounce_rate: 0,
          avg_session_time: 0,
          pages_per_session: 0,
        };
      }
      // Ensure other required arrays exist
      if (!analyticsData.affiliates) analyticsData.affiliates = [];
      if (!analyticsData.topPages) analyticsData.topPages = [];
      if (!analyticsData.entryPages) analyticsData.entryPages = [];
      if (!analyticsData.exitPages) analyticsData.exitPages = [];
      if (!analyticsData.trafficSources) analyticsData.trafficSources = [];
      if (!analyticsData.devices) analyticsData.devices = [];
      if (!analyticsData.browsers) analyticsData.browsers = [];
      if (!analyticsData.geography) analyticsData.geography = [];
      if (!analyticsData.activeVisitors) analyticsData.activeVisitors = [];
      
      // Only update data if we got a valid response (prevents clearing data on empty results)
      setData(analyticsData);
      if (isInitialLoad) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [timeRange, viewMode, apiEndpoint, redirectOn401]);

  // Update refs whenever they change
  useEffect(() => {
    viewModeRef.current = viewMode;
    fetchAnalyticsRef.current = fetchAnalytics;
  }, [viewMode, fetchAnalytics]);

  // Set up Server-Sent Events for real-time updates
  useEffect(() => {
    let isMounted = true;
    
    // Initial fetch - mark as initial load to show loading state
    // Use a small timeout to ensure refs are set
    const initialFetch = setTimeout(() => {
      if (fetchAnalyticsRef.current) {
        fetchAnalyticsRef.current(true);
      }
    }, 0);

    // Only set up SSE connection and polling for real-time mode
    if (viewMode !== 'realtime') {
      // For historical mode, just return (no SSE/polling needed)
      // The fetch was already triggered above
      return () => {
        clearTimeout(initialFetch);
      };
    }

    // For affiliate context (custom endpoint), skip SSE and use polling only
    if (apiEndpoint) {
      const interval = setInterval(() => {
        if (isMounted && viewModeRef.current === 'realtime' && fetchAnalyticsRef.current) {
          fetchAnalyticsRef.current(false);
        }
      }, refreshInterval * 1000);

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }

    // Set up SSE connection for real-time updates (admin only)
    const eventSource = new EventSource('/api/analytics/stream');
    
    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'update' && message.data) {
          // Only update if we're still in real-time mode (check ref to avoid stale closure)
          if (viewModeRef.current === 'realtime') {
            setData(prevData => {
              if (!prevData) return prevData;
              // DON'T update metrics from SSE - they conflict with polling data
              // SSE metrics are calculated differently and cause flashing
              // Only update activeVisitors from SSE, preserve everything else
              const updatedData: AnalyticsData = {
                ...prevData,
                // Keep existing metrics - don't overwrite with SSE metrics
                // metrics: prevData.metrics,
              };
              // Only update activeVisitors if provided, otherwise keep existing
              if (message.data.activeVisitors) {
                updatedData.activeVisitors = message.data.activeVisitors;
              }
              // Preserve affiliates data - don't overwrite with undefined
              if (message.data.affiliates) {
                updatedData.affiliates = message.data.affiliates;
              }
              return updatedData;
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
    };

    // Fallback polling for time range changes (SSE only updates active visitors)
    // Only poll in real-time mode
    // Pass false to prevent loading state changes during polling (prevents flashing)
    const interval = setInterval(() => {
      // Check ref to ensure we're still in real-time mode and component is mounted
      if (isMounted && viewModeRef.current === 'realtime' && fetchAnalyticsRef.current) {
        fetchAnalyticsRef.current(false);
      }
    }, refreshInterval * 1000);

    return () => {
      isMounted = false;
      clearTimeout(initialFetch);
      eventSource.close();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, refreshInterval]); // Only depend on viewMode and refreshInterval, not fetchAnalytics

  // Separate effect to handle historical mode changes (timeRange or viewMode)
  // This ensures data is fetched when switching to historical or changing time range
  useEffect(() => {
    // Only trigger fetch for historical mode
    if (viewMode === 'historical') {
      // Use a small delay to ensure the ref is set and avoid double-fetching
      const timeoutId = setTimeout(() => {
        if (fetchAnalyticsRef.current) {
          console.log('[Analytics] Fetching historical data for timeRange:', timeRange);
          fetchAnalyticsRef.current(true);
        }
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [viewMode, timeRange]); // Trigger when viewMode or timeRange changes

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
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-12 text-center border border-gray-200 dark:border-gray-800">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 dark:border-gray-700 border-t-indigo-600 dark:border-t-indigo-500 mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setViewMode('realtime');
                  // Trigger fetch immediately when switching modes
                  setTimeout(() => {
                    if (fetchAnalyticsRef.current) {
                      fetchAnalyticsRef.current(true);
                    }
                  }, 0);
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  viewMode === 'realtime'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Real-Time
              </button>
              <button
                onClick={() => {
                  setViewMode('historical');
                  // Trigger fetch immediately when switching modes
                  setTimeout(() => {
                    if (fetchAnalyticsRef.current) {
                      fetchAnalyticsRef.current(true);
                    }
                  }, 0);
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'historical'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                Historical
              </button>
            </div>
            
            {/* Time Range Selector - Only show for historical mode */}
            {viewMode === 'historical' && (
              <>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Range:</label>
                <select
                  value={timeRange}
                  onChange={(e) => {
                    setTimeRange(e.target.value);
                    // Trigger fetch when time range changes
                    setTimeout(() => {
                      if (fetchAnalyticsRef.current) {
                        fetchAnalyticsRef.current(true);
                      }
                    }, 0);
                  }}
                  className="border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="1h">Last Hour</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>
              </>
            )}
          </div>
          <button
            onClick={() => fetchAnalytics(false)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
          >
            Refresh
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
            {viewMode === 'realtime' ? (
              <>
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Live: Showing active sessions (last 5 minutes) - Auto-refreshes every 10 seconds</span>
              </>
            ) : (
              `Historical: Showing all sessions (${timeRange === '1h' ? 'last hour' : timeRange === '24h' ? 'last 24 hours' : timeRange === '7d' ? 'last 7 days' : 'last 30 days'})`
            )}
          </span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div className="text-base text-gray-600 dark:text-gray-400 mb-2">Total Visitors</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {data?.metrics?.total_visitors?.toLocaleString() || '0'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div className="text-base text-gray-600 dark:text-gray-400 mb-2">Unique Visitors</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {data?.metrics?.unique_visitors?.toLocaleString() || '0'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div className="text-base text-gray-600 dark:text-gray-400 mb-2">Bounce Rate</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {data?.metrics?.bounce_rate?.toFixed(1) || '0.0'}%
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div className="text-base text-gray-600 dark:text-gray-400 mb-2">Avg Session Time</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {data?.metrics ? formatTime(data.metrics.avg_session_time || 0) : '0s'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div className="text-base text-gray-600 dark:text-gray-400 mb-2">Pages/Session</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {data?.metrics?.pages_per_session?.toFixed(1) || '0.0'}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div className="text-base text-gray-600 dark:text-gray-400 mb-2">Active Now</div>
          <div className="text-3xl font-bold text-indigo-600">
            {data?.affiliates?.reduce((sum, aff) => sum + (aff.active_visitors?.length || 0), 0) || 0}
          </div>
        </div>
      </div>

      {/* Affiliate Sessions - Individual Sections */}
      {data?.affiliates && data.affiliates.length > 0 ? (
        data.affiliates.map((affiliate, idx) => {
          const affiliateKey = affiliate.affiliate_id || `affiliate-${idx}`;
          const isExpanded = expandedAffiliates.has(affiliateKey);
          
          const toggleExpanded = () => {
            setExpandedAffiliates(prev => {
              const newSet = new Set(prev);
              if (newSet.has(affiliateKey)) {
                newSet.delete(affiliateKey);
              } else {
                newSet.add(affiliateKey);
              }
              return newSet;
            });
          };

          return (
            <div key={idx} className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
              {/* Affiliate Header - Always Visible */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleExpanded}
                    className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 dark:bg-gray-800 transition-colors flex-shrink-0"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    <svg
                      className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  
                  <div className="flex-shrink-0 min-w-[200px]">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {affiliate.affiliate_name}
                      {affiliate.affiliate_number && (
                        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">#{affiliate.affiliate_number}</span>
                      )}
                    </h3>
                    {affiliate.active_visitors && affiliate.active_visitors.length > 0 && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 mt-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span className="font-medium">{affiliate.active_visitors.length} active</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Gray Metric Cards - Always Visible on same line */}
                  <div className="flex items-center gap-3 flex-1">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-[1.125rem] py-3 flex-1">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Sessions</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{affiliate.sessions}</div>
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-[1.125rem] py-3 flex-1">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Visitors</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{affiliate.visitors}</div>
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-[1.125rem] py-3 flex-1">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Page Views</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{affiliate.page_views}</div>
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-[1.125rem] py-3 flex-1">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Bounce Rate</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{affiliate.bounce_rate.toFixed(1)}%</div>
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-[1.125rem] py-3 flex-1">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Avg Session</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatTime(affiliate.avg_session_time)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Collapsible Content */}
              {isExpanded && (
                <div className="p-6">
                  {/* Active Pages */}
                  {affiliate.active_visitors && affiliate.active_visitors.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Active Pages ({affiliate.active_visitors.length})</h4>
                      <div className="space-y-3">
                        {affiliate.active_visitors.map((visitor, vIdx) => (
                          <div key={vIdx} className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-gray-900 dark:text-gray-100">{visitor.currentPage}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{visitor.device}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{visitor.location}</span>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{formatTimeAgo(visitor.lastSeen)}</span>
                            </div>
                            {visitor.url_params && Object.keys(visitor.url_params).length > 0 && (
                              <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">URL Parameters:</div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(visitor.url_params).map(([key, value]) => (
                                    <div key={key} className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-800 rounded text-xs border border-gray-200 dark:border-gray-700 max-w-full min-w-0">
                                      <span className="font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{key}:</span>
                                      <span className="text-gray-600 dark:text-gray-400 break-words break-all">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                      No active pages for this affiliate
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {viewMode === 'realtime' 
              ? 'No active affiliate sessions (no activity in last 5 minutes)' 
              : 'No historical sessions found for the selected time range'}
          </p>
        </div>
      )}


      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Pages</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data?.topPages.length ? (
              data.topPages.map((page, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate flex-1">{page.path}</div>
                    <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
                      {page.views} views • {page.bounceRate?.toFixed(1)}% bounce
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No page data</div>
            )}
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Traffic Sources</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data?.trafficSources.length ? (
              data.trafficSources.map((source, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{source.source}</div>
                    <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
                      {source.visitors} ({source.percentage.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No traffic source data</div>
            )}
          </div>
        </div>
      </div>

      {/* Entry/Exit Pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Entry Pages</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data?.entryPages.length ? (
              data.entryPages.map((page, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate flex-1">{page.path}</div>
                    <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">{page.entries} entries</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No entry page data</div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Exit Pages</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data?.exitPages.length ? (
              data.exitPages.map((page, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate flex-1">{page.path}</div>
                    <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">{page.exits} exits</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No exit page data</div>
            )}
          </div>
        </div>
      </div>

      {/* Devices & Browsers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Devices</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data?.devices.length ? (
              data.devices.map((device, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 dark:text-gray-100 capitalize">{device.type}</div>
                    <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
                      {device.count} ({device.percentage.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No device data</div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Browsers</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data?.browsers.length ? (
              data.browsers.map((browser, idx) => (
                <div key={idx} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{browser.name}</div>
                    <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
                      {browser.count} ({browser.percentage.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No browser data</div>
            )}
          </div>
        </div>
      </div>

      {/* Geography */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Geographic Distribution</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {data?.geography.length ? (
            data.geography.map((geo, idx) => (
              <div key={idx} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{geo.country}</div>
                  <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
                    {geo.visitors} visitors ({geo.percentage.toFixed(1)}%)
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No geographic data</div>
          )}
        </div>
      </div>
    </div>
  );
}
