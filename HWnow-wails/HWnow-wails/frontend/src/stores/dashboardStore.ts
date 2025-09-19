import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Layout } from 'react-grid-layout';
import type { Widget, WidgetType, Page, DashboardState, WidgetState, ResponsiveLayouts, Breakpoint } from './types';
import { getWidgets, saveWidgets, deleteWidget, getPages, createPage, deletePage, updatePageName } from '../services/wailsApiService';
import { wailsMiddleware, WailsStoreState } from './wailsStoreMiddleware';
import {
  generateResponsiveLayouts,
  migrateLegacyLayout,
  mergeResponsiveLayouts,
  getCurrentBreakpoint,
  validateLayout,
  BREAKPOINT_CONFIGS
} from '../utils/layoutUtils';

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

// 위젯 상태 비교를 위한 해시 생성 함수
const generateStateHash = (widgets: Widget[], layouts: Layout[]): string => {
  const stateData = {
    widgets: widgets.map(w => ({ i: w.i, type: w.type, config: w.config })),
    layouts: layouts.map(l => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }))
  };
  return JSON.stringify(stateData);
};

const createNewPage = (name: string): Page => ({
  id: uuidv4(),
  name,
  widgets: [],
  layouts: [],
  responsiveLayouts: {},
});

const defaultPage: Page = {
  id: 'main-page',
  name: 'Main Page',
  widgets: [],
  layouts: [],
  responsiveLayouts: {},
};

// Enhanced Dashboard Store with Wails integration
// 추가 상태 타입 정의
interface ExtendedDashboardState extends DashboardState {
  lastSavedHash: string | null;
  isAutosaving: boolean;
}

export const useDashboardStore = create<ExtendedDashboardState>()(
  wailsMiddleware(
    (set, get) => ({
  pages: [defaultPage],
  activePageIndex: 0,
  isInitialized: false,
  lastSavedHash: null,
  isAutosaving: false,

  actions: {
    initialize: async () => {
      const userId = getUserId();
      console.log('[Dashboard] Initializing dashboard, loading from server...');
      
      try {
        // 페이지 목록 로드
        const pageStates = await getPages(userId);
        console.log('[Dashboard] Loaded pages from server:', pageStates?.length || 0);
        
        if (pageStates && pageStates.length > 0) {
          // 각 페이지의 위젯들을 로드
          const pages: Page[] = [];
          
          for (const pageState of pageStates) {
            const widgetStates = await getWidgets(userId, pageState.pageId);
            console.log(`[Dashboard] Loaded widgets for page ${pageState.pageId}:`, widgetStates.length);
            
            const widgets: Widget[] = [];
            const layouts: Layout[] = [];
            
            widgetStates.forEach(ws => {
              let config = {};
              try {
                config = ws.config ? JSON.parse(ws.config) : {};
              } catch {
                console.error(`Failed to parse config for widget ${ws.widgetId}`);
              }

              const layoutData = ws.layout ? JSON.parse(ws.layout) : {};

              widgets.push({
                i: ws.widgetId,
                type: ws.widgetType,
                config: config,
              });

              // Handle both legacy single layout and new responsive layouts
              if (layoutData.lg || layoutData.md || layoutData.sm || layoutData.xs || layoutData.xxs) {
                // New responsive layout format
                // For legacy compatibility, we'll still populate the layouts array with lg layout
                const lgLayout = layoutData.lg || layoutData.md || layoutData.sm || layoutData.xs || layoutData.xxs || {};
                layouts.push({
                  i: ws.widgetId,
                  x: lgLayout.x ?? 0,
                  y: lgLayout.y ?? 0,
                  w: lgLayout.w ?? 6,
                  h: lgLayout.h ?? 2,
                });
              } else {
                // Legacy single layout format
                layouts.push({
                  i: ws.widgetId,
                  x: layoutData.x ?? 0,
                  y: layoutData.y ?? 0,
                  w: layoutData.w ?? 6,
                  h: layoutData.h ?? 2,
                });
              }
            });
            
            // Generate responsive layouts from the base layout
            const responsiveLayouts = layouts.length > 0 ? migrateLegacyLayout(layouts) : {};

            pages.push({
              id: pageState.pageId,
              name: pageState.pageName,
              widgets,
              layouts, // Keep for legacy compatibility
              responsiveLayouts,
            });
          }
          
          // 초기 상태 해시 계산
          const initialHash = pages.length > 0 ? generateStateHash(pages[0].widgets, pages[0].layouts) : null;
          set({ pages, activePageIndex: 0, isInitialized: true, lastSavedHash: initialHash });
        } else {
          // 페이지가 없으면 기본 페이지 생성
          const initialHash = generateStateHash(defaultPage.widgets, defaultPage.layouts);
          set({ pages: [defaultPage], activePageIndex: 0, isInitialized: true, lastSavedHash: initialHash });
        }
        
      } catch (error) {
        console.error("Failed to initialize dashboard from server", error);
        
        // 서버 데이터 로드 실패 시 기본 페이지로 초기화
        // localStorage 백업은 사용하지 않아 데이터 일관성 보장
        console.warn("Server data unavailable, initializing with default page");
        const fallbackHash = generateStateHash(defaultPage.widgets, defaultPage.layouts);
        set({ pages: [defaultPage], activePageIndex: 0, isInitialized: true, lastSavedHash: fallbackHash });
      }
    },

    addPage: async () => {
      const userId = getUserId();
      const pageId = uuidv4();
      const pageName = `Page ${get().pages.length + 1}`;
      
      try {
        await createPage(userId, pageId, pageName);
        
        // 서버 생성 성공 후 로컬 상태 업데이트
        const newPage = createNewPage(pageName);
        newPage.id = pageId;
        
        set(state => ({
          pages: [...state.pages, newPage],
          activePageIndex: state.pages.length // 새 페이지로 전환
        }));
      } catch (error) {
        console.error('Failed to create page:', error);
      }
    },

    removePage: async (pageId: string) => {
      const userId = getUserId();
      const { pages, activePageIndex } = get();
      
      // 마지막 페이지는 삭제할 수 없음
      if (pages.length <= 1) {
        console.warn('Cannot delete the last page');
        return;
      }
      
      try {
        await deletePage(userId, pageId);
        
        // 서버 삭제 성공 후 로컬 상태 업데이트
        const pageIndex = pages.findIndex(p => p.id === pageId);
        if (pageIndex === -1) return;
        
        const newPages = pages.filter(p => p.id !== pageId);
        let newActiveIndex = activePageIndex;
        
        // 삭제된 페이지가 현재 활성 페이지이거나 그보다 앞에 있으면 인덱스 조정
        if (pageIndex <= activePageIndex && newActiveIndex > 0) {
          newActiveIndex = newActiveIndex - 1;
        }
        
        set({
          pages: newPages,
          activePageIndex: Math.min(newActiveIndex, newPages.length - 1)
        });
      } catch (error) {
        console.error('Failed to delete page:', error);
      }
    },

    setActivePageIndex: (index) => {
      set({ activePageIndex: index });
      // 페이지 전환은 상태 저장할 필요 없음
    },
    
    updatePageName: async (pageId: string, name: string) => {
      const userId = getUserId();
      
      try {
        await updatePageName(userId, pageId, name);
        
        // 서버 업데이트 성공 후 로컬 상태 업데이트
        set(state => ({
          pages: state.pages.map(page => 
            page.id === pageId ? { ...page, name } : page
          )
        }));
      } catch (error) {
        console.error('Failed to update page name:', error);
      }
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
        const currentLayouts = [...activePage.layouts, newLayout];
        const newResponsiveLayouts = generateResponsiveLayouts(currentLayouts, 'lg');

        const updatedPage = {
          ...activePage,
          widgets: [...activePage.widgets, newWidget],
          layouts: currentLayouts,
          responsiveLayouts: mergeResponsiveLayouts(activePage.responsiveLayouts || {}, newResponsiveLayouts),
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });
      get().actions.saveState();
    },

    removeWidget: async (widgetId) => {
      const userId = getUserId();
      const { pages, activePageIndex } = get();
      const activePage = pages[activePageIndex];
      
      // Optimistic update
      const originalPages = pages;
      
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
        await deleteWidget(userId, widgetId, activePage.id);
        console.log(`Widget ${widgetId} deleted successfully from database`);
        
        // 삭제는 데이터베이스에서 직접 처리되므로 추가 상태 저장 불필요
        // saveStateImmediate() 호출 제거하여 삭제된 위젯이 다시 추가되는 것을 방지
        
      } catch (error) {
        console.error(`Failed to delete widget ${widgetId} on server`, error);
        // Rollback on error
        set({ pages: originalPages });
        throw error; // Re-throw to handle in UI if needed
      }
    },

    updateLayout: async (layouts) => {
      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = { ...activePage, layouts };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });

      // 레이아웃 변경은 즉시 서버에 반영
      try {
        await get().actions.saveStateImmediate();
      } catch (error) {
        console.error('Failed to save layout change immediately:', error);
        // 실패 시 디바운스된 저장을 백업으로 사용
        get().actions.saveState();
      }
    },

    updateResponsiveLayouts: async (responsiveLayouts: ResponsiveLayouts) => {
      set((state) => {
        const activePage = state.pages[state.activePageIndex];

        // Update both legacy layouts (for compatibility) and responsive layouts
        const currentBreakpoint = getCurrentBreakpoint();
        const currentLayout = responsiveLayouts[currentBreakpoint] || activePage.layouts;

        const updatedPage = {
          ...activePage,
          layouts: currentLayout,
          responsiveLayouts: mergeResponsiveLayouts(activePage.responsiveLayouts || {}, responsiveLayouts)
        };

        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });

      // 반응형 레이아웃 변경은 즉시 서버에 반영
      try {
        await get().actions.saveStateImmediate();
      } catch (error) {
        console.error('Failed to save responsive layout change immediately:', error);
        // 실패 시 디바운스된 저장을 백업으로 사용
        get().actions.saveState();
      }
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

    saveStateImmediate: async () => {
      const userId = getUserId();
      const { pages, activePageIndex } = get();
      const activePage = pages[activePageIndex];

      const widgetStates: WidgetState[] = activePage.widgets.map(widget => {
        const layout = activePage.layouts.find(l => l.i === widget.i);
        const responsiveLayouts = activePage.responsiveLayouts || {};

        // Create responsive layout data for this widget
        const widgetResponsiveLayout: any = {};
        Object.entries(responsiveLayouts).forEach(([breakpoint, layouts]) => {
          const breakpointLayout = layouts?.find(l => l.i === widget.i);
          if (breakpointLayout) {
            widgetResponsiveLayout[breakpoint] = {
              x: breakpointLayout.x,
              y: breakpointLayout.y,
              w: breakpointLayout.w,
              h: breakpointLayout.h,
            };
          }
        });

        // If no responsive layouts exist, fall back to legacy format
        const layoutData = Object.keys(widgetResponsiveLayout).length > 0
          ? widgetResponsiveLayout
          : {
              x: layout?.x ?? 0,
              y: layout?.y ?? 0,
              w: layout?.w ?? 6,
              h: layout?.h ?? 2,
            };

        return {
          userId,
          pageId: activePage.id,
          widgetId: widget.i,
          widgetType: widget.type,
          config: JSON.stringify(widget.config || {}),
          layout: JSON.stringify(layoutData),
        };
      });
      
      try {
        await saveWidgets(widgetStates);
        console.log("[Dashboard] State saved to server successfully");
        
        // 저장 성공 시 해시 업데이트
        const currentHash = generateStateHash(activePage.widgets, activePage.layouts);
        set({ lastSavedHash: currentHash });
        
        // localStorage 백업 제거 - 서버 데이터만 신뢰하여 일관성 보장
        
      } catch (err) {
        console.error("[Dashboard] Failed to save state to server:", err);
        throw err;
      }
    },

    saveState: debounce(() => {
      const { pages, activePageIndex, lastSavedHash, isAutosaving } = get();
      const activePage = pages[activePageIndex];
      const userId = getUserId();

      // 현재 상태 해시 계산
      const currentHash = generateStateHash(activePage.widgets, activePage.layouts);
      
      // 상태가 변경되지 않았으면 저장하지 않음
      if (currentHash === lastSavedHash) {
        console.log("[Dashboard] saveState: No changes detected, skipping save");
        return;
      }
      
      // 이미 자동 저장 중이면 건너뛰기
      if (isAutosaving) {
        console.log("[Dashboard] saveState: Already autosaving, skipping duplicate save");
        return;
      }
      
      console.log("[Dashboard] saveState: State changed, proceeding with save", {
        widgetCount: activePage.widgets.length,
        previousHash: lastSavedHash?.substring(0, 8),
        currentHash: currentHash.substring(0, 8)
      });

      set({ isAutosaving: true });

      const widgetStates: WidgetState[] = activePage.widgets.map(widget => {
        const layout = activePage.layouts.find(l => l.i === widget.i);
        const responsiveLayouts = activePage.responsiveLayouts || {};

        // Create responsive layout data for this widget
        const widgetResponsiveLayout: any = {};
        Object.entries(responsiveLayouts).forEach(([breakpoint, layouts]) => {
          const breakpointLayout = layouts?.find(l => l.i === widget.i);
          if (breakpointLayout) {
            widgetResponsiveLayout[breakpoint] = {
              x: breakpointLayout.x,
              y: breakpointLayout.y,
              w: breakpointLayout.w,
              h: breakpointLayout.h,
            };
          }
        });

        // If no responsive layouts exist, fall back to legacy format
        const layoutData = Object.keys(widgetResponsiveLayout).length > 0
          ? widgetResponsiveLayout
          : {
              x: layout?.x ?? 0,
              y: layout?.y ?? 0,
              w: layout?.w ?? 6,
              h: layout?.h ?? 2,
            };

        return {
          userId,
          pageId: activePage.id,
          widgetId: widget.i,
          widgetType: widget.type,
          config: JSON.stringify(widget.config || {}),
          layout: JSON.stringify(layoutData),
        };
      });
      
      saveWidgets(widgetStates)
        .then(() => {
          console.log("[Dashboard] saveState: Successfully saved state to server");
          set({ lastSavedHash: currentHash, isAutosaving: false });
        })
        .catch(err => {
          console.error("[Dashboard] Failed to save state to server:", err);
          set({ isAutosaving: false });
          // localStorage 폴백 제거 - 서버 저장 실패 시 에러로 처리
        });
    }, 1500), // 1.5초 디바운스

    resetState: () => {
      // 서버의 데이터도 삭제하는 로직이 필요할 수 있지만, 여기서는 프론트엔드 초기화만 진행
      set({ 
        pages: [defaultPage], 
        activePageIndex: 0, 
        isInitialized: false,
        lastSavedHash: null,
        isAutosaving: false
      });
      get().actions.initialize();
    },
  },
}),
{
  enableOfflineSupport: true,
  autoSaveInterval: 2000,
  performanceMonitoring: true,
  maxRetries: 3,
  storeName: 'dashboard'
}
)); 