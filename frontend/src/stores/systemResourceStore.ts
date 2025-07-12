import { create } from 'zustand';
import type { WidgetType } from './types';

export type SystemResourceData = {
  cpu: number[];
  cpu_temp: number[];
  ram: number[];
  disk_read: number[];
  disk_write: number[];
  net_sent: number[];
  net_recv: number[];
}

interface SystemResourceState {
  data: SystemResourceData;
  setData: (type: WidgetType | 'cpu_temp', value: number) => void;
  maxDataPoints: number;
}

const initialState: SystemResourceData = {
  cpu: [],
  cpu_temp: [],
  ram: [],
  disk_read: [],
  disk_write: [],
  net_sent: [],
  net_recv: [],
};

export const useSystemResourceStore = create<SystemResourceState>((set) => ({
  data: initialState,
  maxDataPoints: 200, // Default max points
  setData: (type, value) => {
    set((state) => {
      const currentData = state.data[type] || [];
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