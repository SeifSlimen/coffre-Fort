import React, { useState, useEffect } from 'react';
import { 
  getAccessRequests, 
  approveAccessRequest, 
  rejectAccessRequest,
  getPendingRequestCount 
} from '../services/api';
import { AuditLogListSkeleton } from './ui/SkeletonLoader';
import { 
  Shield, 
  Check, 
  X, 
  Clock, 
  User, 
  FileText, 
  Calendar,
  MessageSquare,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter
} from 'lucide-react';

const AccessRequests = ({ onRequestProcessed }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending'); // pending, all, approved, rejected
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [expiryDays, setExpiryDays] = useState(7);
  const [actionNote, setActionNote] = useState('');

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const response = await getAccessRequests(filter === 'pending' ? 'pending' : null);
      let filteredRequests = response.data.requests || [];
      
      if (filter === 'approved') {
        filteredRequests = filteredRequests.filter(r => r.status === 'approved');
      } else if (filter === 'rejected') {
        filteredRequests = filteredRequests.filter(r => r.status === 'rejected');
      }
      
      setRequests(filteredRequests);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load access requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request) => {
    try {
      setActionLoading(request.id);
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);
      
      await approveAccessRequest(request.id, expiresAt.toISOString(), actionNote);
      
      // Refresh list and notify parent
      await loadRequests();
      if (onRequestProcessed) onRequestProcessed();
      setSelectedRequest(null);
      setActionNote('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (request) => {
    try {
      setActionLoading(request.id);
      await rejectAccessRequest(request.id, actionNote);
      
      // Refresh list and notify parent
      await loadRequests();
      if (onRequestProcessed) onRequestProcessed();
      setSelectedRequest(null);
      setActionNote('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="badge badge-warning"><Clock className="w-3 h-3 mr-1" />Pending</span>;
      case 'approved':
        return <span className="badge badge-success"><CheckCircle className="w-3 h-3 mr-1" />Approved</span>;
      case 'rejected':
        return <span className="badge badge-danger"><XCircle className="w-3 h-3 mr-1" />Rejected</span>;
      default:
        return <span className="badge badge-slate">{status}</span>;
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (loading && requests.length === 0) {
    return <AuditLogListSkeleton count={5} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Shield className="w-6 h-6 text-primary-600" />
            {pendingCount > 0 && (
              <span className="request-badge">{pendingCount}</span>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Access Requests</h3>
            <p className="text-sm text-slate-500">
              {pendingCount} pending request{pendingCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="select py-1.5 text-sm"
            >
              <option value="pending">Pending Only</option>
              <option value="all">All Requests</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          
          <button onClick={loadRequests} className="btn btn-secondary btn-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          {error}
        </div>
      )}

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="card p-12 text-center">
          <Shield className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Access Requests</h3>
          <p className="text-slate-500">
            {filter === 'pending' 
              ? 'There are no pending access requests'
              : 'No access requests found with the selected filter'
            }
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100">
            {requests.map((request) => (
              <div 
                key={request.id} 
                className={`p-4 hover:bg-slate-50 transition-colors ${
                  request.status === 'pending' ? 'bg-amber-50/30' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* User Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    request.status === 'pending' ? 'bg-amber-100' :
                    request.status === 'approved' ? 'bg-emerald-100' : 'bg-red-100'
                  }`}>
                    <User className={`w-5 h-5 ${
                      request.status === 'pending' ? 'text-amber-600' :
                      request.status === 'approved' ? 'text-emerald-600' : 'text-red-600'
                    }`} />
                  </div>
                  
                  {/* Request Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{request.userEmail}</span>
                      {getStatusBadge(request.status)}
                    </div>
                    
                    <p className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Requesting access to: <span className="font-medium">{request.documentTitle}</span>
                    </p>
                    
                    {request.reason && (
                      <p className="text-sm text-slate-500 mt-2 flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        "{request.reason}"
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Requested: {formatDate(request.createdAt)}
                      </span>
                      
                      {request.permissions && (
                        <span className="flex items-center gap-1">
                          Permissions: {request.permissions.join(', ')}
                        </span>
                      )}
                      
                      {request.reviewedBy && (
                        <span className="flex items-center gap-1">
                          Reviewed by: {request.reviewedBy}
                        </span>
                      )}
                    </div>
                    
                    {request.reviewNote && (
                      <p className="text-xs text-slate-500 mt-1 italic">
                        Note: "{request.reviewNote}"
                      </p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  {request.status === 'pending' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {selectedRequest?.id === request.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={expiryDays}
                            onChange={(e) => setExpiryDays(parseInt(e.target.value))}
                            className="select py-1 text-xs w-24"
                          >
                            <option value={1}>1 day</option>
                            <option value={7}>7 days</option>
                            <option value={14}>14 days</option>
                            <option value={30}>30 days</option>
                            <option value={90}>90 days</option>
                          </select>
                          
                          <button
                            onClick={() => handleApprove(request)}
                            disabled={actionLoading === request.id}
                            className="btn btn-success btn-sm"
                          >
                            {actionLoading === request.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleReject(request)}
                            disabled={actionLoading === request.id}
                            className="btn btn-danger btn-sm"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          
                          <button
                            onClick={() => setSelectedRequest(null)}
                            className="btn btn-ghost btn-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedRequest(request)}
                          className="btn btn-primary btn-sm"
                        >
                          Review
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-xl font-bold text-slate-900">
                {requests.filter(r => r.status === 'pending').length}
              </p>
              <p className="text-sm text-slate-500">Pending</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
            <div>
              <p className="text-xl font-bold text-slate-900">
                {requests.filter(r => r.status === 'approved').length}
              </p>
              <p className="text-sm text-slate-500">Approved</p>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <XCircle className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-xl font-bold text-slate-900">
                {requests.filter(r => r.status === 'rejected').length}
              </p>
              <p className="text-sm text-slate-500">Rejected</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessRequests;
