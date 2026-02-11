'use client';

import { useEffect, useState } from 'react';

interface AnalyticsWidgetData {
  metrics: {
    total_visitors: number;
    bounce_rate: number;
    avg_session_time: number;
    pages_per_session: number;
  };
  activeVisitors: Array<{
    currentPage: string;
    device: string;
    lastSeen: number;
  }>;
}

export default function AnalyticsWidget() {
  const [data, setData] = useState<AnalyticsWidgetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/analytics/stats?timeRange=24h');
        if (response.ok) {
          const analyticsData = await response.json();
          setData(analyticsData);
        }
      } catch (error) {
        console.error('Error fetching analytics widget:', error);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchData();

    // Set up SSE for real-time updates
    const eventSource = new EventSource('/api/analytics/stream');
    
    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'update' && message.data) {
          setData(prevData => {
            if (!prevData) {
              // If no previous data, fetch full data
              fetchData();
              return prevData;
            }
            return {
              ...prevData,
              activeVisitors: message.data.activeVisitors || prevData.activeVisitors,
              metrics: {
                ...prevData.metrics,
                ...message.data.metrics,
              },
            };
          });
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = () => {
      // Fallback to polling if SSE fails
      const interval = setInterval(fetchData, 10000);
      return () => {
        clearInterval(interval);
        eventSource.close();
      };
    };

    // Fallback polling
    const interval = setInterval(fetchData, 30000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, []);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4 sm:p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-4 gap-4">
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Real-Time Analytics</h2>
        <span className="text-xs text-gray-500">Last 24h</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div>
          <div className="text-sm text-gray-600 mb-1">Active Visitors</div>
          <div className="text-2xl font-bold text-indigo-600">
            {data?.activeVisitors.length || 0}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Bounce Rate</div>
          <div className="text-2xl font-bold text-gray-900">
            {data?.metrics.bounce_rate.toFixed(1) || '0'}%
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Avg Session</div>
          <div className="text-2xl font-bold text-gray-900">
            {data ? formatTime(data.metrics.avg_session_time) : '0s'}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Pages/Session</div>
          <div className="text-2xl font-bold text-gray-900">
            {data?.metrics.pages_per_session.toFixed(1) || '0'}
          </div>
        </div>
      </div>

      {data?.activeVisitors.length ? (
        <div className="border-t border-gray-200 pt-4">
          <div className="text-sm font-medium text-gray-700 mb-2">Active Now</div>
          <div className="space-y-2">
            {data.activeVisitors.slice(0, 3).map((visitor, idx) => (
              <div key={idx} className="text-sm text-gray-600">
                <span className="font-medium">{visitor.currentPage}</span>
                <span className="text-gray-400 ml-2">• {visitor.device}</span>
              </div>
            ))}
            {data.activeVisitors.length > 3 && (
              <div className="text-xs text-gray-500">
                +{data.activeVisitors.length - 3} more
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
