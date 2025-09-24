import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Layout } from 'react-grid-layout';
import type { Widget, WidgetType, Page, DashboardState, WidgetState, ResponsiveLayouts, Breakpoint } from './types';
import { getWidgets, saveWidgets, deleteWidget, getPages, createPage, deletePage, updatePageName } from '../services/wailsApiService';
import { wailsMiddleware, WailsStoreState } from './wailsStoreMiddleware';
import {
  getCurrentBreakpoint,
  migrateLegacyLayout
} from '../utils/layoutUtils';
import { getOptimalWidgetSize, WIDGET_SIZE_CONSTRAINTS } from '../utils/widgetSizeDefinitions';
import { widgetLoadingLog, widgetOperationsLog } from '../utils/debugConfig';

// Debounce ?�틸리티 ?�수
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
  // 모든 브라?��??�서 ?�일???�용??ID ?�용 (공통 ?�?�보??
  return 'global-user';
};

// ?�젯 ?�태 비교�??�한 ?�시 ?�성 ?�수
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
// 추�? ?�태 ?�???�의
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
      widgetLoadingLog('[WIDGET_INIT] Dashboard: ?? Starting dashboard initialization for user:', userId);

      try {
        // ?�이지 목록 로드
        const pageStates = await getPages(userId);
        widgetLoadingLog('[WIDGET_INIT] Dashboard: ?�� Loaded pages from server:', pageStates?.length || 0);
        
        if (pageStates && pageStates.length > 0) {
          // �??�이지???�젯?�을 로드
          const pages: Page[] = [];
          
          for (const pageState of pageStates) {
            widgetLoadingLog(`[WIDGET_INIT] Dashboard: ?�� Loading widgets for page ${pageState.pageId}...`);
            const widgetStates = await getWidgets(userId, pageState.pageId);
            widgetLoadingLog(`[WIDGET_INIT] Dashboard: ??Loaded ${widgetStates.length} widgets for page ${pageState.pageId}`);
            
            const widgets: Widget[] = [];
            const layouts: Layout[] = [];
            
            widgetStates.forEach(ws => {
              let config: Record<string, any> = {};
              if (ws.config) {
                if (typeof ws.config === 'string') {
                  try {
                    config = ws.config ? JSON.parse(ws.config) : {};
                  } catch (error) {
                    widgetLoadingLog(`[WIDGET_INIT] Dashboard: ??Failed to parse config for widget ${ws.widgetId}`, error);
                    config = {};
                  }
                } else if (typeof ws.config === 'object') {
                  config = ws.config as Record<string, any>;
                }
              }

              let layoutData: Record<string, any> = {};
              if (ws.layout) {
                if (typeof ws.layout === 'string') {
                  try {
                    layoutData = ws.layout ? JSON.parse(ws.layout) : {};
                  } catch (error) {
                    widgetLoadingLog(`[WIDGET_INIT] Dashboard: ??Failed to parse layout for widget ${ws.widgetId}`, error);
                    layoutData = {};
                  }
                } else if (typeof ws.layout === 'object') {
                  layoutData = ws.layout as Record<string, any>;
                }
              }

              widgetLoadingLog(`[WIDGET_INIT] Dashboard: ?�️ Processing widget ${ws.widgetId} from database:`, {
                type: ws.widgetType,
                hasConfig: !!ws.config,
                hasLayout: !!ws.layout,
                layoutDataKeys: Object.keys(layoutData),
                layoutDataPreview: JSON.stringify(layoutData).substring(0, 100) + (JSON.stringify(layoutData).length > 100 ? '...' : '')
              });

              widgets.push({
                i: ws.widgetId,
                type: ws.widgetType,
                config: config,
                position: layoutData  // Store position data directly in widget
              });

              widgetLoadingLog(`[WIDGET_INIT] Dashboard: ??Widget ${ws.widgetId} added to widgets array with position:`, {
                hasPosition: !!layoutData && Object.keys(layoutData).length > 0,
                positionBreakpoints: Object.keys(layoutData)
              });

              // Get widget-type-specific default size instead of hardcoded 6×2
              const [defaultWidth, defaultHeight] = getOptimalWidgetSize(ws.widgetType, 'lg');

              // Get minimum constraints for validation
              const constraints = WIDGET_SIZE_CONSTRAINTS[ws.widgetType];
              const [minWidth, minHeight] = constraints?.min || [defaultWidth, defaultHeight];

              widgetLoadingLog(`[WIDGET_INIT] Dashboard: ?�� Processing widget from DB:`, {
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

                widgetLoadingLog(`[WIDGET_INIT] Dashboard: ??Loaded responsive ${ws.widgetType} widget:`, {
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

                widgetLoadingLog(`[WIDGET_INIT] Dashboard: ??Loaded legacy ${ws.widgetType} widget:`, {
                  widgetId: ws.widgetId,
                  dbSize: layoutData.w && layoutData.h ? `${layoutData.w}×${layoutData.h}` : 'missing',
                  finalSize: `${width}×${height}`,
                  usedDefault: !layoutData.w || !layoutData.h,
                  corrected: width !== (layoutData.w ?? defaultWidth) || height !== (layoutData.h ?? defaultHeight)
                });
              }
            });

            widgetLoadingLog(`[WIDGET_INIT] Dashboard: ?�� Page processing completed:`, {
              pageId: pageState.pageId,
              pageName: pageState.pageName,
              totalWidgets: widgets.length,
              totalLayouts: layouts.length,
              widgetSummary: widgets.map(w => ({ id: w.i, type: w.type, hasPosition: !!w.position }))
            });

            // Generate responsive layouts from the base layout
            const responsiveLayouts = layouts.length > 0 ? migrateLegacyLayout(layouts) : {};

            const pageToAdd = {
              id: pageState.pageId,
              name: pageState.pageName,
              widgets,
              layouts, // Keep for legacy compatibility
              responsiveLayouts,
            };

            widgetLoadingLog(`[WIDGET_INIT] Dashboard: ?�� Adding page to pages array:`, {
              pageId: pageToAdd.id,
              widgetCount: pageToAdd.widgets.length,
              layoutCount: pageToAdd.layouts.length
            });

            pages.push(pageToAdd);
          }
          
          // 초기 ?�태 ?�시 계산
          const initialHash = pages.length > 0 ? generateStateHash(pages[0].widgets, pages[0].layouts) : null;
          widgetLoadingLog(`[WIDGET_INIT] Dashboard: ??Dashboard initialization completed successfully with ${pages.length} pages`);
          widgetLoadingLog(`[WIDGET_INIT] Dashboard: Setting store state with ${pages[0]?.widgets?.length || 0} widgets in active page`);

          // Final state before setting
          widgetLoadingLog(`[WIDGET_INIT] Dashboard: ?�� Final state before store update:`, {
            pagesCount: pages.length,
            firstPageWidgets: pages[0]?.widgets?.length || 0,
            firstPageLayouts: pages[0]?.layouts?.length || 0,
            activePageIndex: 0,
            isInitialized: true,
            allPagesWithWidgets: pages.map(p => ({ id: p.id, widgetCount: p.widgets.length }))
          });

          set({ pages, activePageIndex: 0, isInitialized: true, lastSavedHash: initialHash });

          widgetLoadingLog(`[WIDGET_INIT] Dashboard: ?�� Store state updated successfully`);
        } else {
          // ?�이지가 ?�으�?기본 ?�이지 ?�성
          widgetLoadingLog('[WIDGET_INIT] Dashboard: ?�� No pages found, creating default page');
          const initialHash = generateStateHash(defaultPage.widgets, defaultPage.layouts);
          set({ pages: [defaultPage], activePageIndex: 0, isInitialized: true, lastSavedHash: initialHash });
        }
        
      } catch (error) {
        widgetLoadingLog("[WIDGET_INIT] Dashboard: ??Failed to initialize dashboard from server", error);

        // ?�버 ?�이??로드 ?�패 ??기본 ?�이지�?초기??
        // localStorage 백업?� ?�용?��? ?�아 ?�이???��???보장
        widgetLoadingLog("[WIDGET_INIT] Dashboard: ?�️ Server data unavailable, initializing with default page");
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
        
        // ?�버 ?�성 ?�공 ??로컬 ?�태 ?�데?�트
        const newPage = createNewPage(pageName);
        newPage.id = pageId;
        
        set(state => ({
          pages: [...state.pages, newPage],
          activePageIndex: state.pages.length // ???�이지�??�환
        }));
      } catch (error) {
        console.error('Failed to create page:', error);
      }
    },

    removePage: async (pageId: string) => {
      const userId = getUserId();
      const { pages, activePageIndex } = get();
      
      // 마�?�??�이지????��?????�음
      if (pages.length <= 1) {
        console.warn('Cannot delete the last page');
        return;
      }
      
      try {
        await deletePage(userId, pageId);
        
        // ?�버 ??�� ?�공 ??로컬 ?�태 ?�데?�트
        const pageIndex = pages.findIndex(p => p.id === pageId);
        if (pageIndex === -1) return;
        
        const newPages = pages.filter(p => p.id !== pageId);
        let newActiveIndex = activePageIndex;
        
        // ??��???�이지가 ?�재 ?�성 ?�이지?�거??그보???�에 ?�으�??�덱??조정
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
      // ?�이지 ?�환?� ?�태 ?�?�할 ?�요 ?�음
    },
    
    updatePageName: async (pageId: string, name: string) => {
      const userId = getUserId();

      try {
        await updatePageName(userId, pageId, name);

        // ?�버 ?�데?�트 ?�공 ??로컬 ?�태 ?�데?�트
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

      widgetOperationsLog(`[AddWidget] Adding widget: ${type}, ID: ${newWidget.i}`);

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

        widgetOperationsLog(`[AddWidget] Widget added: ${type}, total widgets: ${updatedPage.widgets.length}`);

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
        // Widget deleted successfully
      } catch (error) {
        console.error(`Failed to delete widget ${widgetId}:`, error);
        throw error;
      }
    },

    updateLayout: async (layouts) => {
      // Layout updated

      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = {
          ...activePage,
          layouts: layouts,
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });

      // Save to database
      get().actions.saveState();
    },

    updateResponsiveLayouts: async (responsiveLayouts: ResponsiveLayouts) => {
      // Responsive layouts updated

      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = {
          ...activePage,
          responsiveLayouts: responsiveLayouts,
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;
        return { pages: newPages };
      });

      // Save to database
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

    updateWidgetPosition: (widgetId, breakpoint, layoutItem) => {
      // Update widget position - detailed logging removed for clarity

      set((state) => {
        const activePage = state.pages[state.activePageIndex];
        const updatedPage = {
          ...activePage,
          widgets: activePage.widgets.map((widget) => {
            if (widget.i === widgetId) {
              const currentPosition = widget.position || {};
              const updatedPosition = {
                ...currentPosition,
                [breakpoint]: layoutItem
              };

              // Widget position updated

              return {
                ...widget,
                position: updatedPosition
              };
            }
            return widget;
          }),
        };
        const newPages = [...state.pages];
        newPages[state.activePageIndex] = updatedPage;

        return { pages: newPages };
      });

      // Save to database
      get().actions.saveState();
    },

    saveStateImmediate: async () => {
      const userId = getUserId();
      const { pages, activePageIndex } = get();
      const activePage = pages[activePageIndex];

      const widgetStates: WidgetState[] = activePage.widgets.map(widget => {
        // Prioritize widget.position data, fallback to default size if needed
        let layoutData;

        if (widget.position && Object.keys(widget.position).length > 0) {
          // Use saved position data (highest priority)
          layoutData = widget.position;
          // Using saved position data
        } else {
          // Fall back to widget-type-specific default sizes
          const [defaultWidth, defaultHeight] = getOptimalWidgetSize(widget.type, 'lg');
          const layout = activePage.layouts.find(l => l.i === widget.i);

          layoutData = {
            lg: {
              x: layout?.x ?? 0,
              y: layout?.y ?? 0,
              w: layout?.w ?? defaultWidth,
              h: layout?.h ?? defaultHeight,
              i: widget.i
            }
          };
          // Using default layout
        }

        return {
          userId,
          pageId: activePage.id,
          widgetId: widget.i,
          widgetType: widget.type,
          config: widget.config || {},
          layout: layoutData,
        };
      });
      
      try {
        await saveWidgets(widgetStates);
        // State saved to server successfully
        
        // ?�???�공 ???�시 ?�데?�트
        const currentHash = generateStateHash(activePage.widgets, activePage.layouts);
        set({ lastSavedHash: currentHash });
        
        // localStorage 백업 ?�거 - ?�버 ?�이?�만 ?�뢰?�여 ?��???보장
        
      } catch (err) {
        console.error("Failed to save state to server:", err);
        throw err;
      }
    },

    saveState: debounce(() => {
      const { pages, activePageIndex, lastSavedHash, isAutosaving } = get();
      const activePage = pages[activePageIndex];
      const userId = getUserId();

      // Check if state changed
      const currentHash = generateStateHash(activePage.widgets, activePage.layouts);
      if (currentHash === lastSavedHash || isAutosaving) {
        return;
      }

      set({ isAutosaving: true });

      const widgetStates: WidgetState[] = activePage.widgets.map((widget, index) => {
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

        // Priority order: saved position data > responsive layouts > legacy layouts > default
        let layoutData;

        if (widget.position && Object.keys(widget.position).length > 0) {
          layoutData = widget.position;
        } else if (Object.keys(widgetResponsiveLayout).length > 0) {
          layoutData = widgetResponsiveLayout;
        } else {
          const [defaultWidth, defaultHeight] = getOptimalWidgetSize(widget.type, 'lg');
          layoutData = {
            lg: {
              x: layout?.x ?? 0,
              y: layout?.y ?? 0,
              w: layout?.w ?? defaultWidth,
              h: layout?.h ?? defaultHeight,
              i: widget.i
            }
          };
        }

        return {
          userId,
          pageId: activePage.id,
          widgetId: widget.i,
          widgetType: widget.type,
          config: widget.config || {},
          layout: layoutData,
        };
      });

      saveWidgets(widgetStates)
        .then(() => {
          set({ lastSavedHash: currentHash, isAutosaving: false });
        })
        .catch(err => {
          console.error("Failed to save state to server:", err);
          set({ isAutosaving: false });
        });
    }, 1500), // 1.5�??�바?�스

    resetState: () => {
      // ?�버???�이?�도 ??��?�는 로직???�요?????��?�? ?�기?�는 ?�론?�엔??초기?�만 진행
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
