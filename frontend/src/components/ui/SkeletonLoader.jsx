import React from 'react';

/**
 * Base skeleton component with shimmer animation
 */
export const Skeleton = ({ className = '', style = {} }) => (
  <div 
    className={`skeleton rounded ${className}`} 
    style={style}
  />
);

/**
 * Document card skeleton for Dashboard loading state
 */
export const DocumentCardSkeleton = () => (
  <div className="card p-5 animate-pulse">
    <div className="flex items-start gap-4">
      {/* Icon placeholder */}
      <div className="w-12 h-12 rounded-xl skeleton flex-shrink-0" />
      
      <div className="flex-1 min-w-0 space-y-3">
        {/* Title */}
        <div className="h-5 w-3/4 rounded skeleton" />
        
        {/* Date */}
        <div className="h-4 w-1/2 rounded skeleton" />
        
        {/* User */}
        <div className="h-4 w-1/3 rounded skeleton" />
      </div>
    </div>
    
    {/* Action buttons */}
    <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
      <div className="h-9 flex-1 rounded-lg skeleton" />
      <div className="h-9 w-9 rounded-lg skeleton" />
    </div>
  </div>
);

/**
 * Grid of document card skeletons
 */
export const DocumentGridSkeleton = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
    {Array(count).fill(0).map((_, i) => (
      <DocumentCardSkeleton key={i} />
    ))}
  </div>
);

/**
 * Table row skeleton for lists
 */
export const TableRowSkeleton = ({ columns = 4 }) => (
  <tr>
    {Array(columns).fill(0).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-4 rounded skeleton" style={{ width: `${60 + Math.random() * 30}%` }} />
      </td>
    ))}
  </tr>
);

/**
 * Table skeleton
 */
export const TableSkeleton = ({ rows = 5, columns = 4 }) => (
  <div className="table-container">
    <table className="table">
      <thead>
        <tr>
          {Array(columns).fill(0).map((_, i) => (
            <th key={i}>
              <div className="h-3 w-20 rounded skeleton" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array(rows).fill(0).map((_, i) => (
          <TableRowSkeleton key={i} columns={columns} />
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * Stat card skeleton
 */
export const StatCardSkeleton = () => (
  <div className="stat-card animate-pulse">
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl skeleton" />
      <div className="space-y-2">
        <div className="h-6 w-16 rounded skeleton" />
        <div className="h-4 w-24 rounded skeleton" />
      </div>
    </div>
  </div>
);

/**
 * Grid of stat card skeletons
 */
export const StatGridSkeleton = ({ count = 4 }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    {Array(count).fill(0).map((_, i) => (
      <StatCardSkeleton key={i} />
    ))}
  </div>
);

/**
 * Audit log entry skeleton
 */
export const AuditLogSkeleton = () => (
  <div className="flex items-start gap-4 p-4 border-b border-slate-100 animate-pulse">
    <div className="w-10 h-10 rounded-xl skeleton flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-5 w-20 rounded-full skeleton" />
        <div className="h-4 w-32 rounded skeleton" />
      </div>
      <div className="h-4 w-48 rounded skeleton" />
    </div>
    <div className="h-4 w-24 rounded skeleton" />
  </div>
);

/**
 * Audit log list skeleton
 */
export const AuditLogListSkeleton = ({ count = 8 }) => (
  <div className="card overflow-hidden">
    {Array(count).fill(0).map((_, i) => (
      <AuditLogSkeleton key={i} />
    ))}
  </div>
);

/**
 * Storage progress bar skeleton
 */
export const StorageBarSkeleton = () => (
  <div className="space-y-2 animate-pulse">
    <div className="flex justify-between">
      <div className="h-4 w-24 rounded skeleton" />
      <div className="h-4 w-16 rounded skeleton" />
    </div>
    <div className="h-3 w-full rounded-full skeleton" />
  </div>
);

/**
 * Document preview skeleton (thumbnail)
 */
export const ThumbnailSkeleton = ({ size = 'md' }) => {
  const sizes = {
    sm: 'w-16 h-20',
    md: 'w-24 h-32',
    lg: 'w-32 h-40'
  };
  
  return (
    <div className={`${sizes[size]} rounded-lg skeleton flex-shrink-0`} />
  );
};

/**
 * Search panel skeleton
 */
export const SearchPanelSkeleton = () => (
  <div className="card p-4 mb-6 animate-pulse">
    <div className="flex flex-wrap gap-4">
      <div className="flex-1 min-w-64 h-10 rounded-lg skeleton" />
      <div className="w-40 h-10 rounded-lg skeleton" />
      <div className="w-32 h-10 rounded-lg skeleton" />
    </div>
  </div>
);

/**
 * Full page loading skeleton
 */
export const PageSkeleton = ({ type = 'documents' }) => {
  if (type === 'documents') {
    return (
      <div className="max-w-7xl mx-auto">
        {/* Header skeleton */}
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="space-y-2">
            <div className="h-8 w-48 rounded skeleton" />
            <div className="h-5 w-64 rounded skeleton" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-40 rounded-lg skeleton" />
            <div className="h-10 w-36 rounded-lg skeleton" />
          </div>
        </div>
        
        {/* Search panel skeleton */}
        <SearchPanelSkeleton />
        
        {/* Document grid skeleton */}
        <DocumentGridSkeleton count={6} />
        
        {/* Pagination skeleton */}
        <div className="flex justify-center gap-2">
          <div className="h-10 w-28 rounded-lg skeleton" />
          <div className="h-10 w-32 rounded-lg skeleton" />
          <div className="h-10 w-20 rounded-lg skeleton" />
        </div>
      </div>
    );
  }
  
  if (type === 'storage') {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={4} />
        <div className="card p-6 space-y-4">
          <div className="h-6 w-48 rounded skeleton" />
          {Array(4).fill(0).map((_, i) => (
            <StorageBarSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  
  return null;
};

export default {
  Skeleton,
  DocumentCardSkeleton,
  DocumentGridSkeleton,
  TableRowSkeleton,
  TableSkeleton,
  StatCardSkeleton,
  StatGridSkeleton,
  AuditLogSkeleton,
  AuditLogListSkeleton,
  StorageBarSkeleton,
  ThumbnailSkeleton,
  SearchPanelSkeleton,
  PageSkeleton
};
