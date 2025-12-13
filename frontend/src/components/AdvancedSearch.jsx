import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  searchByContent, 
  getDocumentTypes, 
  getAllTags,
  getMetadataTypes,
  advancedSearch
} from '../services/api';
import { DocumentGridSkeleton } from './ui/SkeletonLoader';
import { 
  Search, 
  Filter, 
  X, 
  FileText, 
  Calendar, 
  Tag, 
  Folder,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Cpu,
  Clock,
  Eye,
  RefreshCw,
  Database,
  FileType,
  Hash
} from 'lucide-react';

// Debounce hook
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
};

// Document type icons
const DOCUMENT_ICONS = {
  'application/pdf': { icon: '📄', color: 'bg-red-100 text-red-700' },
  'application/msword': { icon: '📝', color: 'bg-blue-100 text-blue-700' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: '📝', color: 'bg-blue-100 text-blue-700' },
  'application/vnd.ms-excel': { icon: '📊', color: 'bg-green-100 text-green-700' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: '📊', color: 'bg-green-100 text-green-700' },
  'application/vnd.ms-powerpoint': { icon: '📽️', color: 'bg-orange-100 text-orange-700' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { icon: '📽️', color: 'bg-orange-100 text-orange-700' },
  'image/jpeg': { icon: '🖼️', color: 'bg-purple-100 text-purple-700' },
  'image/png': { icon: '🖼️', color: 'bg-purple-100 text-purple-700' },
  'image/gif': { icon: '🖼️', color: 'bg-purple-100 text-purple-700' },
  'image/tiff': { icon: '🖼️', color: 'bg-purple-100 text-purple-700' },
  'text/plain': { icon: '📃', color: 'bg-slate-100 text-slate-700' },
  'text/csv': { icon: '📋', color: 'bg-teal-100 text-teal-700' },
  'default': { icon: '📁', color: 'bg-slate-100 text-slate-700' }
};

const getDocumentIcon = (mimeType) => {
  return DOCUMENT_ICONS[mimeType] || DOCUMENT_ICONS['default'];
};

const AdvancedSearch = () => {
  const navigate = useNavigate();
  
  // Search state
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all'); // all, content, title, metadata
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  
  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    documentTypeId: '',
    dateFrom: '',
    dateTo: '',
    tagId: '',
    metadataType: '',
    metadataValue: '',
    sortBy: 'date',
    sortOrder: 'desc'
  });
  
  // Reference data
  const [documentTypes, setDocumentTypes] = useState([]);
  const [tags, setTags] = useState([]);
  const [metadataTypes, setMetadataTypes] = useState([]);
  
  const debouncedQuery = useDebounce(query, 300);

  // Load reference data on mount
  useEffect(() => {
    loadReferenceData();
  }, []);

  // Search when query or filters change
  useEffect(() => {
    if (debouncedQuery || Object.values(filters).some(v => v)) {
      performSearch();
    }
  }, [debouncedQuery, filters, page]);

  const loadReferenceData = async () => {
    try {
      const [typesRes, tagsRes, metaRes] = await Promise.all([
        getDocumentTypes().catch(() => ({ data: { types: [] } })),
        getAllTags().catch(() => ({ data: { tags: [] } })),
        getMetadataTypes().catch(() => ({ data: { metadataTypes: [] } }))
      ]);
      
      setDocumentTypes(typesRes.data.types || typesRes.data.results || []);
      setTags(tagsRes.data.tags || tagsRes.data.results || []);
      setMetadataTypes(metaRes.data.metadataTypes || metaRes.data.results || []);
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  };

  const performSearch = async () => {
    if (!debouncedQuery && !Object.values(filters).some(v => v)) {
      return;
    }
    
    try {
      setLoading(true);
      setSearched(true);
      
      let response;
      
      if (searchType === 'content' && debouncedQuery) {
        // Search by OCR content
        response = await searchByContent(debouncedQuery, page, 20);
      } else {
        // Advanced search with all filters
        const params = {
          q: debouncedQuery || undefined,
          documentTypeId: filters.documentTypeId || undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          tagId: filters.tagId || undefined,
          metadataType: filters.metadataType || undefined,
          metadataValue: filters.metadataValue || undefined,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
          searchType: searchType,
          page,
          limit: 20
        };
        
        // Remove undefined values
        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
        
        response = await advancedSearch(params);
      }
      
      setResults(response.data.documents || response.data.results || []);
      setTotalResults(response.data.total || response.data.count || 0);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      documentTypeId: '',
      dateFrom: '',
      dateTo: '',
      tagId: '',
      metadataType: '',
      metadataValue: '',
      sortBy: 'date',
      sortOrder: 'desc'
    });
    setQuery('');
    setSearchType('all');
    setResults([]);
    setSearched(false);
    setPage(1);
  };

  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value && !['sortBy', 'sortOrder'].includes(key)
  ).length;

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="card p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Search className="w-6 h-6 text-primary-600" />
          Advanced Search
        </h2>
        
        {/* Search Type Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { id: 'all', label: 'All', icon: Search },
            { id: 'content', label: 'OCR Content', icon: Cpu },
            { id: 'title', label: 'Title', icon: FileText },
            { id: 'metadata', label: 'Metadata', icon: Database }
          ].map(type => (
            <button
              key={type.id}
              onClick={() => setSearchType(type.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                searchType === type.id
                  ? 'bg-primary-100 text-primary-800'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <type.icon className="w-4 h-4" />
              {type.label}
            </button>
          ))}
        </div>
        
        {/* Search Input */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchType === 'content' 
                  ? "Search inside document content (OCR text)..." 
                  : searchType === 'title'
                  ? "Search by document title..."
                  : searchType === 'metadata'
                  ? "Search by metadata values..."
                  : "Search documents..."
              }
              className="input pl-12 py-3 text-lg"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'} relative`}
          >
            <SlidersHorizontal className="w-5 h-5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          
          <button
            onClick={performSearch}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
            Search
          </button>
        </div>
        
        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters
              </h3>
              <button
                onClick={clearFilters}
                className="text-sm text-slate-500 hover:text-red-600"
              >
                Clear all
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Document Type */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  <FileType className="w-4 h-4 inline mr-1" />
                  Document Type
                </label>
                <select
                  value={filters.documentTypeId}
                  onChange={(e) => setFilters(prev => ({ ...prev, documentTypeId: e.target.value }))}
                  className="select"
                >
                  <option value="">All Types</option>
                  {documentTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="input"
                />
              </div>
              
              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="input"
                />
              </div>
              
              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  <Tag className="w-4 h-4 inline mr-1" />
                  Tag
                </label>
                <select
                  value={filters.tagId}
                  onChange={(e) => setFilters(prev => ({ ...prev, tagId: e.target.value }))}
                  className="select"
                >
                  <option value="">All Tags</option>
                  {tags.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Metadata Type */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  <Hash className="w-4 h-4 inline mr-1" />
                  Metadata Type
                </label>
                <select
                  value={filters.metadataType}
                  onChange={(e) => setFilters(prev => ({ ...prev, metadataType: e.target.value }))}
                  className="select"
                >
                  <option value="">Any</option>
                  {metadataTypes.map(meta => (
                    <option key={meta.id} value={meta.name}>{meta.label || meta.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Metadata Value */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  <Database className="w-4 h-4 inline mr-1" />
                  Metadata Value
                </label>
                <input
                  type="text"
                  value={filters.metadataValue}
                  onChange={(e) => setFilters(prev => ({ ...prev, metadataValue: e.target.value }))}
                  placeholder="Search in metadata..."
                  className="input"
                />
              </div>
              
              {/* Sort By */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Sort By
                </label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                  className="select"
                >
                  <option value="date">Date Created</option>
                  <option value="title">Title</option>
                  <option value="size">File Size</option>
                </select>
              </div>
              
              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Order
                </label>
                <select
                  value={filters.sortOrder}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortOrder: e.target.value }))}
                  className="select"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Results */}
      <div className="card">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {searched ? (
              loading ? 'Searching...' : `${totalResults} result${totalResults !== 1 ? 's' : ''} found`
            ) : (
              'Enter a search query to find documents'
            )}
          </h3>
          {searched && results.length > 0 && (
            <span className="text-sm text-slate-500">
              Page {page} of {Math.ceil(totalResults / 20)}
            </span>
          )}
        </div>
        
        <div className="p-4">
          {loading ? (
            <DocumentGridSkeleton count={6} />
          ) : !searched ? (
            <div className="text-center py-16">
              <Search className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">Start typing to search documents</p>
              <p className="text-slate-400 text-sm mt-2">
                {searchType === 'content' && "Search inside document text extracted via OCR"}
                {searchType === 'title' && "Search by document filename and title"}
                {searchType === 'metadata' && "Search by document metadata fields"}
                {searchType === 'all' && "Search across all document fields"}
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 text-lg">No documents found</p>
              <p className="text-slate-400 text-sm mt-2">Try adjusting your search terms or filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map(doc => {
                const iconInfo = getDocumentIcon(doc.mimetype || doc.file_latest?.mimetype);
                return (
                  <div
                    key={doc.id}
                    onClick={() => navigate(`/documents/${doc.id}`)}
                    className="flex items-start gap-4 p-4 bg-slate-50 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${iconInfo.color}`}>
                      {iconInfo.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">{doc.label || doc.title}</h4>
                      <p className="text-sm text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(doc.datetime_created)}
                        </span>
                        {doc.document_type?.label && (
                          <span className="flex items-center gap-1">
                            <Folder className="w-3.5 h-3.5" />
                            {doc.document_type.label}
                          </span>
                        )}
                        {doc.file_latest?.mimetype && (
                          <span className="badge badge-slate text-xs">
                            {doc.file_latest.mimetype.split('/')[1]?.toUpperCase()}
                          </span>
                        )}
                      </p>
                      {doc.description && (
                        <p className="text-sm text-slate-600 mt-2 line-clamp-2">{doc.description}</p>
                      )}
                      {/* Show OCR snippet if content search */}
                      {searchType === 'content' && doc.content_snippet && (
                        <p className="text-sm text-slate-600 mt-2 bg-yellow-50 p-2 rounded border-l-4 border-yellow-400">
                          <Cpu className="w-3.5 h-3.5 inline mr-1 text-yellow-600" />
                          ...{doc.content_snippet}...
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/documents/${doc.id}`);
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {searched && totalResults > 20 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <span className="px-4 text-sm text-slate-600">
              Page {page} of {Math.ceil(totalResults / 20)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(totalResults / 20)}
              className="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedSearch;
