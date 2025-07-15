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
  disk_total: number[];
  disk_used: number[];
  disk_free: number[];
  disk_usage_percent: number[];
  memory_physical: number[];
  memory_virtual: number[];
  memory_swap: number[];
  battery_percent: number[];
  battery_plugged: number[];
  
  // 네트워크 상태 (인터페이스별)
  network_interfaces: { [key: string]: { status: number[]; ip: string } };
  
  // 프로세스 정보 (최신 상태만 저장)
  processes: Array<{
    name: string;
    pid: number;
    cpu: number;
    memory: number;
  }>;
}

interface SystemResourceState {
  data: SystemResourceData;
  setData: (type: WidgetType | string, value: number, info?: string) => void;
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
  disk_total: [],
  disk_used: [],
  disk_free: [],
  disk_usage_percent: [],
  memory_physical: [],
  memory_virtual: [],
  memory_swap: [],
  battery_percent: [],
  battery_plugged: [],
  
  // 네트워크 상태
  network_interfaces: {},
  
  // 프로세스 정보
  processes: [],
};

export const useSystemResourceStore = create<SystemResourceState>((set) => ({
  data: initialState,
  maxDataPoints: 200, // Default max points
  setData: (type, value, info) => {
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