import React, { useState, useEffect } from 'react';
import { Search, Calendar, Filter, SlidersHorizontal, X, ArrowUpDown } from 'lucide-react';
import { getDocumentTypes } from '../services/api';

function SearchPanel({ onSearch, isLoading }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [filters, setFilters] = useState({
    q: '',
    documentType: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'datetime_created',
    sortOrder: 'desc'
  });

  // Load document types on mount
  useEffect(() => {
    const loadDocumentTypes = async () => {
      try {
        const response = await getDocumentTypes();
        setDocumentTypes(response.data.types || []);
      } catch (error) {
        console.error('Failed to load document types:', error);
      }
    };
    loadDocumentTypes();
  }, []);

  const handleInputChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleSearch = (e) => {
    e?.preventDefault();
    // Remove empty values
    const cleanFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v !== '')
    );
    onSearch(cleanFilters);
  };

  const handleClear = () => {
    const clearedFilters = {
      q: '',
      documentType: '',
      dateFrom: '',
      dateTo: '',
      sortBy: 'datetime_created',
      sortOrder: 'desc'
    };
    setFilters(clearedFilters);
    onSearch({});
  };

  const activeFiltersCount = [
    filters.documentType,
    filters.dateFrom,
    filters.dateTo
  ].filter(Boolean).length;

  return (
    <div className="card mb-6">
      <form onSubmit={handleSearch}>
        {/* Main Search Bar */}
        <div className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search documents by title, content, or keywords..."
                value={filters.q}
                onChange={(e) => handleInputChange('q', e.target.value)}
                className="input pl-12 pr-4"
              />
            </div>
            
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className={`btn ${isExpanded || activeFiltersCount > 0 ? 'btn-primary' : 'btn-secondary'} relative`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            <button 
              type="submit" 
              disabled={isLoading}
              className="btn btn-primary"
            >
              {isLoading ? (
                <div className="spinner !h-4 !w-4 !border-white !border-t-transparent" />
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline">Search</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-0 border-t border-slate-100 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {/* Document Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Filter className="w-4 h-4 inline mr-1" />
                  Document Type
                </label>
                <select
                  value={filters.documentType}
                  onChange={(e) => handleInputChange('documentType', e.target.value)}
                  className="select"
                >
                  <option value="">All Types</option>
                  {documentTypes.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleInputChange('dateFrom', e.target.value)}
                  className="input"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleInputChange('dateTo', e.target.value)}
                  className="input"
                />
              </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <ArrowUpDown className="w-4 h-4 inline mr-1" />
                  Sort By
                </label>
                <div className="flex gap-2">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => handleInputChange('sortBy', e.target.value)}
                    className="select flex-1"
                  >
                    <option value="datetime_created">Upload Date</option>
                    <option value="label">Title</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleInputChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="btn btn-secondary px-3"
                    title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    {filters.sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>
            </div>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClear}
                  className="btn btn-ghost text-slate-500"
                >
                  <X className="w-4 h-4" />
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

export default SearchPanel;
