import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { handleCallback, isAuthenticated, getUserInfo, logout, getToken } from './services/auth';
import { getUser } from './services/api';
import websocket from './services/websocket';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import DocumentView from './components/DocumentView';
import AdminPanel from './components/AdminPanel';
import {
  Files,
  Upload,
  Users,
  Activity,
  Database,
  LogOut,
  Shield,
  Menu,
  X,
  FileText,
  Settings,
  ChevronRight,
  Folder,
  Search
} from 'lucide-react';
import './index.css';

// Sidebar Navigation Component
function Sidebar({ user, isAdmin, isOpen, setIsOpen }) {
  const location = useLocation();

  const navItems = [
    { to: '/', icon: Files, label: 'Documents', roles: ['user', 'admin'] },
    { to: '/admin', icon: Users, label: 'User Management', roles: ['admin'] },
    { to: '/admin?tab=access', icon: Shield, label: 'Access Control', roles: ['admin'] },
    { to: '/admin?tab=cabinets', icon: Folder, label: 'Cabinets', roles: ['admin'] },
    { to: '/admin?tab=search', icon: Search, label: 'Advanced Search', roles: ['admin'] },
    { to: '/admin?tab=audit', icon: Activity, label: 'Audit Logs', roles: ['admin'] },
    { to: '/admin?tab=cache', icon: Database, label: 'Cache Stats', roles: ['admin'] },
  ];

  const filteredItems = navItems.filter(item =>
    item.roles.some(role => role === 'user' || (role === 'admin' && isAdmin))
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-sidebar z-50 shadow-sidebar
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-lighter">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">Coffre-Fort</h1>
            <p className="text-slate-400 text-xs">Document Management</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden ml-auto text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4 space-y-1">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname + location.search === item.to ||
              (location.pathname === '/admin' && item.to.startsWith('/admin') && !item.to.includes('?') && !location.search);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </NavLink>
            );
          })}
        </nav>

        {/* User section at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-lighter">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-sidebar-lighter rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {user?.email || user?.username}
              </p>
              <p className="text-slate-400 text-xs">
                {isAdmin ? 'Administrator' : 'User'}
              </p>
            </div>
          </div>
          {user?.wsConnected !== undefined && (
            <div className="mb-3">
              <span className={`badge text-xs ${user.wsConnected ? 'badge-success' : 'badge-slate'}`}>
                {user.wsConnected ? 'Live: Connected' : 'Live: Offline'}
              </span>
            </div>
          )}
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-red-600/20 rounded-lg transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

// Top bar for mobile
function TopBar({ user, isAdmin, onMenuClick }) {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 z-30 px-4 flex items-center justify-between">
      <button
        onClick={onMenuClick}
        className="p-2 hover:bg-slate-100 rounded-lg"
      >
        <Menu className="w-6 h-6 text-slate-600" />
      </button>

      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <span className="font-bold text-slate-900">Coffre-Fort</span>
      </div>

      <div className="flex items-center gap-2">
        {user?.wsConnected !== undefined && (
          <span className={`badge text-xs ${user.wsConnected ? 'badge-success' : 'badge-slate'}`}>
            {user.wsConnected ? 'Live' : 'Offline'}
          </span>
        )}
        {isAdmin && (
          <span className="badge badge-danger text-xs">Admin</span>
        )}
        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
          <span className="text-slate-600 font-medium text-sm">
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </span>
        </div>
      </div>
    </header>
  );
}

// Main App Content
function AppContent({ user, isAdmin }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        user={user}
        isAdmin={isAdmin}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />

      <TopBar
        user={user}
        isAdmin={isAdmin}
        onMenuClick={() => setSidebarOpen(true)}
      />

      {/* Main content area */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/document/:id" element={<DocumentView user={user} />} />
            {isAdmin && <Route path="/admin" element={<AdminPanel user={user} />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

// Loading Screen
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse-soft">
          <FileText className="w-8 h-8 text-white" />
        </div>
        <div className="spinner mx-auto mb-3" />
        <p className="text-slate-500">Loading Coffre-Fort...</p>
      </div>
    </div>
  );
}

function App() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loginFailed, setLoginFailed] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // Check if we're returning from Keycloak (OAuth callback)
      const urlParams = new URLSearchParams(window.location.search);
      const hasAuthCode = urlParams.has('code');

      if (hasAuthCode) {
        // Handle OAuth callback
        try {
          console.log('Handling OAuth callback...');
          await handleCallback();

          // Give a brief moment for tokens to be fully set
          await new Promise(resolve => setTimeout(resolve, 100));

          const user = getUserInfo();
          console.log('User info retrieved:', user);

          // Normalize to match backend-validated shape; use Keycloak subject as stable user id
          const normalizedUser = { ...user, id: user?.sub || user?.id };

          setAuthenticated(true);
          setUser(normalizedUser);
          setLoginFailed(false);
        } catch (error) {
          console.error('OAuth callback failed:', error);
          setLoginFailed(true);
        }
        setLoading(false);
      } else {
        // No callback, validate existing token with backend
        if (getToken()) {
          try {
            console.log('[App] Validating existing token with backend...');
            const response = await getUser();
            const userData = response.data;

            // Use the fresh user data from backend
            setAuthenticated(true);
            setUser({
              id: userData.id,
              email: userData.email,
              username: userData.username,
              roles: userData.roles
            });
            console.log('[App] Token validated, user:', userData.email);
          } catch (error) {
            console.error('[App] Token validation failed:', error);
            // Token is invalid, clear auth state
            setAuthenticated(false);
            setUser(null);
          }
        }
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Initialize WebSocket connection when authenticated
  useEffect(() => {
    if (!authenticated || !user?.id) return;

    console.log('[App] Initializing WebSocket connection for user:', user.id);
    websocket.connect(user.id);

    const unsubscribe = websocket.subscribeToConnectionStatus((status) => {
      setWsConnected(!!status.connected);
    });

    return () => {
      unsubscribe();
      websocket.disconnect();
    };
  }, [authenticated, user]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!authenticated) {
    return (
      <Router>
        <Routes>
          <Route path="*" element={<Login loginFailed={loginFailed} />} />
        </Routes>
      </Router>
    );
  }

  const userRoles = user?.roles || [];
  const isAdmin = userRoles.includes('admin');

  const userWithWs = { ...user, wsConnected };

  return (
    <Router>
      <AppContent user={userWithWs} isAdmin={isAdmin} />
    </Router>
  );
}

export default App;
