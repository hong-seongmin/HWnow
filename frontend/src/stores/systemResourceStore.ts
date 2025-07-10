import { create } from 'zustand';
import type { WidgetType } from './types';

interface SystemResourceState {
  data: Record<WidgetType, number[]>;
  actions: {
    setData: (type: WidgetType, value: number) => void;
  };
}

const MAX_DATA_POINTS = 30; // 2초 간격으로 1분치 데이터

export const useSystemResourceStore = create<SystemResourceState>((set) => ({
  data: {
    cpu: [],
    ram: [],
    disk_read: [],
    disk_write: [],
    net_sent: [],
    net_recv: [],
  },
  actions: {
    setData: (type, value) =>
      set((state) => {
        const newData = [...(state.data[type] || []), value];
        if (newData.length > MAX_DATA_POINTS) {
          newData.shift();
        }
        return {
          data: {
            ...state.data,
            [type]: newData,
          },
        };
      }),
  },
})); 