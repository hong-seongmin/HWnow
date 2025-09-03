import { create } from 'zustand';
import type { WidgetType } from './types';

export type SystemResourceData = {
  cpu: number[];
  cpu_cores: { [key: string]: number[] }; // cpu_core_1, cpu_core_2, etc.
  cpu_info: { model: string; cores: number } | null; // CPU 정보
  ram: number[];
  disk_read: number[];
  disk_write: number[];
  net_sent: number[];
  net_recv: number[];
  
  // 새로운 데이터 타입들
  system_uptime: number[];
  boot_time: Date[];
  disk_total: number[];
  disk_used: number[];
  disk_free: number[];
  disk_usage_percent: number[];
  memory_physical: number[];
  memory_virtual: number[];
  memory_swap: number[];
  battery_percent: number[];
  battery_plugged: number[];
  network_status: string[];
  gpu_name: string[];
  
  // 네트워크 상태 (인터페이스별)
  network_interfaces: { [key: string]: { status: number[]; ip: string } };
  
  // 프로세스 정보 (최신 상태만 저장)
  processes: Array<{
    name: string;
    pid: number;
    cpu: number;
    memory: number;
  }>;
  
  // Top 프로세스 정보 (최신 상태만 저장)
  top_processes: Array<{
    name: string;
    pid: number;
    cpu: number;
    memory: number;
  }>;
  
  // GPU 프로세스 정보 (최신 상태만 저장)
  gpu_processes: Array<{
    pid: number;
    name: string;
    gpu_usage: number;
    gpu_memory: number;
    type: string;
    command: string;
    status: string;
  }>;
  
  // GPU 관련
  gpu_usage: number[];
  gpu_memory_used: number[];
  gpu_memory_total: number[];
  gpu_temperature: number[];
  gpu_power: number[];
  gpu_info: Array<{ info: string }>;
}

interface SystemResourceState {
  data: SystemResourceData;
  setData: (type: WidgetType | string, value: number, info?: string) => void;
  setGPUProcesses: (processes: SystemResourceData['gpu_processes']) => void;
  clearGPUProcesses: () => void;
  maxDataPoints: number;
}

const initialState: SystemResourceData = {
  cpu: [],
  cpu_cores: {},
  cpu_info: null,
  ram: [],
  disk_read: [],
  disk_write: [],
  net_sent: [],
  net_recv: [],
  
  // 새로운 데이터 타입들
  system_uptime: [],
  boot_time: [],
  disk_total: [],
  disk_used: [],
  disk_free: [],
  disk_usage_percent: [],
  memory_physical: [],
  memory_virtual: [],
  memory_swap: [],
  battery_percent: [],
  battery_plugged: [],
  network_status: [],
  gpu_name: [],
  
  // 네트워크 상태
  network_interfaces: {},
  
  // 프로세스 정보
  processes: [],
  
  // Top 프로세스 정보
  top_processes: [],
  
  // GPU 프로세스 정보
  gpu_processes: [],
  
  // GPU 관련
  gpu_usage: [],
  gpu_memory_used: [],
  gpu_memory_total: [],
  gpu_temperature: [],
  gpu_power: [],
  gpu_info: [],
};

export const useSystemResourceStore = create<SystemResourceState>((set) => ({
  data: initialState,
  maxDataPoints: 200, // Default max points
  setGPUProcesses: (processes) => {
    set((state) => ({
      data: {
        ...state.data,
        gpu_processes: processes,
      },
    }));
  },
  clearGPUProcesses: () => {
    set((state) => ({
      data: {
        ...state.data,
        gpu_processes: [],
      },
    }));
  },
  setData: (type, value, info) => {
    // 데이터 수신 로깅 (debug mode)
    if (type === 'disk_read' || type === 'disk_write' || type === 'net_sent' || type === 'net_recv') {
      console.log(`[SystemResourceStore] Receiving ${type}: ${value}`, info ? `(info: ${info})` : '');
    }
    
    set((state) => {
      // Handle CPU info separately
      if (type === 'cpu_info' && info) {
        return {
          data: {
            ...state.data,
            cpu_info: { model: info, cores: value },
          },
        };
      }
      
      // Handle CPU core data separately
      if (type.startsWith('cpu_core_')) {
        const currentCores = state.data.cpu_cores || {};
        const currentData = currentCores[type] || [];
        const newData = [...currentData, value].slice(-state.maxDataPoints);
        
        return {
          data: {
            ...state.data,
            cpu_cores: {
              ...currentCores,
              [type]: newData,
            },
          },
        };
      }
      
      // Handle network interface status
      if (type.startsWith('network_') && type.endsWith('_status')) {
        const interfaceName = type.replace('network_', '').replace('_status', '');
        const currentInterfaces = state.data.network_interfaces || {};
        const currentInterface = currentInterfaces[interfaceName] || { status: [], ip: '' };
        const newStatus = [...currentInterface.status, value].slice(-state.maxDataPoints);
        
        return {
          data: {
            ...state.data,
            network_interfaces: {
              ...currentInterfaces,
              [interfaceName]: {
                status: newStatus,
                ip: info || currentInterface.ip,
              },
            },
          },
        };
      }
      
      // Handle process data
      if (type.startsWith('process_')) {
        const processIndex = parseInt(type.replace('process_', ''));
        if (info) {
          const [name, pid, memory] = info.split('|');
          const newProcesses = [...state.data.processes];
          newProcesses[processIndex] = {
            name,
            pid: parseInt(pid),
            cpu: value,
            memory: parseFloat(memory),
          };
          
          return {
            data: {
              ...state.data,
              processes: newProcesses,
            },
          };
        }
      }
      
      // Handle GPU process data
      if (type.startsWith('gpu_process_')) {
        const processIndex = parseInt(type.replace('gpu_process_', ''));
        if (info) {
          const [name, pid, gpu_memory, processType, command, status] = info.split('|');
          const newGpuProcesses = [...state.data.gpu_processes];
          newGpuProcesses[processIndex] = {
            pid: parseInt(pid),
            name,
            gpu_usage: value,
            gpu_memory: parseFloat(gpu_memory),
            type: processType,
            command,
            status,
          };
          
          return {
            data: {
              ...state.data,
              gpu_processes: newGpuProcesses,
            },
          };
        }
      }
      
      // Handle GPU info separately
      if (type === 'gpu_info' && info) {
        const currentGpuInfo = state.data.gpu_info || [];
        const newGpuInfo = [...currentGpuInfo, { info }].slice(-state.maxDataPoints);
        
        return {
          data: {
            ...state.data,
            gpu_info: newGpuInfo,
          },
        };
      }
      
      // Handle top_processes array data (special case - store as array directly)
      if (type === 'top_processes') {
        console.log('[SystemResourceStore] Storing top_processes data:', Array.isArray(value) ? `${value.length} processes` : 'invalid data', value);
        return {
          data: {
            ...state.data,
            top_processes: Array.isArray(value) ? value : [],
          },
        };
      }
      
      // Handle regular data types
      const currentData = (state.data as any)[type] || [];
      const newData = [...currentData, value].slice(-state.maxDataPoints);
      return {
        data: {
          ...state.data,
          [type]: newData,
        },
      };
    });
  },
})); 