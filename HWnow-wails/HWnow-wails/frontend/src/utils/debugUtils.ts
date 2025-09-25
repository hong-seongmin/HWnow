import { useDashboardStore } from '../stores/dashboardStore';
import { getWidgets, saveWidgets } from '../services/apiService';
import type { WidgetState } from '../stores/types';

// ?îÎ≤ÑÍπÖÏùÑ ?ÑÌïú ?†Ìã∏Î¶¨Ìã∞ ?®Ïàò??
export const debugUtils = {
  // ?ÑÏû¨ ?Ä?úÎ≥¥???ÅÌÉú Ï∂úÎ†•
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
      
      // ?ÑÏ†ØÍ≥??àÏù¥?ÑÏõÉ Îß§Ïπ≠ ?ïÏù∏
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

  // ?úÎ≤Ñ?êÏÑú ?ÑÏ†Ø ?∞Ïù¥??ÏßÅÏ†ë Í∞Ä?∏Ïò§Í∏?
  fetchFromServer: async () => {
    const userId = 'global-user';
    const state = useDashboardStore.getState();
    const activePageId = state.pages[state.activePageIndex]?.id || 'main-page';
    
    console.log('?îç [DEBUG] Fetching from server - userId:', userId, 'pageId:', activePageId);
    try {
      const widgets = await getWidgets(userId, activePageId);
      console.log('?îç [DEBUG] Server returned', widgets.length, 'widgets');
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

  // ?ÑÏû¨ ?ÅÌÉúÎ•??úÎ≤Ñ??Í∞ïÏ†ú ?Ä??
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

  // ?ÅÌÉú ÎπÑÍµê (Î°úÏª¨ vs ?úÎ≤Ñ)
  compareStates: async () => {
    console.log('?îç [DEBUG] Comparing local vs server states...');
    
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
    
    console.log('?ìä [DEBUG] Local widgets:', activePage.widgets.length);
    console.log('?ìä [DEBUG] Server widgets:', serverData.length);
    
    // Í∞??ÑÏ†ØÎ≥?ÎπÑÍµê
    activePage.widgets.forEach(localWidget => {
      const localLayout = activePage.layouts.find(l => l.i === localWidget.i);
      const serverWidget = serverData.find(s => s.widgetId === localWidget.i);
      
      if (!serverWidget) {
        console.warn(`?†Ô∏è [DEBUG] Widget ${localWidget.i} exists locally but not on server`);
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
      
      console.log(`?îç [DEBUG] Widget ${localWidget.i} comparison:`);
      console.log('  ?ìç Local layout:', {
        position: { x: localLayout?.x, y: localLayout?.y },
        size: { w: localLayout?.w, h: localLayout?.h }
      });
      console.log('  ?åê Server layout:', {
        position: { x: serverLayout?.x, y: serverLayout?.y },
        size: { w: serverLayout?.w, h: serverLayout?.h }
      });
      
      const isPositionMatch = localLayout?.x === serverLayout?.x && localLayout?.y === serverLayout?.y;
      const isSizeMatch = localLayout?.w === serverLayout?.w && localLayout?.h === serverLayout?.h;
      
      if (!isPositionMatch || !isSizeMatch) {
        console.warn(`?†Ô∏è [DEBUG] Layout mismatch for widget ${localWidget.i}!`);
        console.warn(`?†Ô∏è [DEBUG] Position match: ${isPositionMatch}, Size match: ${isSizeMatch}`);
      } else {
        console.log(`??[DEBUG] Widget ${localWidget.i} layouts match perfectly`);
      }
    });
    
    // ?úÎ≤Ñ?êÎßå ?àÎäî ?ÑÏ†Ø ?ïÏù∏
    serverData.forEach(serverWidget => {
      const localWidget = activePage.widgets.find(w => w.i === serverWidget.widgetId);
      if (!localWidget) {
        console.warn(`?†Ô∏è [DEBUG] Widget ${serverWidget.widgetId} exists on server but not locally`);
      }
    });
  },

  // ?πÏ†ï ?ÑÏ†Ø???ÅÌÉú ?êÏÑ∏??Î≥¥Í∏∞
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

  // ?òÎèô?ºÎ°ú saveState ?∏Î¶¨Í±?
  triggerSaveState: () => {
    console.log('[DEBUG] Manually triggering saveState...');
    useDashboardStore.getState().actions.saveState();
  },

  // ?àÎ°úÍ≥†Ïπ® ?úÎÇòÎ¶¨Ïò§ ?úÎ??àÏù¥??
  simulateRefresh: async () => {
    console.log('?îÑ [REFRESH] Simulating page refresh scenario...');
    
    // 1. ?ÑÏû¨ ?ÅÌÉú ?Ä??
    const currentState = useDashboardStore.getState();
    console.log('?íæ [REFRESH] Current state before refresh:', {
      widgets: currentState.pages[currentState.activePageIndex]?.widgets.length,
      layouts: currentState.pages[currentState.activePageIndex]?.layouts.length
    });
    
    // 2. ?§ÌÜ†??Î¶¨ÏÖã (?àÎ°úÍ≥†Ïπ® ?úÎ??àÏù¥??
    useDashboardStore.setState({
      pages: [{ id: 'main-page', name: 'Main Page', widgets: [], layouts: [] }],
      activePageIndex: 0,
      isInitialized: false
    });
    
    console.log('?îÑ [REFRESH] Store reset, triggering re-initialization...');
    
    // 3. ?§Ïãú Ï¥àÍ∏∞??
    await useDashboardStore.getState().actions.initialize();
    
    console.log('??[REFRESH] Re-initialization complete');
    
    // 4. ?àÎ°ú???ÅÌÉú ?ïÏù∏
    const newState = useDashboardStore.getState();
    console.log('?îç [REFRESH] State after re-initialization:', {
      widgets: newState.pages[newState.activePageIndex]?.widgets.length,
      layouts: newState.pages[newState.activePageIndex]?.layouts.length,
      positions: newState.pages[newState.activePageIndex]?.layouts.map(l => ({
        id: l.i,
        position: { x: l.x, y: l.y },
        size: { w: l.w, h: l.h }
      }))
    });
  },

  // ?ÑÏ≤¥ ?îÎ≤ÑÍπ??åÌÅ¨?åÎ°ú??
  fullDebugWorkflow: async () => {
    console.log('?? [DEBUG] Starting full debug workflow...');
    
    console.log('\n1Ô∏è‚É£ Current Dashboard State:');
    debugUtils.printDashboardState();
    
    console.log('\n2Ô∏è‚É£ Server Data:');
    await debugUtils.fetchFromServer();
    
    console.log('\n3Ô∏è‚É£ State Comparison:');
    await debugUtils.compareStates();
    
    console.log('\n4Ô∏è‚É£ Refresh Simulation:');
    await debugUtils.simulateRefresh();
    
    console.log('\n??[DEBUG] Full debug workflow complete');
  }
};

// Î∏åÎùº?∞Ï? ÏΩòÏÜî?êÏÑú ?¨Ïö©?????àÎèÑÎ°?window Í∞ùÏ≤¥??Ï∂îÍ?
declare global {
  interface Window {
    debugDashboard: typeof debugUtils;
  }
}

if (typeof window !== 'undefined') {
  window.debugDashboard = debugUtils;
}

export default debugUtils;
