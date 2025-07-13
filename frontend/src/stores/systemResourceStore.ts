import { create } from 'zustand';
import type { WidgetType } from './types';

export type SystemResourceData = {
  cpu: number[];
  cpu_temp: number[];
  cpu_cores: { [key: string]: number[] }; // cpu_core_1, cpu_core_2, etc.
  cpu_info: { model: string; cores: number } | null; // CPU 정보
  ram: number[];
  disk_read: number[];
  disk_write: number[];
  net_sent: number[];
  net_recv: number[];
}

interface SystemResourceState {
  data: SystemResourceData;
  setData: (type: WidgetType | 'cpu_temp' | string, value: number, info?: string) => void;
  maxDataPoints: number;
}

const initialState: SystemResourceData = {
  cpu: [],
  cpu_temp: [],
  cpu_cores: {},
  cpu_info: null,
  ram: [],
  disk_read: [],
  disk_write: [],
  net_sent: [],
  net_recv: [],
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