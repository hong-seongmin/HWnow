import { useState, useCallback, useRef, useEffect } from 'react';
import { useDashboardStore } from '../stores/dashboardStore';
import type { Widget } from '../stores/types';

interface WidgetFocusState {
  focusedWidgetId: string | null;
  selectedWidgetIds: Set<string>;
}

export const useWidgetFocus = () => {
  const [focusState, setFocusState] = useState<WidgetFocusState>({
    focusedWidgetId: null,
    selectedWidgetIds: new Set(),
  });
  
  const dashboardState = useDashboardStore();
  const { activePageIndex, pages } = dashboardState;
  const currentPage = pages[activePageIndex];
  const currentWidgets: Widget[] = currentPage ? currentPage.widgets : [];
  
  console.log('useWidgetFocus - pages:', pages.length, 'activePageIndex:', activePageIndex);
  console.log('useWidgetFocus - currentPage:', currentPage?.name, 'widgets:', currentWidgets.length);
  
  // 위젯 목록이 변경될 때 상태 재설정
  useEffect(() => {
    console.log('Widget list changed, clearing focus state');
    if (currentWidgets.length === 0) {
      setFocusState({
        focusedWidgetId: null,
        selectedWidgetIds: new Set(),
      });
    }
  }, [currentWidgets.length, currentWidgets.map(w => w.i).join(',')]);
  
  const focusedWidgetRef = useRef<HTMLElement | null>(null);

  // 위젯 포커스 설정
  const focusWidget = useCallback((widgetId: string | null) => {
    setFocusState(prev => ({
      ...prev,
      focusedWidgetId: widgetId,
    }));
  }, []);

  // 위젯 선택 상태 토글
  const toggleWidgetSelection = useCallback((widgetId: string, multiSelect = false) => {
    setFocusState(prev => {
      const newSelected = new Set(prev.selectedWidgetIds);
      
      if (!multiSelect) {
        newSelected.clear();
      }
      
      if (newSelected.has(widgetId)) {
        newSelected.delete(widgetId);
      } else {
        newSelected.add(widgetId);
      }
      
      return {
        ...prev,
        selectedWidgetIds: newSelected,
        focusedWidgetId: widgetId,
      };
    });
  }, []);

  // 모든 위젯 선택
  const selectAllWidgets = useCallback(() => {
    const allWidgetIds = new Set(currentWidgets.map((w: Widget) => w.i));
    console.log('selectAllWidgets called:', {
      currentWidgetsCount: currentWidgets.length,
      allWidgetIds: Array.from(allWidgetIds)
    });
    
    // 상태 업데이트를 즉시 실행
    setFocusState(prev => {
      console.log('Previous state:', {
        focusedWidgetId: prev.focusedWidgetId,
        selectedWidgetIds: Array.from(prev.selectedWidgetIds)
      });
      const newState = {
        focusedWidgetId: prev.focusedWidgetId,
        selectedWidgetIds: new Set(allWidgetIds),
      };
      console.log('New state will be:', {
        focusedWidgetId: newState.focusedWidgetId,
        selectedWidgetIds: Array.from(newState.selectedWidgetIds)
      });
      return newState;
    });
    
    // 강제 리렌더링을 위한 타임아웃
    setTimeout(() => {
      console.log('Force rerender check after selectAll');
    }, 100);
  }, [currentWidgets]);

  // 선택 해제
  const clearSelection = useCallback(() => {
    setFocusState(prev => ({
      ...prev,
      selectedWidgetIds: new Set(),
    }));
  }, []);

  // 방향키로 위젯 네비게이션
  const navigateWidget = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (currentWidgets.length === 0) return;

    const currentIndex = focusState.focusedWidgetId 
      ? currentWidgets.findIndex((w: Widget) => w.i === focusState.focusedWidgetId)
      : -1;

    let nextIndex = currentIndex;

    switch (direction) {
      case 'right':
        nextIndex = currentIndex < currentWidgets.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'left':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : currentWidgets.length - 1;
        break;
      case 'down':
        // 그리드 레이아웃을 고려한 아래쪽 이동 (단순화: 2개씩 다음 행)
        nextIndex = currentIndex + 2 < currentWidgets.length ? currentIndex + 2 : currentIndex;
        break;
      case 'up':
        // 그리드 레이아웃을 고려한 위쪽 이동
        nextIndex = currentIndex - 2 >= 0 ? currentIndex - 2 : currentIndex;
        break;
    }

    if (nextIndex >= 0 && nextIndex < currentWidgets.length) {
      focusWidget(currentWidgets[nextIndex].i);
    }
  }, [currentWidgets, focusState.focusedWidgetId, focusWidget]);

  // 포커스된 위젯 DOM 요소에 실제 포커스 적용
  useEffect(() => {
    if (focusState.focusedWidgetId) {
      const widgetElement = document.querySelector(`[data-widget-id="${focusState.focusedWidgetId}"]`) as HTMLElement;
      if (widgetElement) {
        widgetElement.focus();
        focusedWidgetRef.current = widgetElement;
      }
    }
  }, [focusState.focusedWidgetId]);

  // 페이지 변경시 포커스 초기화
  useEffect(() => {
    setFocusState({
      focusedWidgetId: null,
      selectedWidgetIds: new Set(),
    });
  }, [activePageIndex]);

  // 상태 변화 디버깅
  useEffect(() => {
    console.log('Focus state changed:', {
      focusedWidgetId: focusState.focusedWidgetId,
      selectedWidgetIds: Array.from(focusState.selectedWidgetIds),
      selectionCount: focusState.selectedWidgetIds.size
    });
  }, [focusState]);

  return {
    focusedWidgetId: focusState.focusedWidgetId,
    selectedWidgetIds: focusState.selectedWidgetIds,
    focusWidget,
    toggleWidgetSelection,
    selectAllWidgets,
    clearSelection,
    navigateWidget,
    isWidgetFocused: (widgetId: string) => focusState.focusedWidgetId === widgetId,
    isWidgetSelected: (widgetId: string) => {
      return focusState.selectedWidgetIds.has(widgetId);
    },
    hasSelection: focusState.selectedWidgetIds.size > 0,
    selectionCount: focusState.selectedWidgetIds.size,
  };
};