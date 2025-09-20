import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Layout } from 'react-grid-layout';
import type { Widget, WidgetType, Page, DashboardState, WidgetState, ResponsiveLayouts, Breakpoint } from './types';
import { getWidgets, saveWidgets, deleteWidget, getPages, createPage, deletePage, updatePageName } from '../services/wailsApiService';
import { wailsMiddleware, WailsStoreState } from './wailsStoreMiddleware';
import {
  getCurrentBreakpoint
} from '../utils/layoutUtils';
import { getOptimalWidgetSize } from '../utils/widgetSizeDefinitions';

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

              // Get widget-type-specific default size instead of hardcoded 6×2
              const [defaultWidth, defaultHeight] = getOptimalWidgetSize(ws.widgetType, 'lg');

              // Get minimum constraints for validation
              const constraints = WIDGET_SIZE_CONSTRAINTS[ws.widgetType];
              const [minWidth, minHeight] = constraints?.min || [defaultWidth, defaultHeight];

              console.log(`[Initialize] Processing widget from DB:`, {
                widgetId: ws.widgetId,
                type: ws.widgetType,
                expectedDefault: `${defaultWidth}×${defaultHeight}`,
                minConstraints: `${minWidth}×${minHeight}`,
                rawLayoutData: Object.keys(layoutData).length > 0 ? layoutData : 'empty'
              });

              // Handle both legacy single layout and new responsive layouts
              if (layoutData.lg || layoutData.md || layoutData.sm || layoutData.xs || layoutData.xxs) {
                // New responsive layout format
                // For legacy compatibility, we'll still populate the layouts array with lg layout
                const lgLayout = layoutData.lg || layoutData.md || layoutData.sm || layoutData.xs || layoutData.xxs || {};

                // Apply size with validation
                const width = Math.max(minWidth, lgLayout.w ?? defaultWidth);
                const height = Math.max(minHeight, lgLayout.h ?? defaultHeight);

                layouts.push({
                  i: ws.widgetId,
                  x: lgLayout.x ?? 0,
                  y: lgLayout.y ?? 0,
                  w: width,
                  h: height,
                });

                console.log(`[Initialize] Loaded responsive ${ws.widgetType} widget:`, {
                  widgetId: ws.widgetId,
                  dbSize: lgLayout.w && lgLayout.h ? `${lgLayout.w}×${lgLayout.h}` : 'missing',
                  finalSize: `${width}×${height}`,
                  usedDefault: !lgLayout.w || !lgLayout.h,
                  corrected: width !== (lgLayout.w ?? defaultWidth) || height !== (lgLayout.h ?? defaultHeight)
                });
              } else {
                // Legacy single layout format - use widget-specific defaults with validation
                const width = Math.max(minWidth, layoutData.w ?? defaultWidth);
                const height = Math.max(minHeight, layoutData.h ?? defaultHeight);

                layouts.push({
                  i: ws.widgetId,
                  x: layoutData.x ?? 0,
                  y: layoutData.y ?? 0,
                  w: width,
                  h: height,
                });

                console.log(`[Initialize] Loaded legacy ${ws.widgetType} widget:`, {
                  widgetId: ws.widgetId,
                  dbSize: layoutData.w && layoutData.h ? `${layoutData.w}×${layoutData.h}` : 'missing',
                  finalSize: `${width}×${height}`,
                  usedDefault: !layoutData.w || !layoutData.h,
                  corrected: width !== (layoutData.w ?? defaultWidth) || height !== (layoutData.h ?? defaultHeight)
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

    updatePage: (pageId: string, updatedPage: Page) => {
      set(state => ({
        pages: state.pages.map(page =>
          page.id === pageId ? updatedPage : page
        )
      }));
    },

    addWidget: (type: WidgetType) => {
      const activePage = get().pages[get().activePageIndex];
      const newWidget: Widget = {
        i: uuidv4(),
        type,
        config: {},
      };

      console.log(`[AddWidget] Adding widget: ${type}, ID: ${newWidget.i}`);

      set((state) => {
        const updatedPage = {
          ...activePage,
          widgets: [...activePage.widgets, newWidget],
          // Remove layout persistence - layouts will be generated dynamically
          layouts: [],
          responsiveLayouts: {},
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;

        console.log(`[AddWidget] Widget added: ${type}, total widgets: ${updatedPage.widgets.length}`);

        return { pages: newPages };
      });

      // Save only widget data, not layouts
      get().actions.saveState();
    },

    removeWidget: async (widgetId) => {
      const userId = getUserId();
      const { pages, activePageIndex } = get();
      const activePage = pages[activePageIndex];

      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = {
          ...activePage,
          widgets: activePage.widgets.filter((w) => w.i !== widgetId),
          // Remove layout persistence
          layouts: [],
          responsiveLayouts: {},
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });

      try {
        await deleteWidget(userId, widgetId, activePage.id);
        console.log(`Widget ${widgetId} deleted successfully`);
      } catch (error) {
        console.error(`Failed to delete widget ${widgetId}:`, error);
        throw error;
      }
    },

    updateLayout: async (layouts) => {
      // Layout updates are no longer persisted - using dynamic sizing only
      console.log('[Store] Layout update ignored - using dynamic sizing only');
    },

    updateResponsiveLayouts: async (responsiveLayouts: ResponsiveLayouts) => {
      // Layout updates are no longer persisted - using dynamic sizing only
      console.log('[Store] Layout update ignored - using dynamic sizing only');
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

        // If no responsive layouts exist, fall back to widget-type-specific sizes (CRITICAL FIX)
        const [defaultWidth, defaultHeight] = getOptimalWidgetSize(widget.type, 'lg');
        const layoutData = Object.keys(widgetResponsiveLayout).length > 0
          ? widgetResponsiveLayout
          : {
              x: layout?.x ?? 0,
              y: layout?.y ?? 0,
              w: layout?.w ?? defaultWidth,  // Widget-specific width instead of hardcoded 6
              h: layout?.h ?? defaultHeight, // Widget-specific height instead of hardcoded 2
            };

        console.log(`[SaveStateImmediate] Widget ${widget.i} (${widget.type}): using ${Object.keys(widgetResponsiveLayout).length > 0 ? 'responsive' : 'fallback'} layout, size: ${layoutData.w || defaultWidth}×${layoutData.h || defaultHeight}`);

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

        // If no responsive layouts exist, fall back to widget-type-specific sizes (CRITICAL FIX)
        const [defaultWidth, defaultHeight] = getOptimalWidgetSize(widget.type, 'lg');
        const layoutData = Object.keys(widgetResponsiveLayout).length > 0
          ? widgetResponsiveLayout
          : {
              x: layout?.x ?? 0,
              y: layout?.y ?? 0,
              w: layout?.w ?? defaultWidth,  // Widget-specific width instead of hardcoded 6
              h: layout?.h ?? defaultHeight, // Widget-specific height instead of hardcoded 2
            };

        console.log(`[SaveState] Widget ${widget.i} (${widget.type}): using ${Object.keys(widgetResponsiveLayout).length > 0 ? 'responsive' : 'fallback'} layout, size: ${layoutData.w || defaultWidth}×${layoutData.h || defaultHeight}`);

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