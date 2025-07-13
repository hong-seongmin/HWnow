import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Layout } from 'react-grid-layout';
import type { Widget, WidgetType, Page, DashboardState, WidgetState } from './types';
import { getWidgets, saveWidgets, deleteWidget } from '../services/apiService';

// Debounce 유틸리티 함수
function debounce<T extends (...args: any[]) => void>(func: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

const getUserId = (): string => {
  // 모든 브라우저에서 동일한 사용자 ID 사용 (공통 대시보드)
  return 'global-user';
};

const createNewPage = (name: string): Page => ({
  id: uuidv4(),
  name,
  widgets: [],
  layouts: [],
});

const defaultPage = createNewPage('Main Page');

export const useDashboardStore = create<DashboardState>((set, get) => ({
  pages: [defaultPage],
  activePageIndex: 0,
  isInitialized: false,

  actions: {
    initialize: async () => {
      const userId = getUserId();
      try {
        const widgetStates = await getWidgets(userId);
        if (widgetStates && widgetStates.length > 0) {
          // 서버 데이터를 프론트엔드 구조로 변환
          const widgets: Widget[] = [];
          const layouts: Layout[] = [];
          
          widgetStates.forEach(ws => {
            let config = {};
            try {
              config = ws.config ? JSON.parse(ws.config) : {};
            } catch {
              console.error(`Failed to parse config for widget ${ws.widgetId}`);
            }
            
            const layout = ws.layout ? JSON.parse(ws.layout) : {};

            widgets.push({
              i: ws.widgetId,
              type: ws.widgetType,
              config: config,
            });

            layouts.push({
              i: ws.widgetId,
              x: layout.x ?? 0,
              y: layout.y ?? 0,
              w: layout.w ?? 6,
              h: layout.h ?? 2,
            });
          });
          
          const page = { ...defaultPage, widgets, layouts };
          set({ pages: [page], activePageIndex: 0, isInitialized: true });

        } else {
          set({ pages: [defaultPage], activePageIndex: 0, isInitialized: true });
        }
      } catch (error) {
        console.error("Failed to initialize dashboard from server", error);
        
        // 서버에서 로드 실패시 localStorage 백업 확인
        try {
          const backup = localStorage.getItem('hwnow_dashboard_backup');
          if (backup) {
            const savedState = JSON.parse(backup);
            console.log("Loaded state from localStorage backup");
            set({ 
              pages: savedState.pages || [defaultPage], 
              activePageIndex: savedState.activePageIndex || 0, 
              isInitialized: true 
            });
            return;
          }
        } catch (localErr) {
          console.error("Failed to load from localStorage:", localErr);
        }
        
        set({ pages: [defaultPage], activePageIndex: 0, isInitialized: true });
      }
    },

    addPage: () => {
      // 현재 서버 저장은 단일 페이지만 지원
      console.warn("Adding new pages is not supported with server-side storage yet.");
    },

    removePage: (_pageId) => {
      console.warn("Removing pages is not supported with server-side storage yet.");
    },

    setActivePageIndex: (index) => {
      set({ activePageIndex: index });
      // 페이지 전환은 상태 저장할 필요 없음
    },
    
    updatePageName: (pageId, name) => {
      set(state => ({
        pages: state.pages.map(page => 
          page.id === pageId ? { ...page, name } : page
        )
      }));
      get().actions.saveState();
    },

    addWidget: (type: WidgetType) => {
      const activePage = get().pages[get().activePageIndex];
      const newWidget: Widget = {
        i: uuidv4(),
        type,
        config: {},
      };
      
      // 빈 공간 찾기 함수
      const findEmptyPosition = () => {
        const widgetWidth = 4; // 가로 크기를 6에서 4로 줄임
        const widgetHeight = 3; // 세로 크기를 2에서 3으로 늘림
        const gridWidth = 12;
        
        // 기존 위젯들의 위치 정보 수집
        const occupiedPositions = new Set<string>();
        activePage.layouts.forEach(layout => {
          for (let x = layout.x; x < layout.x + layout.w; x++) {
            for (let y = layout.y; y < layout.y + layout.h; y++) {
              occupiedPositions.add(`${x},${y}`);
            }
          }
        });
        
        // 빈 공간 찾기 (위에서 아래로, 왼쪽에서 오른쪽으로)
        for (let y = 0; y < 20; y++) { // 최대 20행까지 검색
          for (let x = 0; x <= gridWidth - widgetWidth; x++) {
            let canPlace = true;
            
            // 해당 위치에 위젯을 배치할 수 있는지 확인
            for (let dx = 0; dx < widgetWidth && canPlace; dx++) {
              for (let dy = 0; dy < widgetHeight && canPlace; dy++) {
                if (occupiedPositions.has(`${x + dx},${y + dy}`)) {
                  canPlace = false;
                }
              }
            }
            
            if (canPlace) {
              return { x, y, w: widgetWidth, h: widgetHeight };
            }
          }
        }
        
        // 빈 공간을 찾지 못한 경우 맨 아래에 배치
        return { x: 0, y: Infinity, w: widgetWidth, h: widgetHeight };
      };
      
      const position = findEmptyPosition();
      const newLayout: Layout = {
        i: newWidget.i,
        ...position,
      };

      set((state) => {
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

    removeWidget: async (widgetId) => {
      const userId = getUserId();
      // Optimistic update
      const originalPages = get().pages;
      
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
      
      try {
        await deleteWidget(userId, widgetId);
        // No need to call saveState, as the deletion is final
      } catch (error) {
        console.error(`Failed to delete widget ${widgetId} on server`, error);
        // Rollback on error
        set({ pages: originalPages });
      }
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
              ? { ...widget, config: { ...(widget.config || {}), ...config } }
              : widget
          ),
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });
      get().actions.saveState();
    },

    saveState: debounce(() => {
      const userId = getUserId();
      const { pages, activePageIndex } = get();
      const activePage = pages[activePageIndex];

      const widgetStates: WidgetState[] = activePage.widgets.map(widget => {
        const layout = activePage.layouts.find(l => l.i === widget.i);
        return {
          userId,
          widgetId: widget.i,
          widgetType: widget.type,
          config: JSON.stringify(widget.config || {}),
          layout: JSON.stringify({
            x: layout?.x ?? 0,
            y: layout?.y ?? 0,
            w: layout?.w ?? 6,
            h: layout?.h ?? 2,
          }),
        };
      });
      
      saveWidgets(widgetStates).catch(err => {
        console.error("Failed to save state to server:", err);
        // 서버 저장 실패시 localStorage에 폴백
        try {
          localStorage.setItem('hwnow_dashboard_backup', JSON.stringify({
            pages: get().pages,
            activePageIndex: get().activePageIndex
          }));
          console.log("State saved to localStorage as fallback");
        } catch (localErr) {
          console.error("Failed to save to localStorage:", localErr);
        }
      });
    }, 1500), // 1.5초 디바운스

    resetState: () => {
      // 서버의 데이터도 삭제하는 로직이 필요할 수 있지만, 여기서는 프론트엔드 초기화만 진행
      set({ pages: [defaultPage], activePageIndex: 0, isInitialized: false });
      get().actions.initialize();
    },
  },
})); 