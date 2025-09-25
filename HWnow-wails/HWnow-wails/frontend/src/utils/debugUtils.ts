import { useDashboardStore } from '../stores/dashboardStore';
import { getWidgets, saveWidgets } from '../services/apiService';
import type { WidgetState } from '../stores/types';

// ?�버깅을 ?�한 ?�틸리티 ?�수??
export const debugUtils = {
  // ?�재 ?�?�보???�태 출력
  printDashboardState: () => {
    const state = useDashboardStore.getState();
    console.log('[DEBUG] Current Dashboard State:');
    console.log('- Pages:', state.pages);
    console.log('- Active Page Index:', state.activePageIndex);
    console.log('- Is Initialized:', state.isInitialized);
    
    if (state.pages[state.activePageIndex]) {
      const activePage = state.pages[state.activePageIndex];
      console.log('- Active Page:', activePage);
      console.log('- Widgets Count:', activePage.widgets.length);
      console.log('- Layouts Count:', activePage.layouts.length);
      
      // ?�젯�??�이?�웃 매칭 ?�인
      activePage.widgets.forEach(widget => {
        const layout = activePage.layouts.find(l => l.i === widget.i);
        console.log(`- Widget ${widget.i}:`, {
          type: widget.type,
        config: JSON.stringify(widget.config || {}),
          layout: layout
        });
      });
    }
  },

  // ?�버?�서 ?�젯 ?�이??직접 가?�오�?
  fetchFromServer: async () => {
    const userId = 'global-user';
    const state = useDashboardStore.getState();
    const activePageId = state.pages[state.activePageIndex]?.id || 'main-page';
    
    console.log('?�� [DEBUG] Fetching from server - userId:', userId, 'pageId:', activePageId);
    try {
      const widgets = await getWidgets(userId, activePageId);
      console.log('?�� [DEBUG] Server returned', widgets.length, 'widgets');
      console.log('??? [DEBUG] Server widget details:', 
        widgets.map(w => {
          const parsedLayout = !w.layout ? null : (typeof w.layout === 'string' ? JSON.parse(w.layout) : w.layout);
          return {
            id: w.widgetId,
            type: w.widgetType,
            rawLayout: w.layout,
            parsedLayout
          };
        })
      );
      return widgets;
    } catch (error) {
      console.error('??[DEBUG] Failed to fetch from server:', error);
      return null;
    }
  },

  // ?�재 ?�태�??�버??강제 ?�??
  forceSaveToServer: async () => {
    const userId = 'global-user';
    const state = useDashboardStore.getState();
    const activePage = state.pages[state.activePageIndex];
    
    if (!activePage) {
      console.error('[DEBUG] No active page found');
      return;
    }

    const widgetStates: WidgetState[] = activePage.widgets.map(widget => {
      const layout = activePage.layouts.find(l => l.i === widget.i);
      return {
        userId,
        pageId: activePage.id,
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
    
    console.log('[DEBUG] Force saving to server:', widgetStates);
    try {
      await saveWidgets(widgetStates);
      console.log('[DEBUG] Successfully saved to server');
    } catch (error) {
      console.error('[DEBUG] Failed to save to server:', error);
    }
  },

  // ?�태 비교 (로컬 vs ?�버)
  compareStates: async () => {
    console.log('?�� [DEBUG] Comparing local vs server states...');
    
    const localState = useDashboardStore.getState();
    const activePage = localState.pages[localState.activePageIndex];
    
    if (!activePage) {
      console.error('??[DEBUG] No active page found');
      return;
    }
    
    const serverData = await debugUtils.fetchFromServer();
    if (!serverData) {
      console.error('??[DEBUG] Failed to fetch server data for comparison');
      return;
    }
    
    console.log('?�� [DEBUG] Local widgets:', activePage.widgets.length);
    console.log('?�� [DEBUG] Server widgets:', serverData.length);
    
    // �??�젯�?비교
    activePage.widgets.forEach(localWidget => {
      const localLayout = activePage.layouts.find(l => l.i === localWidget.i);
      const serverWidget = serverData.find(s => s.widgetId === localWidget.i);
      
      if (!serverWidget) {
        console.warn(`?�️ [DEBUG] Widget ${localWidget.i} exists locally but not on server`);
        return;
      }
      
      let serverLayout: any = {};
      try {
        if (serverWidget.layout) {
          serverLayout = typeof serverWidget.layout === 'string'
            ? JSON.parse(serverWidget.layout)
            : serverWidget.layout;
        }
      } catch (e) {
        console.error(`??[DEBUG] Failed to parse server layout for ${localWidget.i}:`, serverWidget.layout);
      }
      
      console.log(`?�� [DEBUG] Widget ${localWidget.i} comparison:`);
      console.log('  ?�� Local layout:', {
        position: { x: localLayout?.x, y: localLayout?.y },
        size: { w: localLayout?.w, h: localLayout?.h }
      });
      console.log('  ?�� Server layout:', {
        position: { x: serverLayout?.x, y: serverLayout?.y },
        size: { w: serverLayout?.w, h: serverLayout?.h }
      });
      
      const isPositionMatch = localLayout?.x === serverLayout?.x && localLayout?.y === serverLayout?.y;
      const isSizeMatch = localLayout?.w === serverLayout?.w && localLayout?.h === serverLayout?.h;
      
      if (!isPositionMatch || !isSizeMatch) {
        console.warn(`?�️ [DEBUG] Layout mismatch for widget ${localWidget.i}!`);
        console.warn(`?�️ [DEBUG] Position match: ${isPositionMatch}, Size match: ${isSizeMatch}`);
      } else {
        console.log(`??[DEBUG] Widget ${localWidget.i} layouts match perfectly`);
      }
    });
    
    // ?�버?�만 ?�는 ?�젯 ?�인
    serverData.forEach(serverWidget => {
      const localWidget = activePage.widgets.find(w => w.i === serverWidget.widgetId);
      if (!localWidget) {
        console.warn(`?�️ [DEBUG] Widget ${serverWidget.widgetId} exists on server but not locally`);
      }
    });
  },

  // ?�정 ?�젯???�태 ?�세??보기
  inspectWidget: (widgetId: string) => {
    const state = useDashboardStore.getState();
    const activePage = state.pages[state.activePageIndex];
    
    if (!activePage) {
      console.error('[DEBUG] No active page found');
      return;
    }
    
    const widget = activePage.widgets.find(w => w.i === widgetId);
    const layout = activePage.layouts.find(l => l.i === widgetId);
    
    console.log(`[DEBUG] Widget ${widgetId} details:`);
    console.log('  Widget:', widget);
    console.log('  Layout:', layout);
    console.log('  Layout JSON:', JSON.stringify(layout));
  },

  // ?�동?�로 saveState ?�리�?
  triggerSaveState: () => {
    console.log('[DEBUG] Manually triggering saveState...');
    useDashboardStore.getState().actions.saveState();
  },

  // ?�로고침 ?�나리오 ?��??�이??
  simulateRefresh: async () => {
    console.log('?�� [REFRESH] Simulating page refresh scenario...');
    
    // 1. ?�재 ?�태 ?�??
    const currentState = useDashboardStore.getState();
    console.log('?�� [REFRESH] Current state before refresh:', {
      widgets: currentState.pages[currentState.activePageIndex]?.widgets.length,
      layouts: currentState.pages[currentState.activePageIndex]?.layouts.length
    });
    
    // 2. ?�토??리셋 (?�로고침 ?��??�이??
    useDashboardStore.setState({
      pages: [{ id: 'main-page', name: 'Main Page', widgets: [], layouts: [] }],
      activePageIndex: 0,
      isInitialized: false
    });
    
    console.log('?�� [REFRESH] Store reset, triggering re-initialization...');
    
    // 3. ?�시 초기??
    await useDashboardStore.getState().actions.initialize();
    
    console.log('??[REFRESH] Re-initialization complete');
    
    // 4. ?�로???�태 ?�인
    const newState = useDashboardStore.getState();
    console.log('?�� [REFRESH] State after re-initialization:', {
      widgets: newState.pages[newState.activePageIndex]?.widgets.length,
      layouts: newState.pages[newState.activePageIndex]?.layouts.length,
      positions: newState.pages[newState.activePageIndex]?.layouts.map(l => ({
        id: l.i,
        position: { x: l.x, y: l.y },
        size: { w: l.w, h: l.h }
      }))
    });
  },

  // ?�체 ?�버�??�크?�로??
  fullDebugWorkflow: async () => {
    console.log('?? [DEBUG] Starting full debug workflow...');
    
    console.log('\n1️⃣ Current Dashboard State:');
    debugUtils.printDashboardState();
    
    console.log('\n2️⃣ Server Data:');
    await debugUtils.fetchFromServer();
    
    console.log('\n3️⃣ State Comparison:');
    await debugUtils.compareStates();
    
    console.log('\n4️⃣ Refresh Simulation:');
    await debugUtils.simulateRefresh();
    
    console.log('\n??[DEBUG] Full debug workflow complete');
  }
};

// 브라?��? 콘솔?�서 ?�용?????�도�?window 객체??추�?
declare global {
  interface Window {
    debugDashboard: typeof debugUtils;
  }
}

if (typeof window !== 'undefined') {
  window.debugDashboard = debugUtils;
}

export default debugUtils;
