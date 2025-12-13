import React, { useState, useEffect, useCallback } from 'react';
import { 
  getCabinets, 
  createCabinet, 
  updateCabinet, 
  deleteCabinet, 
  getCabinetDocuments,
  addDocumentToCabinet,
  removeDocumentFromCabinet,
  getDocuments
} from '../services/api';
import { 
  Folder, 
  FolderPlus, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown,
  File,
  FileText,
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  Search,
  RefreshCw,
  Move,
  FolderTree,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

const CabinetManager = () => {
  const [cabinets, setCabinets] = useState([]);
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [cabinetDocuments, setCabinetDocuments] = useState([]);
  const [expandedCabinets, setExpandedCabinets] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [editingCabinet, setEditingCabinet] = useState(null);
  const [newCabinetName, setNewCabinetName] = useState('');
  const [newCabinetParent, setNewCabinetParent] = useState(null);
  const [editCabinetName, setEditCabinetName] = useState('');
  
  // Add document modal
  const [availableDocuments, setAvailableDocuments] = useState([]);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [selectedDocToAdd, setSelectedDocToAdd] = useState(null);

  useEffect(() => {
    loadCabinets();
  }, []);

  const getParentId = useCallback((cabinet) => {
    const parent = cabinet?.parent_id ?? cabinet?.parent;
    if (parent === null || parent === undefined) return null;
    if (typeof parent === 'object') {
      return parent.id ?? parent.pk ?? null;
    }
    return parent;
  }, []);

  useEffect(() => {
    if (selectedCabinet) {
      loadCabinetDocuments(selectedCabinet.id);
    }
  }, [selectedCabinet]);

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

  const loadCabinets = async () => {
    try {
      setLoading(true);
      const response = await getCabinets();
      const rawCabinets = response.data.cabinets || [];
      const normalized = rawCabinets.map(cabinet => ({
        ...cabinet,
        parent_id: getParentId(cabinet)
      }));
      setCabinets(normalized);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load cabinets');
    } finally {
      setLoading(false);
    }
  };

  const loadCabinetDocuments = async (cabinetId) => {
    try {
      setDocsLoading(true);
      const response = await getCabinetDocuments(cabinetId);
      setCabinetDocuments(response.data.documents || []);
    } catch (err) {
      console.error('Failed to load cabinet documents:', err);
      setCabinetDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  };

  const loadAvailableDocuments = async () => {
    try {
      const response = await getDocuments(1, 50);
      setAvailableDocuments(response.data.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const handleCreateCabinet = async () => {
    if (!newCabinetName.trim()) {
      setError('Cabinet name is required');
      return;
    }
    
    try {
      await createCabinet(newCabinetName, newCabinetParent);
      setSuccess('Cabinet created successfully');
      setShowCreateModal(false);
      setNewCabinetName('');
      setNewCabinetParent(null);
      loadCabinets();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create cabinet');
    }
  };

  const handleUpdateCabinet = async (cabinetId) => {
    if (!editCabinetName.trim()) {
      setError('Cabinet name is required');
      return;
    }
    
    try {
      await updateCabinet(cabinetId, editCabinetName);
      setSuccess('Cabinet updated successfully');
      setEditingCabinet(null);
      setEditCabinetName('');
      loadCabinets();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update cabinet');
    }
  };

  const handleDeleteCabinet = async (cabinetId) => {
    if (!window.confirm('Are you sure you want to delete this cabinet? Documents will not be deleted.')) {
      return;
    }
    
    try {
      await deleteCabinet(cabinetId);
      setSuccess('Cabinet deleted successfully');
      if (selectedCabinet?.id === cabinetId) {
        setSelectedCabinet(null);
        setCabinetDocuments([]);
      }
      loadCabinets();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete cabinet');
    }
  };

  const handleAddDocument = async () => {
    if (!selectedDocToAdd || !selectedCabinet) {
      setError('Please select a document');
      return;
    }
    
    try {
      await addDocumentToCabinet(selectedCabinet.id, selectedDocToAdd);
      setSuccess('Document added to cabinet');
      setShowAddDocModal(false);
      setSelectedDocToAdd(null);
      loadCabinetDocuments(selectedCabinet.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add document');
    }
  };

  const handleRemoveDocument = async (documentId) => {
    if (!window.confirm('Remove this document from the cabinet?')) {
      return;
    }
    
    try {
      await removeDocumentFromCabinet(selectedCabinet.id, documentId);
      setSuccess('Document removed from cabinet');
      loadCabinetDocuments(selectedCabinet.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove document');
    }
  };

  const toggleExpand = (cabinetId) => {
    setExpandedCabinets(prev => {
      const next = new Set(prev);
      if (next.has(cabinetId)) {
        next.delete(cabinetId);
      } else {
        next.add(cabinetId);
      }
      return next;
    });
  };

  // Build cabinet tree structure - only show root cabinets at top level
  const buildCabinetTree = useCallback((allCabinets, parentId = null) => {
    return allCabinets
      .filter(c => {
        const cabinetParent = getParentId(c);
        // Root level: both are null
        if (parentId === null) {
          return cabinetParent === null;
        }
        // Child level: compare as numbers
        return Number(cabinetParent) === Number(parentId);
      })
      .map(cabinet => ({
        ...cabinet,
        children: buildCabinetTree(allCabinets, cabinet.id)
      }));
  }, [getParentId]);

  const cabinetTree = buildCabinetTree(cabinets);

  // Render cabinet tree item
  const renderCabinetItem = (cabinet, level = 0) => {
    const hasChildren = cabinet.children && cabinet.children.length > 0;
    const isExpanded = expandedCabinets.has(cabinet.id);
    const isSelected = selectedCabinet?.id === cabinet.id;
    const isEditing = editingCabinet === cabinet.id;

    return (
      <div key={cabinet.id}>
        <div
          className={`group flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
            isSelected ? 'bg-primary-100 text-primary-800' : 'hover:bg-slate-100'
          }`}
          style={{ paddingLeft: `${12 + level * 20}px` }}
          onClick={() => !isEditing && setSelectedCabinet(cabinet)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(cabinet.id);
              }}
              className="p-0.5 hover:bg-slate-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          
          {isSelected ? (
            <FolderOpen className="w-5 h-5 text-primary-600" />
          ) : (
            <Folder className="w-5 h-5 text-amber-500" />
          )}
          
          {isEditing ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editCabinetName}
                onChange={(e) => setEditCabinetName(e.target.value)}
                className="input py-1 px-2 text-sm flex-1"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateCabinet(cabinet.id);
                  if (e.key === 'Escape') {
                    setEditingCabinet(null);
                    setEditCabinetName('');
                  }
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdateCabinet(cabinet.id);
                }}
                className="p-1 text-green-600 hover:bg-green-100 rounded"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingCabinet(null);
                  setEditCabinetName('');
                }}
                className="p-1 text-red-600 hover:bg-red-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <span className="flex-1 truncate text-sm font-medium">{cabinet.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                cabinet.documents_count > 0 
                  ? 'text-primary-600 bg-primary-50' 
                  : 'text-slate-400 bg-slate-100'
              }`}>
                {cabinet.documents_count || 0}
              </span>
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCabinet(cabinet.id);
                    setEditCabinetName(cabinet.label);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded"
                  title="Rename"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCabinet(cabinet.id);
                  }}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {cabinet.children.map(child => renderCabinetItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Get file icon based on mime type
  const getFileIcon = (mimeType) => {
    if (!mimeType) return FileText;
    if (mimeType.includes('pdf')) return FileText;
    if (mimeType.includes('image')) return File;
    if (mimeType.includes('word') || mimeType.includes('document')) return FileText;
    return File;
  };

  // Filter documents for add modal
  const filteredAvailableDocs = availableDocuments.filter(doc => {
    if (!docSearchQuery) return true;
    return doc.label?.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
           doc.title?.toLowerCase().includes(docSearchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderTree className="w-6 h-6 text-primary-600" />
          <h2 className="text-xl font-bold text-slate-900">Cabinet Manager</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadCabinets}
            className="btn btn-secondary btn-sm"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary btn-sm"
          >
            <FolderPlus className="w-4 h-4" />
            New Cabinet
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-900">×</button>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto hover:text-emerald-900">×</button>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cabinet Tree */}
        <div className="lg:col-span-1">
          <div className="card">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Folder className="w-4 h-4 text-amber-500" />
                Cabinets
              </h3>
            </div>
            <div className="p-2 max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="spinner mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Loading cabinets...</p>
                </div>
              ) : cabinets.length === 0 ? (
                <div className="p-8 text-center">
                  <Folder className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No cabinets yet</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn btn-primary btn-sm mt-3"
                  >
                    <FolderPlus className="w-4 h-4" />
                    Create First Cabinet
                  </button>
                </div>
              ) : (
                <div className="space-y-0.5 group">
                  {cabinetTree.map(cabinet => renderCabinetItem(cabinet))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cabinet Documents */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                {selectedCabinet ? (
                  <>
                    <FolderOpen className="w-4 h-4 text-primary-600" />
                    {selectedCabinet.label}
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 text-slate-400" />
                    Select a cabinet
                  </>
                )}
              </h3>
              {selectedCabinet && (
                <button
                  onClick={() => {
                    setShowAddDocModal(true);
                    loadAvailableDocuments();
                  }}
                  className="btn btn-primary btn-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Document
                </button>
              )}
            </div>
            <div className="p-4">
              {!selectedCabinet ? (
                <div className="text-center py-12">
                  <FolderOpen className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500">Select a cabinet to view its documents</p>
                </div>
              ) : docsLoading ? (
                <div className="text-center py-12">
                  <div className="spinner mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Loading documents...</p>
                </div>
              ) : cabinetDocuments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500">No documents in this cabinet</p>
                  <button
                    onClick={() => {
                      setShowAddDocModal(true);
                      loadAvailableDocuments();
                    }}
                    className="btn btn-primary btn-sm mt-4"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Document
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {cabinetDocuments.map(doc => {
                    const Icon = getFileIcon(doc.mimetype);
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Icon className="w-5 h-5 text-slate-500" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{doc.label || doc.title}</p>
                          <p className="text-xs text-slate-500">
                            {doc.mimetype || 'Unknown type'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveDocument(doc.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Remove from cabinet"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Cabinet Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md m-4">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-primary-600" />
                Create New Cabinet
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cabinet Name *
                </label>
                <input
                  type="text"
                  value={newCabinetName}
                  onChange={(e) => setNewCabinetName(e.target.value)}
                  className="input"
                  placeholder="e.g., Financial Documents"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Parent Cabinet (optional)
                </label>
                <select
                  value={newCabinetParent || ''}
                  onChange={(e) => setNewCabinetParent(e.target.value || null)}
                  className="select"
                >
                  <option value="">None (Root level)</option>
                  {cabinets.map(cab => (
                    <option key={cab.id} value={cab.id}>{cab.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewCabinetName('');
                  setNewCabinetParent(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCabinet}
                className="btn btn-primary"
              >
                <FolderPlus className="w-4 h-4" />
                Create Cabinet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showAddDocModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg m-4">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-600" />
                Add Document to {selectedCabinet?.label}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={docSearchQuery}
                  onChange={(e) => setDocSearchQuery(e.target.value)}
                  className="input pl-10"
                  placeholder="Search documents..."
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {filteredAvailableDocs.length === 0 ? (
                  <p className="text-center text-slate-500 py-4">No documents found</p>
                ) : (
                  filteredAvailableDocs.map(doc => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocToAdd(doc.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedDocToAdd === doc.id
                          ? 'bg-primary-100 border-2 border-primary-500'
                          : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                      }`}
                    >
                      <FileText className="w-5 h-5 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">{doc.label || doc.title}</p>
                        <p className="text-xs text-slate-500">{doc.document_type?.label || 'Document'}</p>
                      </div>
                      {selectedDocToAdd === doc.id && (
                        <Check className="w-5 h-5 text-primary-600" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddDocModal(false);
                  setSelectedDocToAdd(null);
                  setDocSearchQuery('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDocument}
                disabled={!selectedDocToAdd}
                className="btn btn-primary"
              >
                <Plus className="w-4 h-4" />
                Add to Cabinet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CabinetManager;
