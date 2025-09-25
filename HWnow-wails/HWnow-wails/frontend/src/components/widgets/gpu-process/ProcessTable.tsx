import React, { memo, useCallback } from 'react';
import type { GPUProcessData } from './DataProcessor';
import { formatGPUMemory, formatGPUUsage, abbreviateProcessName } from './DataProcessor';

interface ProcessTableProps {
  processes: GPUProcessData[];
  selectedProcesses: Set<number>;
  isTerminating: Set<number>;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  onProcessSelect: (pid: number, isSelected: boolean) => void;
  onSelectAll: () => void;
  onTerminateProcess: (pid: number, processName: string) => void;
  className?: string;
}

const SortIcon: React.FC<{ column: string; sortColumn: string; sortDirection: 'asc' | 'desc' }> = memo(({
  column,
  sortColumn,
  sortDirection
}) => {
  if (column !== sortColumn) {
    return (
      <svg className="sort-icon sort-neutral" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 3l3 3H3l3-3zM6 9l-3-3h6l-3 3z" fill="currentColor" opacity="0.3"/>
      </svg>
    );
  }

  return (
    <svg className={`sort-icon sort-${sortDirection}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
      {sortDirection === 'asc' ? (
        <path d="M6 3l3 3H3l3-3z" fill="currentColor"/>
      ) : (
        <path d="M6 9l-3-3h6l-3 3z" fill="currentColor"/>
      )}
    </svg>
  );
});

SortIcon.displayName = 'SortIcon';

const ProcessStatusBadge: React.FC<{ status?: string; type: string }> = memo(({ status = 'running', type }) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running': return 'status-running';
      case 'suspended': return 'status-suspended';
      case 'terminated': return 'status-terminated';
      case 'error': return 'status-error';
      default: return 'status-unknown';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type.toUpperCase()) {
      case 'C': return 'type-compute';
      case 'G': return 'type-graphics';
      case 'C+G': return 'type-both';
      default: return 'type-unknown';
    }
  };

  return (
    <div className="process-badges">
      <span className={`process-badge ${getStatusColor(status)}`}>
        {status}
      </span>
      <span className={`process-badge ${getTypeColor(type)}`}>
        {type}
      </span>
    </div>
  );
});

ProcessStatusBadge.displayName = 'ProcessStatusBadge';

const ProcessTableRow: React.FC<{
  process: GPUProcessData;
  isSelected: boolean;
  isTerminating: boolean;
  onSelect: (pid: number, isSelected: boolean) => void;
  onTerminate: (pid: number, processName: string) => void;
}> = memo(({ process, isSelected, isTerminating, onSelect, onTerminate }) => {
  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSelect(process.pid, e.target.checked);
  }, [onSelect, process.pid]);

  const handleTerminateClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isTerminating) {
      onTerminate(process.pid, process.name);
    }
  }, [onTerminate, process.pid, process.name, isTerminating]);

  const rowClassName = `process-row ${isSelected ? 'selected' : ''} ${isTerminating ? 'terminating' : ''}`;

  return (
    <tr className={rowClassName} role="row">
      <td role="gridcell">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          disabled={isTerminating}
          aria-label={`Select process ${process.name} (PID: ${process.pid})`}
        />
      </td>
      <td role="gridcell" className="pid-cell">{process.pid}</td>
      <td role="gridcell" className="name-cell">
        <span title={process.name}>
          {abbreviateProcessName(process.name, 25)}
        </span>
      </td>
      <td role="gridcell" className="usage-cell">
        <div className="usage-bar-container">
          <div className="usage-bar">
            <div
              className="usage-fill"
              style={{ width: `${Math.min(process.gpu_usage, 100)}%` }}
            />
          </div>
          <span className="usage-text">{formatGPUUsage(process.gpu_usage)}</span>
        </div>
      </td>
      <td role="gridcell" className="memory-cell">{formatGPUMemory(process.gpu_memory)}</td>
      <td role="gridcell" className="status-cell">
        <ProcessStatusBadge status={process.status} type={process.type} />
      </td>
      <td role="gridcell" className="actions-cell">
        <div className="process-actions">
          <button
            className="action-btn terminate-btn"
            onClick={handleTerminateClick}
            disabled={isTerminating}
            title={`Terminate ${process.name}`}
            aria-label={`Terminate process ${process.name} (PID: ${process.pid})`}
          >
            {isTerminating ? (
              <div className="btn-spinner" aria-hidden="true" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </td>
    </tr>
  );
});

ProcessTableRow.displayName = 'ProcessTableRow';

export const ProcessTable: React.FC<ProcessTableProps> = memo(({
  processes,
  selectedProcesses,
  isTerminating,
  sortColumn,
  sortDirection,
  onSort,
  onProcessSelect,
  onSelectAll,
  onTerminateProcess,
  className = ''
}) => {
  const handleHeaderClick = useCallback((column: string) => {
    onSort(column);
  }, [onSort]);

  const handleSelectAllChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSelectAll();
  }, [onSelectAll]);

  const allSelected = processes.length > 0 && selectedProcesses.size === processes.length;
  const someSelected = selectedProcesses.size > 0 && selectedProcesses.size < processes.length;

  if (processes.length === 0) {
    return (
      <div className={`process-table-container ${className}`}>
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
            </svg>
          </div>
          <h3>No GPU processes found</h3>
          <p>No GPU processes are currently running or match your filter criteria.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`process-table-container ${className}`}>
      <table className="process-table" role="grid" aria-label="GPU Processes">
        <thead>
          <tr role="row">
            <th role="columnheader" className="select-header">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(input) => {
                  if (input) {
                    input.indeterminate = someSelected;
                  }
                }}
                onChange={handleSelectAllChange}
                aria-label="Select all processes"
              />
            </th>
            <th
              role="columnheader"
              className="sortable-header pid-header"
              onClick={() => handleHeaderClick('pid')}
              aria-sort={sortColumn === 'pid' ? sortDirection : 'none'}
            >
              PID
              <SortIcon column="pid" sortColumn={sortColumn} sortDirection={sortDirection} />
            </th>
            <th
              role="columnheader"
              className="sortable-header name-header"
              onClick={() => handleHeaderClick('name')}
              aria-sort={sortColumn === 'name' ? sortDirection : 'none'}
            >
              Process Name
              <SortIcon column="name" sortColumn={sortColumn} sortDirection={sortDirection} />
            </th>
            <th
              role="columnheader"
              className="sortable-header usage-header"
              onClick={() => handleHeaderClick('gpu_usage')}
              aria-sort={sortColumn === 'gpu_usage' ? sortDirection : 'none'}
            >
              GPU Usage
              <SortIcon column="gpu_usage" sortColumn={sortColumn} sortDirection={sortDirection} />
            </th>
            <th
              role="columnheader"
              className="sortable-header memory-header"
              onClick={() => handleHeaderClick('gpu_memory')}
              aria-sort={sortColumn === 'gpu_memory' ? sortDirection : 'none'}
            >
              GPU Memory
              <SortIcon column="gpu_memory" sortColumn={sortColumn} sortDirection={sortDirection} />
            </th>
            <th
              role="columnheader"
              className="sortable-header status-header"
              onClick={() => handleHeaderClick('type')}
              aria-sort={sortColumn === 'type' ? sortDirection : 'none'}
            >
              Status/Type
              <SortIcon column="type" sortColumn={sortColumn} sortDirection={sortDirection} />
            </th>
            <th role="columnheader" className="actions-header">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <ProcessTableRow
              key={process.pid}
              process={process}
              isSelected={selectedProcesses.has(process.pid)}
              isTerminating={isTerminating.has(process.pid)}
              onSelect={onProcessSelect}
              onTerminate={onTerminateProcess}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

ProcessTable.displayName = 'ProcessTable';