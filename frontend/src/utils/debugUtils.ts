import { useDashboardStore } from '../stores/dashboardStore';
import { getWidgets, saveWidgets } from '../services/apiService';
import type { WidgetState } from '../stores/types';

// 디버깅을 위한 유틸리티 함수들
export const debugUtils = {
  // 현재 대시보드 상태 출력
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
      
      // 위젯과 레이아웃 매칭 확인
      activePage.widgets.forEach(widget => {
        const layout = activePage.layouts.find(l => l.i === widget.i);
        console.log(`- Widget ${widget.i}:`, {
          type: widget.type,
          config: widget.config,
          layout: layout
        });
      });
    }
  },

  // 서버에서 위젯 데이터 직접 가져오기
  fetchFromServer: async () => {
    const userId = 'global-user';
    const state = useDashboardStore.getState();
    const activePageId = state.pages[state.activePageIndex]?.id || 'main-page';
    
    console.log('🔍 [DEBUG] Fetching from server - userId:', userId, 'pageId:', activePageId);
    try {
      const widgets = await getWidgets(userId, activePageId);
      console.log('🔍 [DEBUG] Server returned', widgets.length, 'widgets');
      console.log('🔍 [DEBUG] Server widget details:', 
        widgets.map(w => ({
          id: w.widgetId,
          type: w.widgetType,
          rawLayout: w.layout,
          parsedLayout: w.layout ? JSON.parse(w.layout) : null
        }))
      );
      return widgets;
    } catch (error) {
      console.error('❌ [DEBUG] Failed to fetch from server:', error);
      return null;
    }
  },

  // 현재 상태를 서버에 강제 저장
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

  // 상태 비교 (로컬 vs 서버)
  compareStates: async () => {
    console.log('🔍 [DEBUG] Comparing local vs server states...');
    
    const localState = useDashboardStore.getState();
    const activePage = localState.pages[localState.activePageIndex];
    
    if (!activePage) {
      console.error('❌ [DEBUG] No active page found');
      return;
    }
    
    const serverData = await debugUtils.fetchFromServer();
    if (!serverData) {
      console.error('❌ [DEBUG] Failed to fetch server data for comparison');
      return;
    }
    
    console.log('📊 [DEBUG] Local widgets:', activePage.widgets.length);
    console.log('📊 [DEBUG] Server widgets:', serverData.length);
    
    // 각 위젯별 비교
    activePage.widgets.forEach(localWidget => {
      const localLayout = activePage.layouts.find(l => l.i === localWidget.i);
      const serverWidget = serverData.find(s => s.widgetId === localWidget.i);
      
      if (!serverWidget) {
        console.warn(`⚠️ [DEBUG] Widget ${localWidget.i} exists locally but not on server`);
        return;
      }
      
      let serverLayout: any = {};
      try {
        serverLayout = JSON.parse(serverWidget.layout || '{}');
      } catch (e) {
        console.error(`❌ [DEBUG] Failed to parse server layout for ${localWidget.i}:`, serverWidget.layout);
      }
      
      console.log(`🔍 [DEBUG] Widget ${localWidget.i} comparison:`);
      console.log('  📍 Local layout:', {
        position: { x: localLayout?.x, y: localLayout?.y },
        size: { w: localLayout?.w, h: localLayout?.h }
      });
      console.log('  🌐 Server layout:', {
        position: { x: serverLayout?.x, y: serverLayout?.y },
        size: { w: serverLayout?.w, h: serverLayout?.h }
      });
      
      const isPositionMatch = localLayout?.x === serverLayout?.x && localLayout?.y === serverLayout?.y;
      const isSizeMatch = localLayout?.w === serverLayout?.w && localLayout?.h === serverLayout?.h;
      
      if (!isPositionMatch || !isSizeMatch) {
        console.warn(`⚠️ [DEBUG] Layout mismatch for widget ${localWidget.i}!`);
        console.warn(`⚠️ [DEBUG] Position match: ${isPositionMatch}, Size match: ${isSizeMatch}`);
      } else {
        console.log(`✅ [DEBUG] Widget ${localWidget.i} layouts match perfectly`);
      }
    });
    
    // 서버에만 있는 위젯 확인
    serverData.forEach(serverWidget => {
      const localWidget = activePage.widgets.find(w => w.i === serverWidget.widgetId);
      if (!localWidget) {
        console.warn(`⚠️ [DEBUG] Widget ${serverWidget.widgetId} exists on server but not locally`);
      }
    });
  },

  // 특정 위젯의 상태 자세히 보기
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

  // 수동으로 saveState 트리거
  triggerSaveState: () => {
    console.log('[DEBUG] Manually triggering saveState...');
    useDashboardStore.getState().actions.saveState();
  },

  // 새로고침 시나리오 시뮬레이션
  simulateRefresh: async () => {
    console.log('🔄 [REFRESH] Simulating page refresh scenario...');
    
    // 1. 현재 상태 저장
    const currentState = useDashboardStore.getState();
    console.log('💾 [REFRESH] Current state before refresh:', {
      widgets: currentState.pages[currentState.activePageIndex]?.widgets.length,
      layouts: currentState.pages[currentState.activePageIndex]?.layouts.length
    });
    
    // 2. 스토어 리셋 (새로고침 시뮬레이션)
    useDashboardStore.setState({
      pages: [{ id: 'main-page', name: 'Main Page', widgets: [], layouts: [] }],
      activePageIndex: 0,
      isInitialized: false
    });
    
    console.log('🔄 [REFRESH] Store reset, triggering re-initialization...');
    
    // 3. 다시 초기화
    await useDashboardStore.getState().actions.initialize();
    
    console.log('✅ [REFRESH] Re-initialization complete');
    
    // 4. 새로운 상태 확인
    const newState = useDashboardStore.getState();
    console.log('🔍 [REFRESH] State after re-initialization:', {
      widgets: newState.pages[newState.activePageIndex]?.widgets.length,
      layouts: newState.pages[newState.activePageIndex]?.layouts.length,
      positions: newState.pages[newState.activePageIndex]?.layouts.map(l => ({
        id: l.i,
        position: { x: l.x, y: l.y },
        size: { w: l.w, h: l.h }
      }))
    });
  },

  // 전체 디버깅 워크플로우
  fullDebugWorkflow: async () => {
    console.log('🚀 [DEBUG] Starting full debug workflow...');
    
    console.log('\n1️⃣ Current Dashboard State:');
    debugUtils.printDashboardState();
    
    console.log('\n2️⃣ Server Data:');
    await debugUtils.fetchFromServer();
    
    console.log('\n3️⃣ State Comparison:');
    await debugUtils.compareStates();
    
    console.log('\n4️⃣ Refresh Simulation:');
    await debugUtils.simulateRefresh();
    
    console.log('\n✅ [DEBUG] Full debug workflow complete');
  }
};

// 브라우저 콘솔에서 사용할 수 있도록 window 객체에 추가
declare global {
  interface Window {
    debugDashboard: typeof debugUtils;
  }
}

if (typeof window !== 'undefined') {
  window.debugDashboard = debugUtils;
}

export default debugUtils;