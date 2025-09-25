import type { SystemResourceData } from '../../../stores/systemResourceStore';

type GPUProcess = SystemResourceData['gpu_processes'][number];

type FilterType = 'and' | 'or';

export type SortKey = 'gpu_usage' | 'gpu_memory' | 'name' | 'pid' | 'type' | 'status';

export type SortOrder = 'asc' | 'desc';

export interface FilterOptions {
  enabled: boolean;
  usageThreshold: number;
  memoryThreshold: number;
  filterType: FilterType;
}

export const filterGpuProcesses = (processes: GPUProcess[], options: FilterOptions): GPUProcess[] => {
  if (!options.enabled) {
    return processes;
  }

  return processes.filter(process => {
    const meetsUsage = process.gpu_usage >= options.usageThreshold;
    const meetsMemory = process.gpu_memory >= options.memoryThreshold;

    return options.filterType === 'and' ? meetsUsage && meetsMemory : meetsUsage || meetsMemory;
  });
};

export const sortGpuProcesses = (
  processes: GPUProcess[],
  sortBy: SortKey,
  sortOrder: SortOrder,
  limit?: number
): GPUProcess[] => {
  const sorted = [...processes].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'gpu_usage':
        comparison = a.gpu_usage - b.gpu_usage;
        break;
      case 'gpu_memory':
        comparison = a.gpu_memory - b.gpu_memory;
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'pid':
        comparison = a.pid - b.pid;
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
      case 'status':
        comparison = (a.status || '').localeCompare(b.status || '');
        break;
      default:
        comparison = 0;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
};
