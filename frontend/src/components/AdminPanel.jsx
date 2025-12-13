import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUsers, grantAccess, revokeAccess, getAccessGrants, getDocuments, getPermissionTypes, createUser, deleteUser, getPendingRequestCount } from '../services/api';
import AuditLogs from './AuditLogs';
import CacheStats from './CacheStats';
import StorageStats from './StorageStats';
import AccessRequests from './AccessRequests';
import CabinetManager from './CabinetManager';
import AdvancedSearch from './AdvancedSearch';
import { 
  Users, 
  Shield, 
  Activity, 
  Database, 
  Plus, 
  X, 
  Trash2, 
  ChevronLeft,
  Clock,
  FileText,
  Check,
  UserPlus,
  Key,
  Eye,
  Download,
  Cpu,
  Sparkles,
  Upload,
  AlertCircle,
  CheckCircle,
  HardDrive,
  Inbox,
  Folder,
  Search
} from 'lucide-react';

// Tab definitions
const TABS = [
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'access', label: 'Access Control', icon: Shield },
  { id: 'requests', label: 'Access Requests', icon: Inbox, showBadge: true },
  { id: 'cabinets', label: 'Cabinets', icon: Folder },
  { id: 'search', label: 'Advanced Search', icon: Search },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'audit', label: 'Audit Logs', icon: Activity },
  { id: 'cache', label: 'Cache Stats', icon: Database },
];

const AdminPanel = ({ user: propUser }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get initial tab from URL
  const getInitialTab = () => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') || 'users';
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [users, setUsers] = useState([]);
  const [grants, setGrants] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [permissionTypes, setPermissionTypes] = useState([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [grantForm, setGrantForm] = useState({
    userId: '',
    documentId: '',
    expiresAt: '',
    permissions: ['view']
  });
  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'user'
  });

  // Update URL when tab changes
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`/admin?tab=${tabId}`, { replace: true });
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update tab when URL changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && TABS.find(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadUsers(), loadGrants(), loadDocuments(), loadPermissionTypes(), loadPendingRequestCount()]);
    setLoading(false);
  };

  const loadPendingRequestCount = async () => {
    try {
      const response = await getPendingRequestCount();
      setPendingRequestCount(response.data.count || 0);
    } catch (err) {
      console.error('Failed to load pending request count:', err);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await getUsers();
      setUsers(response.data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const loadGrants = async () => {
    try {
      const response = await getAccessGrants();
      setGrants(response.data.grants || []);
    } catch (err) {
      console.error('Failed to load grants:', err);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await getDocuments(1, 100);
      setDocuments(response.data.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const loadPermissionTypes = async () => {
    try {
      const response = await getPermissionTypes();
      setPermissionTypes(response.data.permissions || []);
    } catch (err) {
      console.error('Failed to load permission types:', err);
      setPermissionTypes([
        { id: 'view', name: 'View Document', description: 'Can view document details' },
        { id: 'download', name: 'Download', description: 'Can download the document file' },
        { id: 'ocr', name: 'OCR Text', description: 'Can view extracted OCR text' },
        { id: 'ai_summary', name: 'AI Summary', description: 'Can request AI-generated summary' }
      ]);
    }
  };

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    if (grantForm.permissions.length === 0) {
      setError('Please select at least one permission');
      return;
    }
    try {
      setError(null);
      setSuccess(null);
      await grantAccess(grantForm.userId, grantForm.documentId, grantForm.expiresAt, grantForm.permissions);
      setSuccess('Access granted successfully!');
      setShowGrantForm(false);
      setGrantForm({ userId: '', documentId: '', expiresAt: '', permissions: ['view'] });
      loadGrants();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant access');
    }
  };

  const handleRevokeAccess = async (userId, documentId) => {
    if (!window.confirm('Are you sure you want to revoke this access?')) return;
    try {
      setError(null);
      await revokeAccess(userId, documentId);
      setSuccess('Access revoked successfully!');
      loadGrants();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke access');
    }
  };

  const handlePermissionToggle = (permissionId) => {
    setGrantForm(prev => {
      const currentPerms = prev.permissions;
      if (currentPerms.includes(permissionId)) {
        if (permissionId === 'view') return prev;
        return { ...prev, permissions: currentPerms.filter(p => p !== permissionId) };
      } else {
        return { ...prev, permissions: [...currentPerms, permissionId] };
      }
    });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!userForm.email || !userForm.password) {
      setError('Email and password are required');
      return;
    }
    if (userForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      setError(null);
      await createUser(userForm);
      setSuccess('User created successfully and synced to Mayan!');
      setShowUserForm(false);
      setUserForm({ email: '', password: '', firstName: '', lastName: '', role: 'user' });
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to delete user ${email}?`)) return;
    try {
      setError(null);
      await deleteUser(userId);
      setSuccess('User deleted successfully!');
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const getDefaultExpiry = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 16);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getNonAdminUsers = () => users.filter(u => !u.roles?.includes('admin'));

  const getPermissionConfig = (permId) => {
    const configs = {
      view: { icon: Eye, color: 'bg-blue-100 text-blue-700' },
      download: { icon: Download, color: 'bg-emerald-100 text-emerald-700' },
      ocr: { icon: Cpu, color: 'bg-purple-100 text-purple-700' },
      ai_summary: { icon: Sparkles, color: 'bg-amber-100 text-amber-700' },
      upload: { icon: Upload, color: 'bg-red-100 text-red-700' }
    };
    return configs[permId] || { icon: Key, color: 'bg-slate-100 text-slate-700' };
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Shield className="w-7 h-7 text-primary-600" />
          Admin Panel
        </h1>
        <p className="page-subtitle">Manage users, access control, and system settings</p>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-900">×</button>
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto hover:text-emerald-900">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`tab flex items-center gap-2 ${activeTab === tab.id ? 'tab-active' : ''}`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.showBadge && pendingRequestCount > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                  {pendingRequestCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="animate-fadeIn">
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Create User Button */}
            <div className="flex justify-end">
              <button 
                className="btn btn-primary"
                onClick={() => setShowUserForm(!showUserForm)}
              >
                {showUserForm ? (
                  <><X className="w-4 h-4" /> Cancel</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Create User</>
                )}
              </button>
            </div>

            {/* Create User Form */}
            {showUserForm && (
              <div className="card p-6 animate-fadeIn border-l-4 border-l-emerald-500">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                  Create New User
                </h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={userForm.email}
                        onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        className="input"
                        placeholder="user@company.com"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        className="input"
                        placeholder="Minimum 8 characters"
                        required
                        minLength={8}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name</label>
                      <input
                        type="text"
                        value={userForm.firstName}
                        onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                        className="input"
                        placeholder="John"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name</label>
                      <input
                        type="text"
                        value={userForm.lastName}
                        onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                        className="input"
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="role"
                          value="user"
                          checked={userForm.role === 'user'}
                          onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                          className="text-primary-600"
                        />
                        <span className="badge badge-primary">User</span>
                        <span className="text-sm text-slate-500">Regular access</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="role"
                          value="admin"
                          checked={userForm.role === 'admin'}
                          onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                          className="text-primary-600"
                        />
                        <span className="badge badge-danger">Admin</span>
                        <span className="text-sm text-slate-500">Full access</span>
                      </label>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-success">
                    <Check className="w-4 h-4" />
                    Create User & Sync to Mayan
                  </button>
                </form>
              </div>
            )}

            {/* Users Table */}
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-900">
                  All Users ({users.length})
                </h3>
              </div>
              
              {loading ? (
                <div className="p-12 text-center">
                  <div className="spinner mx-auto mb-4" />
                  <p className="text-slate-500">Loading users...</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Roles</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                                <span className="font-medium text-slate-600">
                                  {(user.email || user.username)?.[0]?.toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">{user.email || user.username}</p>
                                <p className="text-sm text-slate-500">
                                  {user.firstName} {user.lastName}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="flex gap-1">
                              {user.roles?.map(role => (
                                <span key={role} className={`badge ${role === 'admin' ? 'badge-danger' : 'badge-primary'}`}>
                                  {role}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${user.enabled ? 'badge-success' : 'badge-slate'}`}>
                              {user.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td>
                            {!user.roles?.includes('admin') && (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.email)}
                                className="btn btn-danger btn-sm"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Access Control Tab */}
        {activeTab === 'access' && (
          <div className="space-y-6">
            {/* Grant Access Button */}
            <div className="flex justify-end">
              <button 
                className="btn btn-primary"
                onClick={() => setShowGrantForm(!showGrantForm)}
              >
                {showGrantForm ? (
                  <><X className="w-4 h-4" /> Cancel</>
                ) : (
                  <><Plus className="w-4 h-4" /> Grant Access</>
                )}
              </button>
            </div>

            {/* Grant Access Form */}
            {showGrantForm && (
              <div className="card p-6 animate-fadeIn border-l-4 border-l-primary-500">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary-600" />
                  Grant Time-Limited Access
                </h3>
                <form onSubmit={handleGrantAccess} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">User</label>
                      <select
                        value={grantForm.userId}
                        onChange={(e) => setGrantForm({ ...grantForm, userId: e.target.value })}
                        className="select"
                        required
                      >
                        <option value="">Select a user</option>
                        {getNonAdminUsers().map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.email || user.username}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Document</label>
                      <select
                        value={grantForm.documentId}
                        onChange={(e) => setGrantForm({ ...grantForm, documentId: e.target.value })}
                        className="select"
                        required
                      >
                        <option value="">Select a document</option>
                        {documents.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.title} (#{doc.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      <Clock className="w-4 h-4 inline mr-1" />
                      Access Expires At
                    </label>
                    <input
                      type="datetime-local"
                      value={grantForm.expiresAt || getDefaultExpiry()}
                      onChange={(e) => setGrantForm({ ...grantForm, expiresAt: e.target.value })}
                      className="input max-w-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
                    <div className="flex flex-wrap gap-2">
                      {permissionTypes.map((perm) => {
                        const config = getPermissionConfig(perm.id);
                        const Icon = config.icon;
                        const isSelected = grantForm.permissions.includes(perm.id);
                        
                        return (
                          <button
                            key={perm.id}
                            type="button"
                            onClick={() => handlePermissionToggle(perm.id)}
                            disabled={perm.id === 'view'}
                            className={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                              isSelected 
                                ? `${config.color} border-current` 
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                            } ${perm.id === 'view' ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                            <Icon className="w-4 h-4" />
                            {perm.name}
                            {isSelected && <Check className="w-3 h-3" />}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">View permission is always required</p>
                  </div>

                  <button type="submit" className="btn btn-primary">
                    <Shield className="w-4 h-4" />
                    Grant Access
                  </button>
                </form>
              </div>
            )}

            {/* Active Grants */}
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-lg font-semibold text-slate-900">
                  Active Access Grants ({grants.length})
                </h3>
              </div>
              
              {loading ? (
                <div className="p-12 text-center">
                  <div className="spinner mx-auto mb-4" />
                  <p className="text-slate-500">Loading grants...</p>
                </div>
              ) : grants.length === 0 ? (
                <div className="p-12 text-center">
                  <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No active access grants</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Document</th>
                        <th>Permissions</th>
                        <th>Expires</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grants.map((grant, index) => (
                        <tr key={index}>
                          <td>
                            <p className="font-medium text-slate-900">{grant.userEmail || 'Unknown'}</p>
                          </td>
                          <td>
                            <span className="badge badge-slate">
                              <FileText className="w-3 h-3 mr-1" />
                              #{grant.documentId}
                            </span>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {(grant.permissions || ['view']).map((perm, i) => {
                                const config = getPermissionConfig(perm);
                                return (
                                  <span key={i} className={`badge ${config.color}`}>
                                    {perm.replace('_', ' ')}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td>
                            <span className={`text-sm font-medium ${
                              new Date(grant.expiresAt) < new Date() ? 'text-red-600' : 'text-emerald-600'
                            }`}>
                              {formatDate(grant.expiresAt)}
                            </span>
                          </td>
                          <td>
                            <button
                              onClick={() => handleRevokeAccess(grant.userId, grant.documentId)}
                              className="btn btn-danger btn-sm"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Permission Legend */}
            <div className="card p-6 bg-blue-50/50 border-blue-200">
              <h4 className="font-semibold text-slate-900 mb-4">Permission Types</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {permissionTypes.map((perm) => {
                  const config = getPermissionConfig(perm.id);
                  const Icon = config.icon;
                  return (
                    <div key={perm.id} className="flex items-start gap-2">
                      <div className={`p-1.5 rounded ${config.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-900">{perm.name}</p>
                        <p className="text-xs text-slate-500">{perm.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Access Requests Tab */}
        {activeTab === 'requests' && (
          <AccessRequests onRequestProcessed={loadPendingRequestCount} />
        )}

        {/* Cabinets Tab */}
        {activeTab === 'cabinets' && <CabinetManager />}

        {/* Advanced Search Tab */}
        {activeTab === 'search' && <AdvancedSearch />}

        {/* Storage Stats Tab */}
        {activeTab === 'storage' && <StorageStats />}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && <AuditLogs />}

        {/* Cache Stats Tab */}
        {activeTab === 'cache' && <CacheStats />}
      </div>
    </div>
  );
};

export default AdminPanel;
