import { v4 as uuidv4 } from 'uuid';
import type { Layout } from 'react-grid-layout';
import type { Command } from './historyStore';
import type { Widget, WidgetType } from './types';
import { useDashboardStore } from './dashboardStore';
import { deleteWidget } from '../services/apiService';

// 위젯 추가 명령
export class AddWidgetCommand implements Command {
  private widgetId: string;
  private widgetType: WidgetType;
  private widget: Widget | null = null;
  private layout: Layout | null = null;
  
  constructor(widgetType: WidgetType) {
    this.widgetId = uuidv4();
    this.widgetType = widgetType;
  }
  
  get description(): string {
    return `Add ${this.widgetType} widget`;
  }
  
  get timestamp(): number {
    return Date.now();
  }
  
  async execute(): Promise<void> {
    const { pages, activePageIndex } = useDashboardStore.getState();
    const activePage = pages[activePageIndex];
    
    // 새 위젯 생성
    this.widget = {
      i: this.widgetId,
      type: this.widgetType,
      config: {},
    };
    
    // 빈 공간 찾기
    const position = this.findEmptyPosition(activePage.layouts);
    this.layout = {
      i: this.widgetId,
      ...position,
    };
    
    // Zustand 올바른 상태 업데이트 패턴
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: [...page.widgets, this.widget!],
              layouts: [...page.layouts, this.layout!],
            }
          : page
      )
    }));
    
    // 즉시 서버 동기화 (디바운스 없음)
    try {
      await useDashboardStore.getState().actions.saveStateImmediate();
    } catch (error) {
      console.error('Failed to save widget addition to server:', error);
      // 실패 시 롤백 
      useDashboardStore.setState(state => ({
        pages: state.pages.map((page, index) =>
          index === activePageIndex
            ? {
                ...page,
                widgets: page.widgets.filter(w => w.i !== this.widgetId),
                layouts: page.layouts.filter(l => l.i !== this.widgetId),
              }
            : page
        )
      }));
      throw error;
    }
  }
  
  undo(): void {
    const { activePageIndex } = useDashboardStore.getState();
    
    // Zustand 올바른 상태 업데이트 패턴
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: page.widgets.filter(w => w.i !== this.widgetId),
              layouts: page.layouts.filter(l => l.i !== this.widgetId),
            }
          : page
      )
    }));
    
    // 서버 동기화
    useDashboardStore.getState().actions.saveState();
  }
  
  private findEmptyPosition(layouts: Layout[]) {
    const widgetWidth = 4;
    const widgetHeight = 3;
    const gridWidth = 12;
    
    // 기존 위젯들의 위치 정보 수집
    const occupiedPositions = new Set<string>();
    layouts.forEach(layout => {
      for (let x = layout.x; x < layout.x + layout.w; x++) {
        for (let y = layout.y; y < layout.y + layout.h; y++) {
          occupiedPositions.add(`${x},${y}`);
        }
      }
    });
    
    // 빈 공간 찾기
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x <= gridWidth - widgetWidth; x++) {
        let canPlace = true;
        
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
    
    // 빈 공간을 찾지 못한 경우
    return { x: 0, y: layouts.length * 3, w: widgetWidth, h: widgetHeight };
  }
}

// 위젯 제거 명령
export class RemoveWidgetCommand implements Command {
  private widgetId: string;
  private removedWidget: Widget | null = null;
  private removedLayout: Layout | null = null;
  
  constructor(widgetId: string) {
    this.widgetId = widgetId;
  }
  
  get description(): string {
    const widgetType = this.removedWidget?.type || 'widget';
    return `Remove ${widgetType} widget`;
  }
  
  get timestamp(): number {
    return Date.now();
  }
  
  async execute(): Promise<void> {
    const { pages, activePageIndex } = useDashboardStore.getState();
    const activePage = pages[activePageIndex];
    
    // 제거할 위젯과 레이아웃 저장
    this.removedWidget = activePage.widgets.find(w => w.i === this.widgetId) || null;
    this.removedLayout = activePage.layouts.find(l => l.i === this.widgetId) || null;
    
    if (!this.removedWidget || !this.removedLayout) {
      throw new Error(`Widget ${this.widgetId} not found`);
    }
    
    // Optimistic update (기존 removeWidget과 동일한 방식)
    const originalPages = pages;
    
    // Zustand 올바른 상태 업데이트 패턴
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: page.widgets.filter(w => w.i !== this.widgetId),
              layouts: page.layouts.filter(l => l.i !== this.widgetId),
            }
          : page
      )
    }));
    
    // 서버 동기화 (기존 removeWidget과 동일한 방식)
    try {
      const getUserId = (): string => {
        // 모든 브라우저에서 동일한 사용자 ID 사용 (공통 대시보드)
        return 'global-user';
      };
      await deleteWidget(getUserId(), this.widgetId, activePage.id);
    } catch (error) {
      console.error(`Failed to delete widget ${this.widgetId} on server`, error);
      // 롤백
      useDashboardStore.setState({ pages: originalPages });
      throw error;
    }
  }
  
  undo(): void {
    if (!this.removedWidget || !this.removedLayout) {
      throw new Error('Cannot undo: removed widget data not found');
    }
    
    const { activePageIndex } = useDashboardStore.getState();
    
    // Zustand 올바른 상태 업데이트 패턴
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: [...page.widgets, this.removedWidget!],
              layouts: [...page.layouts, this.removedLayout!],
            }
          : page
      )
    }));
    
    // 서버 동기화
    useDashboardStore.getState().actions.saveState();
  }
}

// 위젯 이동/리사이즈 명령
export class UpdateLayoutCommand implements Command {
  private oldLayouts: Layout[];
  private newLayouts: Layout[];
  
  constructor(oldLayouts: Layout[], newLayouts: Layout[]) {
    this.oldLayouts = JSON.parse(JSON.stringify(oldLayouts));
    this.newLayouts = JSON.parse(JSON.stringify(newLayouts));
  }
  
  get description(): string {
    return 'Move or resize widgets';
  }
  
  get timestamp(): number {
    return Date.now();
  }
  
  execute(): void {
    // Redo 시에만 실행 - 새로운 레이아웃으로 복원
    const { activePageIndex } = useDashboardStore.getState();
    
    // Zustand 올바른 상태 업데이트 패턴
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? { ...page, layouts: this.newLayouts }
          : page
      )
    }));
    
    // 서버 동기화
    useDashboardStore.getState().actions.saveState();
  }
  
  undo(): void {
    const { activePageIndex } = useDashboardStore.getState();
    
    // Zustand 올바른 상태 업데이트 패턴
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? { ...page, layouts: this.oldLayouts }
          : page
      )
    }));
    
    // 서버 동기화 (디바운스된 방식 사용)
    useDashboardStore.getState().actions.saveState();
  }
}

// 위젯 설정 변경 명령
export class UpdateWidgetConfigCommand implements Command {
  private widgetId: string;
  private oldConfig: any;
  private newConfig: any;
  
  constructor(widgetId: string, oldConfig: any, newConfig: any) {
    this.widgetId = widgetId;
    this.oldConfig = JSON.parse(JSON.stringify(oldConfig));
    this.newConfig = JSON.parse(JSON.stringify(newConfig));
  }
  
  get description(): string {
    return 'Update widget settings';
  }
  
  get timestamp(): number {
    return Date.now();
  }
  
  execute(): void {
    const { activePageIndex } = useDashboardStore.getState();
    
    // Zustand 올바른 상태 업데이트 패턴
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: page.widgets.map(widget =>
                widget.i === this.widgetId
                  ? { ...widget, config: { ...widget.config, ...this.newConfig } }
                  : widget
              ),
            }
          : page
      )
    }));
    
    // 서버 동기화
    useDashboardStore.getState().actions.saveState();
  }
  
  undo(): void {
    const { activePageIndex } = useDashboardStore.getState();
    
    // Zustand 올바른 상태 업데이트 패턴
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: page.widgets.map(widget =>
                widget.i === this.widgetId
                  ? { ...widget, config: this.oldConfig }
                  : widget
              ),
            }
          : page
      )
    }));
    
    // 서버 동기화
    useDashboardStore.getState().actions.saveState();
  }
}