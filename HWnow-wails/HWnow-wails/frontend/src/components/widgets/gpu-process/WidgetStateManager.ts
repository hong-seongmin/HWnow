// GPU Process Widget State Management

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSystemResourceStore } from '../../../stores/systemResourceStore';
import { useDashboardStore } from '../../../stores/dashboardStore';
import { onConnectionStatusChange, getWebSocketStatus, flushGPUProcessBatch } from '../../../services/wailsEventService';
import type { GPUProcessData } from './DataProcessor';
import { getSafeGPUProcesses, filterProcesses, sortProcesses, getProcessStatusCounts } from './DataProcessor';

export interface WidgetState {
  isSettingsOpen: boolean;
  lastUpdateTime: number;
  isConnected: boolean;
  selectedProcesses: Set<number>;
  isTerminating: Set<number>;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  searchTerm: string;
  autoRefresh: boolean;
}

export interface WidgetActions {
  setIsSettingsOpen: (open: boolean) => void;
  setLastUpdateTime: (time: number) => void;
  setIsConnected: (connected: boolean) => void;
  setSelectedProcesses: (processes: Set<number>) => void;
  setIsTerminating: (processes: Set<number>) => void;
  setSortColumn: (column: string) => void;
  setSortDirection: (direction: 'asc' | 'desc') => void;
  setSearchTerm: (term: string) => void;
  setAutoRefresh: (enabled: boolean) => void;
  handleSort: (column: string) => void;
  handleProcessSelect: (pid: number, isSelected: boolean) => void;
  handleSelectAll: () => void;
  toggleTerminating: (pid: number, isTerminating: boolean) => void;
}

export interface ProcessedData {
  allProcesses: GPUProcessData[];
  filteredProcesses: GPUProcessData[];
  sortedProcesses: GPUProcessData[];
  processStatusCounts: Record<string, number>;
  isEmpty: boolean;
}

export function useWidgetState(widgetId: string, preset: any): {
  state: WidgetState;
  actions: WidgetActions;
  data: ProcessedData;
} {
  // State management
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [selectedProcesses, setSelectedProcesses] = useState<Set<number>>(new Set());
  const [isTerminating, setIsTerminating] = useState<Set<number>>(new Set());
  const [sortColumn, setSortColumn] = useState<string>(preset?.sortBy || 'gpu_usage');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(preset?.sortDirection || 'desc');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Store connections
  const gpuProcesses = useSystemResourceStore(state => state.gpuProcesses) || [];
  const updateWidget = useDashboardStore(state => state.updateWidget);

  // Connection status tracking
  const connectionCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Set up connection status monitoring
    connectionCleanupRef.current = onConnectionStatusChange((connected: boolean) => {
      setIsConnected(connected);
    });

    // Initial connection check
    const status = getWebSocketStatus();
    setIsConnected(status.connected);

    return () => {
      if (connectionCleanupRef.current) {
        connectionCleanupRef.current();
      }
    };
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    let refreshInterval: number | null = null;

    if (autoRefresh && isConnected) {
      refreshInterval = window.setInterval(() => {
        flushGPUProcessBatch();
        setLastUpdateTime(Date.now());
      }, 5000); // Refresh every 5 seconds
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [autoRefresh, isConnected]);

  // Data processing
  const allProcesses = useMemo((): GPUProcessData[] => {
    return getSafeGPUProcesses(gpuProcesses);
  }, [gpuProcesses]);

  const filteredProcesses = useMemo((): GPUProcessData[] => {
    const baseFiltered = filterProcesses(allProcesses, preset, {
      searchTerm: searchTerm.trim()
    });

    return baseFiltered;
  }, [allProcesses, preset, searchTerm]);

  const sortedProcesses = useMemo((): GPUProcessData[] => {
    return sortProcesses(filteredProcesses, sortColumn, sortDirection);
  }, [filteredProcesses, sortColumn, sortDirection]);

  const processStatusCounts = useMemo(() => {
    return getProcessStatusCounts(filteredProcesses);
  }, [filteredProcesses]);

  const isEmpty = useMemo(() => sortedProcesses.length === 0, [sortedProcesses.length]);

  // Actions
  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }, [sortColumn]);

  const handleProcessSelect = useCallback((pid: number, isSelected: boolean) => {
    setSelectedProcesses(current => {
      const newSet = new Set(current);
      if (isSelected) {
        newSet.add(pid);
      } else {
        newSet.delete(pid);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allSelected = selectedProcesses.size === sortedProcesses.length && sortedProcesses.length > 0;

    if (allSelected) {
      setSelectedProcesses(new Set());
    } else {
      setSelectedProcesses(new Set(sortedProcesses.map(p => p.pid)));
    }
  }, [selectedProcesses.size, sortedProcesses]);

  const toggleTerminating = useCallback((pid: number, isTerminating: boolean) => {
    setIsTerminating(current => {
      const newSet = new Set(current);
      if (isTerminating) {
        newSet.add(pid);
      } else {
        newSet.delete(pid);
      }
      return newSet;
    });
  }, []);

  // Widget settings persistence
  const saveWidgetSettings = useCallback(() => {
    if (updateWidget) {
      updateWidget(widgetId, {
        sortBy: sortColumn,
        sortDirection,
        lastUpdated: Date.now()
      });
    }
  }, [widgetId, sortColumn, sortDirection, updateWidget]);

  // Save settings when sort changes
  useEffect(() => {
    saveWidgetSettings();
  }, [saveWidgetSettings]);

  const state: WidgetState = {
    isSettingsOpen,
    lastUpdateTime,
    isConnected,
    selectedProcesses,
    isTerminating,
    sortColumn,
    sortDirection,
    searchTerm,
    autoRefresh
  };

  const actions: WidgetActions = {
    setIsSettingsOpen,
    setLastUpdateTime,
    setIsConnected,
    setSelectedProcesses,
    setIsTerminating,
    setSortColumn,
    setSortDirection,
    setSearchTerm,
    setAutoRefresh,
    handleSort,
    handleProcessSelect,
    handleSelectAll,
    toggleTerminating
  };

  const data: ProcessedData = {
    allProcesses,
    filteredProcesses,
    sortedProcesses,
    processStatusCounts,
    isEmpty
  };

  return { state, actions, data };
}

export function useProcessOperations(
  actions: WidgetActions,
  showToast: (message: string, type?: string) => void
) {
  const { toggleTerminating } = actions;

  const executeProcessOperation = useCallback(async (
    operation: () => Promise<any>,
    pid: number,
    operationName: string,
    processName?: string
  ) => {
    toggleTerminating(pid, true);

    try {
      const result = await operation();

      if (result && result.success === false) {
        throw new Error(result.message || `Failed to ${operationName} process`);
      }

      showToast(`Process ${processName || pid} ${operationName}d successfully`, 'success');
    } catch (error) {
      console.error(`Failed to ${operationName} process ${pid}:`, error);
      showToast(
        `Failed to ${operationName} process ${processName || pid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      toggleTerminating(pid, false);
    }
  }, [toggleTerminating, showToast]);

  return { executeProcessOperation };
}