// GPU Process Data Processing Utilities

export interface GPUProcessData {
  pid: number;
  name: string;
  gpu_usage: number;
  gpu_memory: number;
  type: string;
  command?: string;
  status?: string;
  priority?: string;
}

export const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

export const isValidGPUProcess = (process: unknown): process is GPUProcessData => {
  if (!process || typeof process !== 'object') return false;

  const p = process as any;
  return (
    isValidNumber(p.pid) &&
    typeof p.name === 'string' &&
    isValidNumber(p.gpu_usage) &&
    isValidNumber(p.gpu_memory) &&
    typeof p.type === 'string'
  );
};

export const getSafeGPUProcesses = (processes: unknown[]): GPUProcessData[] => {
  if (!Array.isArray(processes)) return [];

  return processes
    .filter(isValidGPUProcess)
    .map(process => ({
      ...process,
      command: process.command || '',
      status: process.status || 'running',
      priority: process.priority || 'normal'
    }));
};

export const abbreviateProcessName = (name: string, maxLength: number = 25): string => {
  if (!name || name.length <= maxLength) return name;

  // Clean up common prefixes first
  let cleanName = name;

  // Handle C:... pattern more aggressively
  if (cleanName.startsWith("C:\\") && cleanName.includes("...\\")) {
    // Extract just the filename after the ... pattern
    const lastBackslashIndex = cleanName.lastIndexOf("\\");
    if (lastBackslashIndex > -1) {
      cleanName = cleanName.substring(lastBackslashIndex + 1);
    }
  }
  // Remove common Windows system paths
  const commonPrefixes = [
    'C:\\Windows\\System32\\',
    'C:\\Windows\\SysWOW64\\',
    'C:\\Program Files\\',
    'C:\\Program Files (x86)\\',
    'C:\\Users\\',
    'C:\\',
  ];

  for (const prefix of commonPrefixes) {
    if (cleanName.startsWith(prefix)) {
      cleanName = cleanName.substring(prefix.length);
      break;
    }
  }

  // For file paths, extract the filename
  if (cleanName.includes('\\') || cleanName.includes('/')) {
    const parts = cleanName.split(/[\\\/]/);
    const fileName = parts[parts.length - 1];

    if (fileName) {
      cleanName = fileName;
    }
  }

  // If still too long, handle executable names specially
  if (cleanName.length > maxLength) {
    if (cleanName.includes('.')) {
      const dotIndex = cleanName.lastIndexOf('.');
      if (dotIndex > 0) {
        const nameWithoutExt = cleanName.substring(0, dotIndex);
        const extension = cleanName.substring(dotIndex);

        // For .exe files, prioritize showing the extension
        if (extension.toLowerCase() === '.exe' || extension.toLowerCase() === '.app') {
          const maxNameLength = maxLength - extension.length - 3; // "..." space
          if (maxNameLength > 0) {
            return nameWithoutExt.substring(0, maxNameLength) + '...' + extension;
          }
        }

        // For other files, try to keep some of the name and extension
        const maxNameLength = maxLength - extension.length - 3;
        if (maxNameLength > 3) {
          return nameWithoutExt.substring(0, maxNameLength) + '...' + extension;
        }
      }
    }

    // Default truncation for long names without extensions
    return cleanName.substring(0, maxLength - 3) + '...';
  }

  return cleanName;
};

export const filterProcesses = (
  processes: GPUProcessData[],
  preset: any, // This would be properly typed based on your preset system
  customFilters?: {
    minGpuUsage?: number;
    minGpuMemory?: number;
    processTypes?: string[];
    searchTerm?: string;
  }
): GPUProcessData[] => {
  let filtered = [...processes];

  // Apply preset filters
  if (preset?.minGpuUsage !== undefined) {
    filtered = filtered.filter(p => p.gpu_usage >= preset.minGpuUsage);
  }

  if (preset?.minGpuMemory !== undefined) {
    filtered = filtered.filter(p => p.gpu_memory >= preset.minGpuMemory);
  }

  if (preset?.showProcessTypes && Array.isArray(preset.showProcessTypes)) {
    const allowedTypes = preset.showProcessTypes.filter(Boolean);
    if (allowedTypes.length > 0) {
      filtered = filtered.filter(p => allowedTypes.includes(p.type));
    }
  }

  // Apply custom filters
  if (customFilters) {
    if (customFilters.minGpuUsage !== undefined) {
      filtered = filtered.filter(p => p.gpu_usage >= customFilters.minGpuUsage!);
    }

    if (customFilters.minGpuMemory !== undefined) {
      filtered = filtered.filter(p => p.gpu_memory >= customFilters.minGpuMemory!);
    }

    if (customFilters.processTypes && customFilters.processTypes.length > 0) {
      filtered = filtered.filter(p => customFilters.processTypes!.includes(p.type));
    }

    if (customFilters.searchTerm && customFilters.searchTerm.trim()) {
      const searchTerm = customFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchTerm) ||
        (p.command && p.command.toLowerCase().includes(searchTerm)) ||
        p.pid.toString().includes(searchTerm)
      );
    }
  }

  return filtered;
};

export const sortProcesses = (
  processes: GPUProcessData[],
  sortColumn: string,
  sortDirection: 'asc' | 'desc'
): GPUProcessData[] => {
  return [...processes].sort((a, b) => {
    let compareResult = 0;

    switch (sortColumn) {
      case 'pid':
        compareResult = a.pid - b.pid;
        break;
      case 'name':
        compareResult = a.name.localeCompare(b.name);
        break;
      case 'gpu_usage':
        compareResult = a.gpu_usage - b.gpu_usage;
        break;
      case 'gpu_memory':
        compareResult = a.gpu_memory - b.gpu_memory;
        break;
      case 'type':
        compareResult = a.type.localeCompare(b.type);
        break;
      case 'status':
        compareResult = (a.status || '').localeCompare(b.status || '');
        break;
      default:
        return 0;
    }

    return sortDirection === 'asc' ? compareResult : -compareResult;
  });
};

export const getProcessStatusCounts = (processes: GPUProcessData[]) => {
  return processes.reduce((counts, process) => {
    const status = process.status || 'running';
    counts[status] = (counts[status] || 0) + 1;
    counts.total = (counts.total || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
};

export const formatGPUMemory = (memory: number): string => {
  if (memory >= 1024) {
    return `${(memory / 1024).toFixed(1)} GB`;
  }
  return `${memory.toFixed(0)} MB`;
};

export const formatGPUUsage = (usage: number): string => {
  return `${usage.toFixed(1)}%`;
};

export const getProcessPriorityLevel = (priority?: string): number => {
  const priorityMap: Record<string, number> = {
    'low': 1,
    'below_normal': 2,
    'normal': 3,
    'above_normal': 4,
    'high': 5,
    'realtime': 6
  };
  return priorityMap[priority || 'normal'] || 3;
};