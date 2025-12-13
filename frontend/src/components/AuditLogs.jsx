import React, { useState, useEffect } from 'react';
import { getAuditLogs, getAuditStats, getMayanEvents, getUsers } from '../services/api';
import { AuditLogListSkeleton } from './ui/SkeletonLoader';
import { 
  Activity, 
  Eye, 
  Download, 
  Upload, 
  Trash2, 
  Shield, 
  ShieldOff, 
  LogIn, 
  Search,
  Filter,
  RefreshCw,
  Calendar,
  User,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Database,
  ToggleLeft,
  ToggleRight,
  Folder,
  Tag,
  Edit,
  CheckCircle
} from 'lucide-react';

// Action type configuration with colors and icons
const ACTION_CONFIG = {
  DOCUMENT_VIEW: { 
    label: 'View', 
    icon: Eye, 
    color: 'bg-blue-100 text-blue-800',
    borderColor: 'border-l-blue-500'
  },
  DOCUMENT_DOWNLOAD: { 
    label: 'Download', 
    icon: Download, 
    color: 'bg-emerald-100 text-emerald-800',
    borderColor: 'border-l-emerald-500'
  },
  DOCUMENT_UPLOAD: { 
    label: 'Upload', 
    icon: Upload, 
    color: 'bg-purple-100 text-purple-800',
    borderColor: 'border-l-purple-500'
  },
  DOCUMENT_DELETE: { 
    label: 'Delete', 
    icon: Trash2, 
    color: 'bg-red-100 text-red-800',
    borderColor: 'border-l-red-500'
  },
  ACCESS_GRANTED: { 
    label: 'Access Granted', 
    icon: Shield, 
    color: 'bg-green-100 text-green-800',
    borderColor: 'border-l-green-500'
  },
  ACCESS_REVOKED: { 
    label: 'Access Revoked', 
    icon: ShieldOff, 
    color: 'bg-amber-100 text-amber-800',
    borderColor: 'border-l-amber-500'
  },
  ACCESS_DENIED: { 
    label: 'Access Denied', 
    icon: AlertTriangle, 
    color: 'bg-red-100 text-red-800',
    borderColor: 'border-l-red-500'
  },
  USER_LOGIN: { 
    label: 'Login', 
    icon: LogIn, 
    color: 'bg-teal-100 text-teal-800',
    borderColor: 'border-l-teal-500'
  },
  DOCUMENT_SEARCH: { 
    label: 'Search', 
    icon: Search, 
    color: 'bg-slate-100 text-slate-800',
    borderColor: 'border-l-slate-500'
  },
  // Mayan event types
  MAYAN_DOCUMENT_CREATED: { 
    label: 'Document Created', 
    icon: FileText, 
    color: 'bg-indigo-100 text-indigo-800',
    borderColor: 'border-l-indigo-500',
    source: 'mayan'
  },
  MAYAN_DOCUMENT_EDITED: { 
    label: 'Document Edited', 
    icon: Edit, 
    color: 'bg-orange-100 text-orange-800',
    borderColor: 'border-l-orange-500',
    source: 'mayan'
  },
  MAYAN_DOCUMENT_DOWNLOADED: { 
    label: 'Document Downloaded', 
    icon: Download, 
    color: 'bg-cyan-100 text-cyan-800',
    borderColor: 'border-l-cyan-500',
    source: 'mayan'
  },
  MAYAN_OCR_COMPLETED: { 
    label: 'OCR Completed', 
    icon: CheckCircle, 
    color: 'bg-green-100 text-green-800',
    borderColor: 'border-l-green-500',
    source: 'mayan'
  },
  MAYAN_TAG_ATTACHED: { 
    label: 'Tag Attached', 
    icon: Tag, 
    color: 'bg-pink-100 text-pink-800',
    borderColor: 'border-l-pink-500',
    source: 'mayan'
  },
  MAYAN_CABINET_ADDED: { 
    label: 'Added to Cabinet', 
    icon: Folder, 
    color: 'bg-violet-100 text-violet-800',
    borderColor: 'border-l-violet-500',
    source: 'mayan'
  },
  MAYAN_EVENT: { 
    label: 'Mayan Event', 
    icon: Database, 
    color: 'bg-slate-100 text-slate-800',
    borderColor: 'border-l-slate-500',
    source: 'mayan'
  },
};

function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [mayanEvents, setMayanEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [includeMayanEvents, setIncludeMayanEvents] = useState(false);
  const [filters, setFilters] = useState({
    action: '',
    search: '',
    userId: ''
  });
  const limit = 20;

  useEffect(() => {
    loadAuditData();
    loadUsers();
  }, [page, includeMayanEvents]);

  const loadUsers = async () => {
    try {
      const response = await getUsers();
      setUsers(response.data?.users || response.data || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadAuditData = async () => {
    try {
      setLoading(true);
      const promises = [
        getAuditLogs(limit, (page - 1) * limit),
        getAuditStats().catch(() => ({ data: null }))
      ];
      
      // Also fetch Mayan events if enabled
      if (includeMayanEvents) {
        promises.push(getMayanEvents({ limit: 50 }).catch(() => ({ data: { events: [] } })));
      }
      
      const results = await Promise.all(promises);
      
      setLogs(results[0].data.logs || []);
      setStats(results[1].data);
      
      if (includeMayanEvents && results[2]) {
        // Transform Mayan events to match our log format
        const transformedEvents = (results[2].data.events || []).map(event => ({
          action: mapMayanEventType(event.verb || event.action_object?.type || 'MAYAN_EVENT'),
          timestamp: event.datetime || event.timestamp,
          userEmail: event.actor?.label || event.actor_content_type?.label || 'Mayan System',
          documentTitle: event.action_object?.label || event.target?.label || null,
          documentId: event.action_object?.id || event.target?.id || null,
          isMayanEvent: true,
          originalEvent: event
        }));
        setMayanEvents(transformedEvents);
      } else {
        setMayanEvents([]);
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Map Mayan event verbs to our action types
  const mapMayanEventType = (verb) => {
    const verbLower = (verb || '').toLowerCase();
    if (verbLower.includes('creat') || verbLower.includes('upload')) return 'MAYAN_DOCUMENT_CREATED';
    if (verbLower.includes('edit') || verbLower.includes('modif')) return 'MAYAN_DOCUMENT_EDITED';
    if (verbLower.includes('download')) return 'MAYAN_DOCUMENT_DOWNLOADED';
    if (verbLower.includes('ocr') || verbLower.includes('process')) return 'MAYAN_OCR_COMPLETED';
    if (verbLower.includes('tag')) return 'MAYAN_TAG_ATTACHED';
    if (verbLower.includes('cabinet')) return 'MAYAN_CABINET_ADDED';
    return 'MAYAN_EVENT';
  };

  const getActionConfig = (action) => {
    return ACTION_CONFIG[action] || {
      label: action,
      icon: Activity,
      color: 'bg-slate-100 text-slate-800',
      borderColor: 'border-l-slate-500'
    };
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Combine and filter logs
  const allLogs = [...logs, ...(includeMayanEvents ? mayanEvents : [])];
  
  // Sort by timestamp descending
  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  const filteredLogs = allLogs.filter(log => {
    if (filters.action && log.action !== filters.action) return false;
    // Filter by user
    if (filters.userId) {
      const selectedUser = users.find(u => u.id === filters.userId);
      if (selectedUser && log.userEmail && !log.userEmail.toLowerCase().includes(selectedUser.email?.toLowerCase() || selectedUser.username?.toLowerCase())) {
        return false;
      }
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        log.userEmail?.toLowerCase().includes(searchLower) ||
        log.documentTitle?.toLowerCase().includes(searchLower) ||
        log.action?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  // Calculate stats from current logs
  const quickStats = {
    views: logs.filter(l => l.action === 'DOCUMENT_VIEW').length,
    downloads: logs.filter(l => l.action === 'DOCUMENT_DOWNLOAD').length,
    uploads: logs.filter(l => l.action === 'DOCUMENT_UPLOAD').length,
    denied: logs.filter(l => l.action === 'ACCESS_DENIED').length
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{quickStats.views}</p>
              <p className="text-sm text-slate-500">Views</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Download className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{quickStats.downloads}</p>
              <p className="text-sm text-slate-500">Downloads</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Upload className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{quickStats.uploads}</p>
              <p className="text-sm text-slate-500">Uploads</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{quickStats.denied}</p>
              <p className="text-sm text-slate-500">Access Denied</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by user, document..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="input pl-10"
            />
          </div>
          
          {/* User Filter */}
          <select
            value={filters.userId}
            onChange={(e) => setFilters(prev => ({ ...prev, userId: e.target.value }))}
            className="select w-full sm:w-44"
          >
            <option value="">All Users</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.email || user.username || user.firstName || `User ${user.id}`}
              </option>
            ))}
          </select>
          
          <select
            value={filters.action}
            onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
            className="select w-full sm:w-48"
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
          
          {/* Mayan Events Toggle */}
          <button
            onClick={() => setIncludeMayanEvents(!includeMayanEvents)}
            className={`btn ${includeMayanEvents ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
          >
            {includeMayanEvents ? (
              <ToggleRight className="w-4 h-4" />
            ) : (
              <ToggleLeft className="w-4 h-4" />
            )}
            <Database className="w-4 h-4" />
            Mayan Events
          </button>
          
          <button
            onClick={loadAuditData}
            className="btn btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        
        {includeMayanEvents && (
          <div className="mt-3 text-sm text-slate-500 flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-500" />
            Including events from Mayan EDMS. Showing {mayanEvents.length} Mayan events merged with application logs.
          </div>
        )}
      </div>

      {/* Logs List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4">
            <AuditLogListSkeleton count={8} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No audit logs found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log, index) => {
              const config = getActionConfig(log.action);
              const Icon = config.icon;
              
              return (
                <div 
                  key={index} 
                  className={`p-4 hover:bg-slate-50 border-l-4 ${config.borderColor} transition-colors`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color.split(' ')[0]}`}>
                      <Icon className={`w-5 h-5 ${config.color.split(' ')[1]}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`badge ${config.color}`}>
                          {config.label}
                        </span>
                        {log.isMayanEvent && (
                          <span className="badge bg-indigo-100 text-indigo-800 text-xs">
                            <Database className="w-3 h-3 mr-1" />
                            Mayan
                          </span>
                        )}
                        <span className="text-sm text-slate-500">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      
                      <div className="mt-2 space-y-1">
                        {log.userEmail && (
                          <p className="text-sm text-slate-700 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {log.userEmail}
                          </p>
                        )}
                        
                        {(log.documentId || log.documentTitle) && (
                          <p className="text-sm text-slate-700 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            {log.documentTitle || `Document #${log.documentId}`}
                          </p>
                        )}
                        
                        {log.requestedPermission && (
                          <p className="text-sm text-slate-500">
                            Requested: <span className="font-medium">{log.requestedPermission}</span>
                          </p>
                        )}
                        
                        {log.isMayanEvent && log.originalEvent?.verb && (
                          <p className="text-xs text-slate-400 mt-1">
                            Event: {log.originalEvent.verb}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-xs text-slate-400 text-right flex-shrink-0">
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && filteredLogs.length > 0 && (
        <div className="flex items-center justify-center gap-2">
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          
          <span className="px-4 py-2 text-sm text-slate-600">
            Page {page}
          </span>
          
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setPage(p => p + 1)}
            disabled={logs.length < limit}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default AuditLogs;
