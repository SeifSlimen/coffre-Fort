import React, { useState, useEffect } from 'react';
import { getCacheStats, clearAllCache, clearCacheType, getCacheKeys, deleteCacheKey, deleteCachePattern } from '../services/api';
import { 
  Database, 
  RefreshCw, 
  Trash2, 
  Clock, 
  FileText, 
  Cpu, 
  HardDrive,
  Zap,
  AlertCircle,
  CheckCircle,
  Files,
  Sparkles,
  Search,
  X
} from 'lucide-react';

function CacheStats() {
  const [stats, setStats] = useState(null);
  const [detailedKeys, setDetailedKeys] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchPattern, setSearchPattern] = useState('cache:*');
  const [showKeyManager, setShowKeyManager] = useState(false);

  useEffect(() => {
    loadCacheStats();
  }, []);

  const loadCacheStats = async () => {
    try {
      setLoading(true);
      const response = await getCacheStats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
      setMessage({ type: 'error', text: 'Failed to load cache statistics' });
    } finally {
      setLoading(false);
    }
  };

  const loadDetailedKeys = async (pattern = 'cache:*') => {
    try {
      const response = await getCacheKeys(pattern, 200);
      setDetailedKeys(response.data);
    } catch (error) {
      console.error('Failed to load cache keys:', error);
      setMessage({ type: 'error', text: 'Failed to load cache keys' });
    }
  };

  const handleDeleteKey = async (key) => {
    if (!window.confirm(`Delete cache key?\n\n${key}`)) return;
    
    try {
      await deleteCacheKey(key);
      setMessage({ type: 'success', text: `Deleted: ${key}` });
      loadDetailedKeys(searchPattern);
      loadCacheStats();
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to delete key: ${error.message}` });
    }
  };

  const handleDeletePattern = async () => {
    if (searchPattern === 'cache:*') {
      setMessage({ type: 'error', text: 'Use "Clear All" button for cache:* pattern' });
      return;
    }
    if (!window.confirm(`Delete all keys matching pattern?\n\n${searchPattern}`)) return;
    
    try {
      const response = await deleteCachePattern(searchPattern);
      setMessage({ type: 'success', text: response.data.message });
      loadDetailedKeys(searchPattern);
      loadCacheStats();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to delete pattern' });
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all cached data? This may temporarily slow down the application.')) {
      return;
    }

    try {
      setClearing(true);
      await clearAllCache();
      setMessage({ type: 'success', text: 'All cache cleared successfully!' });
      loadCacheStats();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to clear cache' });
    } finally {
      setClearing(false);
    }
  };

  const handleClearType = async (type) => {
    try {
      setClearing(true);
      await clearCacheType(type);
      setMessage({ type: 'success', text: `${type} cache cleared successfully!` });
      loadCacheStats();
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to clear ${type} cache` });
    } finally {
      setClearing(false);
    }
  };

  const formatTTL = (seconds) => {
    if (seconds < 0) return 'No expiry';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const getCacheTypeIcon = (type) => {
    switch (type) {
      case 'documents': return Files;
      case 'document': return FileText;
      case 'ocr': return Cpu;
      case 'ai': return Sparkles;
      default: return Database;
    }
  };

  const getCacheTypeColor = (type) => {
    switch (type) {
      case 'documents': return 'bg-blue-100 text-blue-600';
      case 'document': return 'bg-emerald-100 text-emerald-600';
      case 'ocr': return 'bg-purple-100 text-purple-600';
      case 'ai': return 'bg-amber-100 text-amber-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  if (loading) {
    return (
      <div className="card p-12 text-center">
        <div className="spinner mx-auto mb-4" />
        <p className="text-slate-500">Loading cache statistics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-2 ${
          message.type === 'success' 
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {message.text}
          <button 
            onClick={() => setMessage(null)}
            className="ml-auto text-current opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
              <Database className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalKeys || 0}</p>
              <p className="text-sm text-slate-500">Total Cached Items</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Files className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats?.cacheTypes?.documents || 0}</p>
              <p className="text-sm text-slate-500">Document Lists</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Cpu className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats?.cacheTypes?.ocr || 0}</p>
              <p className="text-sm text-slate-500">OCR Results</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats?.cacheTypes?.ai || 0}</p>
              <p className="text-sm text-slate-500">AI Summaries</p>
            </div>
          </div>
        </div>
      </div>

      {/* TTL Configuration */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          Cache TTL Configuration
        </h3>
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats?.ttlConfig && Object.entries(stats.ttlConfig).map(([key, value]) => (
            <div key={key} className="p-4 bg-slate-50 rounded-xl">
              <p className="text-sm font-medium text-slate-500 mb-1">{key.replace(/_/g, ' ')}</p>
              <p className="text-xl font-bold text-slate-900">{formatTTL(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cache Actions */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-slate-400" />
            Cache Management
          </h3>
          
          <button
            onClick={loadCacheStats}
            className="btn btn-ghost btn-sm"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {['documents', 'document', 'ocr', 'ai'].map((type) => {
            const Icon = getCacheTypeIcon(type);
            const colorClass = getCacheTypeColor(type);
            const count = stats?.cacheTypes?.[type] || 0;
            
            return (
              <button
                key={type}
                onClick={() => handleClearType(type)}
                disabled={clearing || count === 0}
                className="p-4 bg-slate-50 hover:bg-slate-100 rounded-xl text-left transition-colors disabled:opacity-50"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-sm font-medium text-slate-900 capitalize">{type}</p>
                <p className="text-xs text-slate-500">{count} items</p>
              </button>
            );
          })}
          
          <button
            onClick={handleClearAll}
            disabled={clearing || stats?.totalKeys === 0}
            className="p-4 bg-red-50 hover:bg-red-100 rounded-xl text-left transition-colors disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 bg-red-100 text-red-600">
              <Trash2 className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium text-red-700">Clear All</p>
            <p className="text-xs text-red-500">{stats?.totalKeys || 0} items</p>
          </button>
        </div>
      </div>

      {/* Cache Keys Table */}
      {stats?.keys && stats.keys.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-slate-400" />
              Cached Keys ({stats.keys.length})
            </h3>
            <button
              onClick={() => { setShowKeyManager(!showKeyManager); if (!showKeyManager) loadDetailedKeys(); }}
              className="btn btn-secondary btn-sm"
            >
              {showKeyManager ? 'Hide Manager' : '🔧 Key Manager'}
            </button>
          </div>

          {/* Advanced Key Manager */}
          {showKeyManager && (
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <div className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchPattern}
                    onChange={(e) => setSearchPattern(e.target.value)}
                    placeholder="cache:ocr:* or cache:ai:*"
                    className="input pl-10 w-full"
                  />
                </div>
                <button
                  onClick={() => loadDetailedKeys(searchPattern)}
                  className="btn btn-primary"
                >
                  <Search className="w-4 h-4" />
                  Search
                </button>
                <button
                  onClick={handleDeletePattern}
                  className="btn btn-danger"
                  disabled={searchPattern === 'cache:*'}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Pattern
                </button>
              </div>
              
              {detailedKeys && (
                <div className="text-sm text-slate-600 mb-2">
                  Found {detailedKeys.totalMatched} keys, showing {detailedKeys.returned}
                  {detailedKeys.namespaces?.length > 0 && (
                    <span className="ml-2">
                      | Namespaces: {detailedKeys.namespaces.map(n => `${n.name}(${n.count})`).join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Key list with delete buttons when manager is open */}
          {showKeyManager && detailedKeys?.keys ? (
            <div className="max-h-96 overflow-auto">
              <table className="table w-full">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th>Namespace</th>
                    <th>Key</th>
                    <th>TTL</th>
                    <th>Size</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {detailedKeys.keys.map((item, index) => {
                    const Icon = getCacheTypeIcon(item.namespace);
                    const colorClass = getCacheTypeColor(item.namespace);
                    
                    return (
                      <tr key={index} className="hover:bg-slate-50">
                        <td>
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${colorClass}`}>
                            <Icon className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">{item.namespace}</span>
                          </div>
                        </td>
                        <td>
                          <code className="text-xs bg-slate-100 px-2 py-1 rounded break-all">
                            {item.subkey || item.key}
                          </code>
                        </td>
                        <td>
                          <span className={`badge ${item.ttl < 60 ? 'badge-warning' : 'badge-success'}`}>
                            {item.ttlFormatted}
                          </span>
                        </td>
                        <td className="text-xs text-slate-500">{item.sizeFormatted}</td>
                        <td>
                          <button
                            onClick={() => handleDeleteKey(item.key)}
                            className="btn btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Cache Key</th>
                    <th>TTL Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.keys.slice(0, 20).map((item, index) => {
                    const Icon = getCacheTypeIcon(item.type);
                    const colorClass = getCacheTypeColor(item.type);
                    
                    return (
                      <tr key={index}>
                        <td>
                          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${colorClass}`}>
                            <Icon className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium capitalize">{item.type}</span>
                          </div>
                        </td>
                        <td>
                          <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                            {item.key}
                          </code>
                        </td>
                        <td>
                          <span className={`badge ${item.ttl < 60 ? 'badge-warning' : 'badge-success'}`}>
                            <Clock className="w-3 h-3 mr-1" />
                            {formatTTL(item.ttl)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {!showKeyManager && stats.keys.length > 20 && (
            <div className="p-3 bg-slate-50 text-center text-sm text-slate-500">
              Showing 20 of {stats.keys.length} cached keys
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CacheStats;
