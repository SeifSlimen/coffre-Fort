import React, { useState, useEffect } from 'react';
import { getStorageStats } from '../services/api';
import { StatGridSkeleton, StorageBarSkeleton } from './ui/SkeletonLoader';
import { 
  HardDrive, 
  FileText, 
  Cpu, 
  Database,
  Server,
  Clock,
  RefreshCw,
  PieChart,
  Folder,
  FileType,
  Layers,
  CheckCircle,
  AlertCircle,
  TrendingUp
} from 'lucide-react';

const StorageStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  // Auto-refresh every 30 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadStats = async () => {
    try {
      setRefreshing(true);
      const response = await getStorageStats();
      setStats(response.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load storage statistics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getColorForPercent = (percent) => {
    if (percent < 50) return 'bg-emerald-500';
    if (percent < 75) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={4} />
        <div className="card p-6 space-y-4">
          {Array(4).fill(0).map((_, i) => (
            <StorageBarSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load Storage Stats</h3>
        <p className="text-slate-500 mb-4">{error}</p>
        <button onClick={loadStats} className="btn btn-primary">
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Storage & System Stats</h2>
          <p className="text-sm text-slate-500">
            {lastUpdated ? (
              <>Last updated: {lastUpdated.toLocaleTimeString()} {autoRefresh && <span className="text-primary-600">(auto-refresh on)</span>}</>
            ) : (
              'Real-time storage usage and system information'
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <button 
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn btn-sm ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
            title={autoRefresh ? 'Auto-refresh is ON (every 30s)' : 'Auto-refresh is OFF'}
          >
            <Clock className="w-4 h-4" />
            {autoRefresh ? 'Auto' : 'Manual'}
          </button>
          <button 
            onClick={loadStats} 
            disabled={refreshing}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documents */}
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {stats?.storage?.documents?.total?.toLocaleString() || 0}
              </p>
              <p className="text-sm text-slate-500">Total Documents</p>
            </div>
          </div>
        </div>

        {/* Document Storage */}
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Database className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {stats?.storage?.documents?.estimatedStorageFormatted || '0 B'}
              </p>
              <p className="text-sm text-slate-500">Documents Size</p>
            </div>
          </div>
        </div>

        {/* OCR Processed */}
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Layers className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {stats?.ocr?.processedPercent || 0}%
              </p>
              <p className="text-sm text-slate-500">OCR Processed</p>
            </div>
          </div>
        </div>

        {/* System Uptime */}
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {formatUptime(stats?.system?.uptime || 0)}
              </p>
              <p className="text-sm text-slate-500">System Uptime</p>
            </div>
          </div>
        </div>
      </div>

      {/* Disk Usage */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <HardDrive className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">Disk Storage</h3>
        </div>
        
        <div className="space-y-4">
          {/* Disk Usage Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600">
                Used: <span className="font-semibold text-slate-900">{stats?.storage?.disk?.usedFormatted || '0 B'}</span>
              </span>
              <span className="text-slate-600">
                Free: <span className="font-semibold text-slate-900">{stats?.storage?.disk?.freeFormatted || '0 B'}</span>
              </span>
            </div>
            <div className="progress-bar h-4">
              <div 
                className={`progress-bar-fill ${getColorForPercent(stats?.storage?.disk?.usedPercent || 0)}`}
                style={{ width: `${stats?.storage?.disk?.usedPercent || 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>{stats?.storage?.disk?.usedPercent || 0}% used</span>
              <span>Total: {stats?.storage?.disk?.totalFormatted || '0 B'}</span>
            </div>
          </div>

          {/* Memory Usage Bar */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">System Memory</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600">
                Used: <span className="font-semibold text-slate-900">{stats?.system?.memory?.usedFormatted || '0 B'}</span>
              </span>
              <span className="text-slate-600">
                Free: <span className="font-semibold text-slate-900">{stats?.system?.memory?.freeFormatted || '0 B'}</span>
              </span>
            </div>
            <div className="progress-bar h-3">
              <div 
                className={`progress-bar-fill ${getColorForPercent(stats?.system?.memory?.usedPercent || 0)}`}
                style={{ width: `${stats?.system?.memory?.usedPercent || 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>{stats?.system?.memory?.usedPercent || 0}% used</span>
              <span>Total: {stats?.system?.memory?.totalFormatted || '0 B'}</span>
            </div>
          </div>

          {/* Cache Usage */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Redis Cache</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">
                Memory: <span className="font-semibold text-slate-900">{stats?.storage?.cache?.redisMemoryFormatted || '0 B'}</span>
              </span>
              <span className="badge badge-info">
                {stats?.storage?.cache?.cacheKeyCount || 0} keys
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Storage by Document Type */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Folder className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-900">Storage by Document Type</h3>
          </div>
          
          {stats?.documentTypes?.length > 0 ? (
            <div className="space-y-3">
              {stats.documentTypes.map((type, index) => (
                <div key={type.id || index}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700 truncate">{type.label}</span>
                    <span className="text-slate-500 flex-shrink-0 ml-2">
                      {type.documentCount} docs • {type.storageFormatted}
                    </span>
                  </div>
                  <div className="progress-bar h-2">
                    <div 
                      className="progress-bar-fill bg-primary-500"
                      style={{ width: `${type.percent || 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No document types found</p>
          )}
        </div>

        {/* Storage by File Type */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileType className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-900">Storage by File Type</h3>
          </div>
          
          {stats?.fileTypes?.length > 0 ? (
            <div className="space-y-3">
              {stats.fileTypes.slice(0, 5).map((type, index) => {
                const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-red-500'];
                return (
                  <div key={type.extension || index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">
                        <span className="inline-flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${colors[index % colors.length]}`} />
                          {type.extension}
                        </span>
                      </span>
                      <span className="text-slate-500">
                        {type.count} files • {type.storageFormatted}
                      </span>
                    </div>
                    <div className="progress-bar h-2">
                      <div 
                        className={`progress-bar-fill ${colors[index % colors.length]}`}
                        style={{ width: `${type.percent || 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No files found</p>
          )}
        </div>
      </div>

      {/* OCR Processing Status */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">OCR Processing Status</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold text-emerald-700">{stats?.ocr?.processed || 0}</p>
              <p className="text-sm text-emerald-600">Documents Processed</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl">
            <Clock className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-amber-700">{stats?.ocr?.pending || 0}</p>
              <p className="text-sm text-amber-600">Pending OCR</p>
            </div>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="card p-4 bg-slate-50">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
          <span>Platform: <span className="font-medium text-slate-700">{stats?.system?.platform}</span></span>
          <span>Node: <span className="font-medium text-slate-700">{stats?.system?.nodeVersion}</span></span>
          <span>Last Updated: <span className="font-medium text-slate-700">
            {stats?.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString() : 'N/A'}
          </span></span>
        </div>
      </div>
    </div>
  );
};

export default StorageStats;
