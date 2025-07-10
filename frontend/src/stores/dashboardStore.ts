import { create } from 'zustand';
import type { Layout } from 'react-grid-layout';
import type { Widget, WidgetType, WidgetConfig } from './types';
import { v4 as uuidv4 } from 'uuid';

interface DashboardState {
  widgets: Widget[];
  layouts: Layout[];
  isInitialized: boolean;
  actions: {
    initialize: () => void;
    addWidget: (type: WidgetType) => void;
    removeWidget: (id: string) => void;
    updateLayout: (layouts: Layout[]) => void;
    updateWidgetConfig: (id: string, config: Partial<WidgetConfig>) => void;
    saveLayouts: () => void;
    resetLayouts: () => void;
  };
}

const defaultLayouts: Layout[] = [
  { i: 'cpu-default', x: 0, y: 0, w: 6, h: 2 },
  { i: 'ram-default', x: 6, y: 0, w: 6, h: 2 },
];

const defaultWidgets: Widget[] = [
  { i: 'cpu-default', type: 'cpu' },
  { i: 'ram-default', type: 'ram' },
];

const LOCAL_STORAGE_KEY = 'dashboard-layouts';

const validWidgetTypes: WidgetType[] = ['cpu', 'ram', 'disk_read', 'disk_write', 'net_sent', 'net_recv'];

export const useDashboardStore = create<DashboardState>((set, get) => ({
  widgets: [],
  layouts: [],
  isInitialized: false,
  actions: {
    initialize: () => {
      const savedLayoutsData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedLayoutsData) {
        try {
          const { widgets: parsedWidgets, layouts: parsedLayouts } = JSON.parse(savedLayoutsData);

          const validWidgets = parsedWidgets.filter((widget: Widget) =>
            validWidgetTypes.includes(widget.type)
          );
          
          const validWidgetIds = new Set(validWidgets.map((w: Widget) => w.i));

          const validLayouts = parsedLayouts.filter((layout: Layout) =>
            validWidgetIds.has(layout.i)
          );

          set({ widgets: validWidgets, layouts: validLayouts, isInitialized: true });
        } catch (error) {
          console.error("Failed to parse or validate dashboard layout from localStorage", error);
          set({ widgets: defaultWidgets, layouts: defaultLayouts, isInitialized: true });
        }
      } else {
        set({ widgets: defaultWidgets, layouts: defaultLayouts, isInitialized: true });
      }
    },
    addWidget: (type) => {
      const newWidget: Widget = {
        i: uuidv4(),
        type,
      };
      const newLayout: Layout = {
        i: newWidget.i,
        x: (get().widgets.length * 6) % 12,
        y: Infinity, // places it at the bottom
        w: 6,
        h: 2,
      };
      set((state) => ({
        widgets: [...state.widgets, newWidget],
        layouts: [...state.layouts, newLayout],
      }));
    },
    removeWidget: (id) => {
      set((state) => ({
        widgets: state.widgets.filter((w) => w.i !== id),
        layouts: state.layouts.filter((l) => l.i !== id),
      }));
    },
    updateLayout: (layouts) => {
      set({ layouts });
    },
    updateWidgetConfig: (id, config) => {
      set((state) => ({
        widgets: state.widgets.map((widget) =>
          widget.i === id 
            ? { ...widget, config: { ...widget.config, ...config } }
            : widget
        )
      }));
      get().actions.saveLayouts();
    },
    saveLayouts: () => {
      const { widgets, layouts } = get();
      const dataToSave = JSON.stringify({ widgets, layouts });
      localStorage.setItem(LOCAL_STORAGE_KEY, dataToSave);
    },
    resetLayouts: () => {
      set({ widgets: defaultWidgets, layouts: defaultLayouts });
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    },
  },
})); 