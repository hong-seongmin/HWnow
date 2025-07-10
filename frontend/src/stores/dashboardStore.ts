import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Layout } from 'react-grid-layout';
import type { Widget, WidgetType, WidgetConfig, Page, DashboardState } from './types';

const LOCAL_STORAGE_KEY = 'dashboard-state';

const createNewPage = (name: string): Page => ({
  id: uuidv4(),
  name,
  widgets: [],
  layouts: [],
});

const defaultPage = createNewPage('Main Page');

const initialState = {
  pages: [defaultPage],
  activePageIndex: 0,
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  pages: [defaultPage],
  activePageIndex: 0,
  isInitialized: false,

  actions: {
    initialize: () => {
      const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedState) {
        try {
          const { pages, activePageIndex } = JSON.parse(savedState);
          if (Array.isArray(pages) && pages.length > 0) {
            set({ pages, activePageIndex, isInitialized: true });
          } else {
            set({ ...initialState, isInitialized: true });
          }
        } catch (error) {
          console.error("Failed to parse dashboard state from localStorage", error);
          set({ ...initialState, isInitialized: true });
        }
      } else {
        set({ ...initialState, isInitialized: true });
      }
    },

    addPage: () => {
      const newPage = createNewPage(`Page ${get().pages.length + 1}`);
      set((state) => ({
        pages: [...state.pages, newPage],
        activePageIndex: state.pages.length, // 새로운 페이지로 전환
      }));
      get().actions.saveState();
    },

    removePage: (pageId) => {
      if (get().pages.length <= 1) {
        console.warn("Cannot remove the last page.");
        return;
      }
      set((state) => {
        const newPages = state.pages.filter((page) => page.id !== pageId);
        const newActiveIndex = Math.max(0, state.activePageIndex - 1);
        return { pages: newPages, activePageIndex: newActiveIndex };
      });
      get().actions.saveState();
    },

    setActivePageIndex: (index) => {
      set({ activePageIndex: index });
      get().actions.saveState();
    },
    
    updatePageName: (pageId, name) => {
      set(state => ({
        pages: state.pages.map(page => 
          page.id === pageId ? { ...page, name } : page
        )
      }));
      get().actions.saveState();
    },

    addWidget: (type) => {
      const newWidget: Widget = { i: uuidv4(), type };
      const newLayout: Layout = {
        i: newWidget.i,
        x: (get().pages[get().activePageIndex].widgets.length * 6) % 12,
        y: Infinity,
        w: 6,
        h: 2,
      };

      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = {
          ...activePage,
          widgets: [...activePage.widgets, newWidget],
          layouts: [...activePage.layouts, newLayout],
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });
      get().actions.saveState();
    },

    removeWidget: (widgetId) => {
      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = {
          ...activePage,
          widgets: activePage.widgets.filter((w) => w.i !== widgetId),
          layouts: activePage.layouts.filter((l) => l.i !== widgetId),
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });
      get().actions.saveState();
    },

    updateLayout: (layouts) => {
      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = { ...activePage, layouts };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });
      get().actions.saveState();
    },
    
    updateWidgetConfig: (widgetId, config) => {
      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = {
          ...activePage,
          widgets: activePage.widgets.map((widget) =>
            widget.i === widgetId
              ? { ...widget, config: { ...widget.config, ...config } }
              : widget
          ),
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });
      get().actions.saveState();
    },

    saveState: () => {
      const { pages, activePageIndex } = get();
      const stateToSave = JSON.stringify({ pages, activePageIndex });
      localStorage.setItem(LOCAL_STORAGE_KEY, stateToSave);
    },

    resetState: () => {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      set({ ...initialState });
    },
  },
})); 