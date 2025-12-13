import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments, uploadDocument, deleteDocument, getUser, searchDocuments, getDocumentThumbnail, getDocumentTypes, getAllTags, getAllCabinets, getCabinetDocumentsPublic, getDocument, getDocumentPreviewUrl, getBatchThumbnails } from '../services/api';
import { getUserInfo as getAuthUserInfo } from '../services/auth';
import { MAYAN_URL } from '../utils/constants';
import SearchPanel from './SearchPanel';
import { DocumentGridSkeleton, SearchPanelSkeleton } from './ui/SkeletonLoader';
import ParticleBackground from './ui/ParticleBackground';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Upload, 
  Eye, 
  Trash2, 
  Calendar, 
  User, 
  ChevronLeft, 
  ChevronRight,
  Files,
  Plus,
  X,
  ExternalLink,
  FolderOpen,
  Clock,
  FileType,
  Image,
  Loader2,
  Lock
} from 'lucide-react';

const Dashboard = ({ user: propUser }) => {
  const PAGE_SIZE = 12;

  const [documents, setDocuments] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');

  const [uploadCabinetId, setUploadCabinetId] = useState('');
  const [uploadCabinetPath, setUploadCabinetPath] = useState('');
  const [uploadDocumentTypeId, setUploadDocumentTypeId] = useState('');
  const [uploadTagIds, setUploadTagIds] = useState([]);

  const [uploadOptionsLoading, setUploadOptionsLoading] = useState(false);
  const [uploadCabinets, setUploadCabinets] = useState([]);
  const [uploadDocumentTypes, setUploadDocumentTypes] = useState([]);
  const [uploadTags, setUploadTags] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [user, setUser] = useState(propUser || null);
  const [canUpload, setCanUpload] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [currentFilters, setCurrentFilters] = useState({});

  const [cabinets, setCabinets] = useState([]);
  const [cabinetsLoading, setCabinetsLoading] = useState(false);

  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [cabinetDocsLoading, setCabinetDocsLoading] = useState(false);
  const [cabinetDocsError, setCabinetDocsError] = useState(null);
  const [cabinetDocuments, setCabinetDocuments] = useState([]);
  const [cabinetDocsPage, setCabinetDocsPage] = useState(1);
  const [cabinetDocsTotal, setCabinetDocsTotal] = useState(0);
  
  // Hover preload state (1-second delay before preloading)
  const [preloadedDocs, setPreloadedDocs] = useState({}); // { docId: { metadata, previewUrl } }
  const hoverTimersRef = useRef({}); // { docId: timeoutId }
  const preloadingRef = useRef(new Set()); // Track in-flight preloads
  
  // Lazy loading with IntersectionObserver
  const [visibleDocIds, setVisibleDocIds] = useState(new Set());
  const observerRef = useRef(null);
  const cardRefsRef = useRef({}); // { docId: HTMLElement }
  
  const navigate = useNavigate();
  const isAdmin = user?.roles?.includes('admin') || false;

  const mayanBase = String(MAYAN_URL || '').replace(/\/+$/, '');
  const mayanHref = `${mayanBase}/oidc/authenticate/`;

  // Load thumbnails using batch API (single request, single permission check)
  const loadThumbnails = useCallback(async (docIds) => {
    // Filter out already loaded thumbnails
    const idsToLoad = docIds.filter(id => !thumbnails[id]);
    if (idsToLoad.length === 0) return;
    
    console.log(`[Dashboard] Loading ${idsToLoad.length} thumbnails via batch API`);
    
    try {
      // Use batch API for efficiency (1 request instead of N)
      const response = await getBatchThumbnails(idsToLoad, 150);
      const batchThumbnails = response.data?.thumbnails || [];
      
      // Convert to URL format and update state
      const newThumbnails = {};
      batchThumbnails.forEach(t => {
        if (t.data) {
          newThumbnails[t.id] = `data:${t.contentType};base64,${t.data}`;
        }
      });
      
      if (Object.keys(newThumbnails).length > 0) {
        setThumbnails(prev => ({ ...prev, ...newThumbnails }));
      }
    } catch (err) {
      console.debug('[Dashboard] Batch thumbnail fetch failed, falling back to individual:', err.message);
      // Fallback: load individually (for older backend compatibility)
      const results = await Promise.all(
        idsToLoad.map(async (docId) => {
          try {
            const response = await getDocumentThumbnail(docId, 150);
            if (response.data?.data) {
              return { id: docId, url: `data:${response.data.contentType};base64,${response.data.data}` };
            }
          } catch (_) {}
          return null;
        })
      );
      
      const newThumbnails = {};
      results.filter(Boolean).forEach(r => {
        newThumbnails[r.id] = r.url;
      });
      
      if (Object.keys(newThumbnails).length > 0) {
        setThumbnails(prev => ({ ...prev, ...newThumbnails }));
      }
    }
  }, [thumbnails]);
  
  // Setup IntersectionObserver for lazy loading thumbnails
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const nowVisible = new Set(visibleDocIds);
        entries.forEach(entry => {
          const docId = entry.target.dataset.docId;
          if (entry.isIntersecting) {
            nowVisible.add(docId);
          }
        });
        setVisibleDocIds(nowVisible);
      },
      { rootMargin: '100px', threshold: 0.1 } // Start loading slightly before visible
    );
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);
  
  // Load thumbnails when documents become visible
  useEffect(() => {
    if (visibleDocIds.size > 0) {
      loadThumbnails(Array.from(visibleDocIds));
    }
  }, [visibleDocIds, loadThumbnails]);
  
  // Observe document cards when documents change
  useEffect(() => {
    if (!observerRef.current) return;
    
    // Disconnect old observations
    observerRef.current.disconnect();
    
    // Observe all card elements
    Object.entries(cardRefsRef.current).forEach(([docId, element]) => {
      if (element) {
        observerRef.current.observe(element);
      }
    });
  }, [documents]);
  
  // Hover preload handlers - 1 second delay before preloading document details & preview
  const handleDocumentHoverStart = useCallback((docId) => {
    // Don't preload if already preloaded or in-flight
    if (preloadedDocs[docId] || preloadingRef.current.has(docId)) return;
    
    // Clear any existing timer for this doc
    if (hoverTimersRef.current[docId]) {
      clearTimeout(hoverTimersRef.current[docId]);
    }
    
    // Set 1-second delay before preloading
    hoverTimersRef.current[docId] = setTimeout(async () => {
      if (preloadingRef.current.has(docId)) return;
      preloadingRef.current.add(docId);
      
      console.log(`[Dashboard] Preloading document ${docId} (1s hover threshold met)`);
      
      try {
        // Fetch document metadata in background
        const response = await getDocument(docId);
        const metadata = response.data;
        
        // Preload preview image/iframe
        const previewUrl = getDocumentPreviewUrl(docId);
        
        // Store preloaded data
        setPreloadedDocs(prev => ({
          ...prev,
          [docId]: { metadata, previewUrl, preloadedAt: Date.now() }
        }));
      } catch (err) {
        console.debug(`[Dashboard] Preload failed for doc ${docId}:`, err.message);
      } finally {
        preloadingRef.current.delete(docId);
      }
    }, 1000); // 1 second delay
  }, [preloadedDocs]);
  
  const handleDocumentHoverEnd = useCallback((docId) => {
    // Cancel pending preload if user moves away before 1 second
    if (hoverTimersRef.current[docId]) {
      clearTimeout(hoverTimersRef.current[docId]);
      delete hoverTimersRef.current[docId];
    }
  }, []);
  
  // Cleanup hover timers on unmount
  useEffect(() => {
    return () => {
      Object.values(hoverTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const initUser = async () => {
      if (!user) {
        const authUser = getAuthUserInfo();
        setUser(authUser);
      }
      
      // Get full user info from backend (includes granted permissions)
      try {
        const response = await getUser();
        const userData = response.data;
        setCanUpload(userData.canUpload || false);
      } catch (err) {
        console.error('[Dashboard] Failed to get user permissions:', err);
        setCanUpload(user?.roles?.includes('admin') || false);
      }
    };
    
    initUser();
  }, []);

  // Cabinet navigation state
  const [cabinetPath, setCabinetPath] = useState([]); // Breadcrumb path
  const [currentParentId, setCurrentParentId] = useState(null); // Current folder we're viewing

  useEffect(() => {
    const loadCabinets = async () => {
      try {
        setCabinetsLoading(true);
        const res = await getAllCabinets();
        const list = res.data?.cabinets || [];
        // Store full cabinet data including parent info
        const normalized = list.map((c) => ({
          id: c.id,
          label: c.label,
          full_path: c.full_path || c.label,
          parent_id: c.parent_id ?? c.parent ?? null,
          children: c.children || []
        }));
        setCabinets(normalized);
      } catch (e) {
        setCabinets([]);
      } finally {
        setCabinetsLoading(false);
      }
    };

    loadCabinets();
  }, []);

  // Get cabinets at current level (root or children of current parent)
  const getVisibleCabinets = useCallback(() => {
    if (currentParentId === null) {
      // Show root cabinets (no parent)
      return cabinets.filter(c => c.parent_id === null);
    }
    // Show children of current parent
    return cabinets.filter(c => Number(c.parent_id) === Number(currentParentId));
  }, [cabinets, currentParentId]);

  const navigateToFolder = useCallback((cabinet) => {
    setCabinetPath(prev => [...prev, cabinet]);
    setCurrentParentId(cabinet.id);
    setSelectedCabinet(null);
    setCabinetDocuments([]);
    setCabinetDocsTotal(0);
  }, []);

  const navigateBack = useCallback(() => {
    setCabinetPath(prev => {
      const newPath = prev.slice(0, -1);
      const parentCabinet = newPath[newPath.length - 1];
      setCurrentParentId(parentCabinet?.id ?? null);
      return newPath;
    });
    setSelectedCabinet(null);
    setCabinetDocuments([]);
    setCabinetDocsTotal(0);
  }, []);

  const navigateToRoot = useCallback(() => {
    setCabinetPath([]);
    setCurrentParentId(null);
    setSelectedCabinet(null);
    setCabinetDocuments([]);
    setCabinetDocsTotal(0);
  }, []);

  const loadCabinetDocuments = useCallback(async (cabinet, nextPage = 1) => {
    if (!cabinet?.id) return;
    try {
      setCabinetDocsError(null);
      setCabinetDocsLoading(true);
      const res = await getCabinetDocumentsPublic(cabinet.id, nextPage, PAGE_SIZE);
      setCabinetDocuments(res.data?.documents || []);
      setCabinetDocsTotal(res.data?.total || 0);
      setCabinetDocsPage(nextPage);
    } catch (e) {
      setCabinetDocsError(e.response?.data?.error || 'Failed to load cabinet contents');
      setCabinetDocuments([]);
      setCabinetDocsTotal(0);
    } finally {
      setCabinetDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchActive) {
      handleSearch({ ...currentFilters, page });
    } else {
      loadDocuments();
    }
  }, [page]);

  // Clear cardRefs when documents change, IntersectionObserver will handle thumbnail loading
  useEffect(() => {
    cardRefsRef.current = {};
    setVisibleDocIds(new Set());
  }, [documents]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const response = await getDocuments(page, PAGE_SIZE);
      const docs = response.data.documents || [];
      setDocuments(docs);
      setTotal(response.data.total || 0);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (filters) => {
    try {
      setSearchLoading(true);
      setCurrentFilters(filters);
      
      if (Object.keys(filters).length === 0 || (!filters.q && !filters.documentType && !filters.dateFrom && !filters.dateTo)) {
        setSearchActive(false);
        loadDocuments();
        return;
      }
      
      setSearchActive(true);
      const response = await searchDocuments({ ...filters, page, limit: PAGE_SIZE });
      const docs = response.data.documents || [];
      setDocuments(docs);
      setTotal(response.data.total || 0);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setError('Please select a file');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      await uploadDocument(uploadFile, uploadTitle || uploadFile.name, uploadDescription, {
        cabinetId: uploadCabinetId || null,
        cabinetPath: uploadCabinetPath || null,
        documentTypeId: uploadDocumentTypeId || null,
        tagIds: uploadTagIds || []
      });
      setShowUpload(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadDescription('');
      setUploadCabinetId('');
      setUploadCabinetPath('');
      setUploadDocumentTypeId('');
      setUploadTagIds([]);
      loadDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const loadUploadOptions = async () => {
      if (!showUpload || uploadOptionsLoading) return;
      try {
        setUploadOptionsLoading(true);
        const [typesRes, tagsRes, cabinetsRes] = await Promise.all([
          getDocumentTypes(),
          getAllTags(),
          getAllCabinets()
        ]);

        setUploadDocumentTypes(typesRes.data?.types || []);
        setUploadTags(tagsRes.data?.tags || []);
        setUploadCabinets(cabinetsRes.data?.cabinets || []);
      } catch (e) {
        // Keep upload usable even if options fail
        setUploadDocumentTypes([]);
        setUploadTags([]);
        setUploadCabinets([]);
      } finally {
        setUploadOptionsLoading(false);
      }
    };

    loadUploadOptions();
  }, [showUpload]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await deleteDocument(id);
      loadDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete document');
    }
  };

  const handleView = (id) => {
    navigate(`/document/${id}`);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="max-w-7xl mx-auto relative">
      {/* Three.js Background */}
      <ParticleBackground />
      
      {/* Page Header */}
      <motion.div
        className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Files className="w-7 h-7 text-primary-600" />
            Documents
          </h1>
          <p className="page-subtitle">
            {searchActive 
              ? `Found ${total} document${total !== 1 ? 's' : ''} matching your search`
              : `${total} document${total !== 1 ? 's' : ''} in your vault`
            }
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          {canUpload && (
            <button 
              className="btn btn-primary"
              onClick={() => setShowUpload(!showUpload)}
            >
              {showUpload ? (
                <>
                  <X className="w-4 h-4" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Upload Document
                </>
              )}
            </button>
          )}
          {isAdmin && (
            <a 
              href={mayanHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              title="Open Mayan EDMS"
            >
              <ExternalLink className="w-4 h-4" />
              Open Mayan EDMS
            </a>
          )}
        </div>
      </motion.div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full" />
          {error}
        </div>
      )}

      {/* Upload Form */}
      {showUpload && (
        <div className="card p-6 mb-6 animate-fadeIn">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary-600" />
            Upload New Document
          </h3>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                File <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx"
                onChange={(e) => setUploadFile(e.target.files[0])}
                className="input file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                required
              />
              <p className="mt-1 text-xs text-slate-500">Supported: PDF, JPG, PNG, TIFF, DOC, DOCX (max 50MB)</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Title (optional)
              </label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                className="input"
                placeholder="Document title"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Description (optional)
              </label>
              <textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                className="input resize-none"
                placeholder="Document description"
                rows="3"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Document Type (optional)
                </label>
                <select
                  value={uploadDocumentTypeId}
                  onChange={(e) => setUploadDocumentTypeId(e.target.value)}
                  className="input"
                  disabled={uploadOptionsLoading}
                >
                  <option value="">Auto (default)</option>
                  {uploadDocumentTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tags (optional)
                </label>
                <select
                  multiple
                  value={uploadTagIds.map(String)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                    setUploadTagIds(selected);
                  }}
                  className="input h-28"
                  disabled={uploadOptionsLoading}
                >
                  {uploadTags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Hold Ctrl (or Cmd) to select multiple</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Destination Cabinet (optional)
                </label>
                <select
                  value={uploadCabinetId}
                  onChange={(e) => setUploadCabinetId(e.target.value)}
                  className="input"
                  disabled={uploadOptionsLoading}
                >
                  <option value="">None</option>
                  {uploadCabinets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_path || c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Or create cabinet path (optional)
                </label>
                <input
                  type="text"
                  value={uploadCabinetPath}
                  onChange={(e) => setUploadCabinetPath(e.target.value)}
                  className="input"
                  placeholder="Finance/Invoices/2025"
                />
                <p className="mt-1 text-xs text-slate-500">If set, this overrides the selected cabinet</p>
              </div>
            </div>
            
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <div className="spinner !h-4 !w-4 !border-white !border-t-transparent" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Document
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Search Panel */}
      <SearchPanel onSearch={handleSearch} isLoading={searchLoading} />

      {/* Cabinets (Folders) - with navigation */}
      <motion.div
        className="card p-6 mb-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-slate-900">Cabinets</h2>
            {/* Breadcrumb navigation */}
            {cabinetPath.length > 0 && (
              <div className="flex items-center gap-1 ml-2 text-sm text-slate-500">
                <button 
                  onClick={navigateToRoot}
                  className="hover:text-primary-600 hover:underline"
                >
                  Root
                </button>
                {cabinetPath.map((folder, idx) => (
                  <span key={folder.id} className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    <button
                      onClick={() => {
                        const newPath = cabinetPath.slice(0, idx + 1);
                        setCabinetPath(newPath);
                        setCurrentParentId(folder.id);
                        setSelectedCabinet(null);
                        setCabinetDocuments([]);
                      }}
                      className="hover:text-primary-600 hover:underline"
                    >
                      {folder.label}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/admin?tab=cabinets')}
            >
              Manage
            </button>
          )}
        </div>

        {/* Back button when in subfolder */}
        {cabinetPath.length > 0 && (
          <button
            onClick={navigateBack}
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-primary-600 mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to {cabinetPath.length > 1 ? cabinetPath[cabinetPath.length - 2].label : 'Root'}
          </button>
        )}

        {cabinetsLoading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <div className="spinner !h-4 !w-4" />
            Loading cabinets...
          </div>
        ) : getVisibleCabinets().length === 0 ? (
          <div className="text-slate-500">
            {currentParentId ? 'No subfolders in this cabinet.' : 'No cabinets available.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {getVisibleCabinets().map((c) => {
              const hasChildren = cabinets.some(child => Number(child.parent_id) === Number(c.id));
              return (
                <motion.div
                  key={c.id}
                  className={`p-3 rounded-lg border bg-white/80 cursor-pointer transition-colors ${
                    selectedCabinet?.id === c.id ? 'border-primary-300 bg-primary-50/50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => {
                    if (selectedCabinet?.id === c.id) {
                      setSelectedCabinet(null);
                      setCabinetDocuments([]);
                      setCabinetDocsTotal(0);
                      setCabinetDocsPage(1);
                      setCabinetDocsError(null);
                      return;
                    }
                    setSelectedCabinet(c);
                    loadCabinetDocuments(c, 1);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <FolderOpen className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {c.label}
                        </div>
                      </div>
                    </div>
                    {hasChildren && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToFolder(c);
                        }}
                        className="p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded"
                        title="Open folder"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Inline cabinet contents */}
        {selectedCabinet && (
          <div className="mt-5 pt-5 border-t border-slate-200/60">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  Inside: {selectedCabinet.full_path || selectedCabinet.label}
                </div>
                <div className="text-xs text-slate-500">
                  {cabinetDocsTotal} document{cabinetDocsTotal !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={cabinetDocsLoading || cabinetDocsPage <= 1}
                  onClick={() => loadCabinetDocuments(selectedCabinet, Math.max(1, cabinetDocsPage - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={cabinetDocsLoading || cabinetDocuments.length < PAGE_SIZE}
                  onClick={() => loadCabinetDocuments(selectedCabinet, cabinetDocsPage + 1)}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {cabinetDocsError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {cabinetDocsError}
              </div>
            )}

            {cabinetDocsLoading ? (
              <div className="flex items-center gap-2 text-slate-500">
                <div className="spinner !h-4 !w-4" />
                Loading cabinet contents...
              </div>
            ) : cabinetDocuments.length === 0 ? (
              <div className="text-slate-500">No documents inside this cabinet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {cabinetDocuments.map((doc) => {
                  const canViewDoc = doc.canView !== false;
                  return (
                    <motion.div
                      key={doc.id}
                      className={`card card-hover overflow-hidden cursor-pointer group ${!canViewDoc ? 'opacity-75' : ''}`}
                      onClick={() => handleView(doc.id)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      <div className="relative h-32 bg-gradient-to-br from-slate-100 to-slate-50 overflow-hidden">
                        {thumbnails[doc.id] && canViewDoc ? (
                          <img
                            src={thumbnails[doc.id]}
                            alt={doc.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {canViewDoc ? (
                              <FileText className="w-12 h-12 text-slate-300" />
                            ) : (
                              <Lock className="w-12 h-12 text-red-300" />
                            )}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                          {canViewDoc ? (
                            <Eye className="w-8 h-8 text-white" />
                          ) : (
                            <Lock className="w-8 h-8 text-white" />
                          )}
                        </div>
                      </div>

                      <div className="p-4">
                        <h3 className="font-semibold text-slate-900 truncate group-hover:text-primary-600 transition-colors">
                          {doc.title || `Document ${doc.id}`}
                        </h3>

                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            {formatDate(doc.uploadedAt)}
                          </p>

                          {doc.uploadedBy && (
                            <p className="text-xs text-slate-500 flex items-center gap-1.5">
                              <User className="w-3 h-3" />
                              {doc.uploadedBy}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <button
                            className={`btn btn-sm flex-1 ${canViewDoc ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleView(doc.id);
                            }}
                          >
                            {canViewDoc ? (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                Request Access
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Documents List */}
      {loading ? (
        <DocumentGridSkeleton count={6} />
      ) : documents.length === 0 ? (
        <div className="card p-12">
          <div className="empty-state">
            <FolderOpen className="empty-state-icon" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No documents found</h3>
            <p className="text-slate-500 mb-4">
              {searchActive 
                ? 'Try adjusting your search filters'
                : 'Upload your first document to get started'
              }
            </p>
            {canUpload && !searchActive && (
              <button 
                className="btn btn-primary"
                onClick={() => setShowUpload(true)}
              >
                <Plus className="w-4 h-4" />
                Upload Document
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Document Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {documents.map((doc) => {
              const canViewDoc = doc.canView !== false; // true by default if not present
              return (
              <motion.div 
                key={doc.id}
                ref={(el) => { if (el) cardRefsRef.current[doc.id] = el; }}
                data-doc-id={doc.id}
                className={`card card-hover overflow-hidden cursor-pointer group ${!canViewDoc ? 'opacity-75' : ''}`}
                onClick={() => handleView(doc.id)}
                onMouseEnter={() => canViewDoc && handleDocumentHoverStart(doc.id)}
                onMouseLeave={() => handleDocumentHoverEnd(doc.id)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {/* Thumbnail or Placeholder */}
                <div className="relative h-32 bg-gradient-to-br from-slate-100 to-slate-50 overflow-hidden">
                  {thumbnails[doc.id] && canViewDoc ? (
                    <img 
                      src={thumbnails[doc.id]} 
                      alt={doc.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {canViewDoc ? (
                        <FileText className="w-12 h-12 text-slate-300" />
                      ) : (
                        <Lock className="w-12 h-12 text-red-300" />
                      )}
                    </div>
                  )}
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    {canViewDoc ? (
                      <Eye className="w-8 h-8 text-white" />
                    ) : (
                      <Lock className="w-8 h-8 text-white" />
                    )}
                  </div>
                  {/* Document type badge */}
                  {doc.documentType && (
                    <div className="absolute top-2 left-2">
                      <span className="badge bg-white/90 text-slate-700 shadow-sm text-xs">
                        {doc.documentType}
                      </span>
                    </div>
                  )}
                  {/* Access restricted badge */}
                  {!canViewDoc && (
                    <div className="absolute top-2 right-2">
                      <span className="badge bg-red-500 text-white shadow-sm text-xs flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Restricted
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 truncate group-hover:text-primary-600 transition-colors">
                    {doc.title || `Document ${doc.id}`}
                  </h3>
                  
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {formatDate(doc.uploadedAt)}
                    </p>
                    
                    {doc.uploadedBy && (
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <User className="w-3 h-3" />
                        {doc.uploadedBy}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button 
                      className={`btn btn-sm flex-1 ${canViewDoc ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView(doc.id);
                      }}
                    >
                      {canViewDoc ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          Request Access
                        </>
                      )}
                    </button>
                    {isAdmin && (
                      <button 
                        className="btn btn-danger btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(doc.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-2">
            <button 
              className="btn btn-secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            
            <div className="px-4 py-2 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-600">Page </span>
              <span className="font-semibold text-slate-900">{page}</span>
              <span className="text-slate-600"> of </span>
              <span className="font-semibold text-slate-900">{Math.ceil(total / PAGE_SIZE) || 1}</span>
            </div>
            
            <button 
              className="btn btn-secondary"
              onClick={() => setPage(p => p + 1)}
              disabled={documents.length < PAGE_SIZE}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;

