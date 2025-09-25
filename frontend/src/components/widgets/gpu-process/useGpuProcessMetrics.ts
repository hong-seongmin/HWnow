import { useMemo } from 'react';
import type { SystemResourceData } from '../../../stores/systemResourceStore';
import { filterGpuProcesses, sortGpuProcesses, type SortKey, type SortOrder } from './processFiltering';

type GPUProcess = SystemResourceData['gpu_processes'][number];

export interface GpuProcessMetricsResult {
  filteredProcesses: GPUProcess[];
  sortedProcesses: GPUProcess[];
  filteredCount: number;
  totalCount: number;
}

interface MetricsOptions {
  filterEnabled: boolean;
  usageThreshold: number;
  memoryThreshold: number;
  filterType: 'and' | 'or';
  sortBy: SortKey;
  sortOrder: SortOrder;
  processCount: number;
}

export const useGpuProcessMetrics = (
  gpuProcesses: GPUProcess[],
  options: MetricsOptions
): GpuProcessMetricsResult => {
  const filteredProcesses = useMemo(() => {
    return filterGpuProcesses(gpuProcesses, {
      enabled: options.filterEnabled,
      usageThreshold: options.usageThreshold,
      memoryThreshold: options.memoryThreshold,
      filterType: options.filterType,
    });
  }, [gpuProcesses, options.filterEnabled, options.usageThreshold, options.memoryThreshold, options.filterType]);

  const sortedProcesses = useMemo(() => {
    return sortGpuProcesses(
      filteredProcesses,
      options.sortBy,
      options.sortOrder,
      options.processCount
    );
  }, [filteredProcesses, options.sortBy, options.sortOrder, options.processCount]);

  return useMemo(() => ({
    filteredProcesses,
    sortedProcesses,
    filteredCount: filteredProcesses.length,
    totalCount: gpuProcesses.length,
  }), [filteredProcesses, sortedProcesses, gpuProcesses.length]);
};
