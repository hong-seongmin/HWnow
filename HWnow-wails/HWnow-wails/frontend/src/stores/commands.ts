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

    // 새 위젯 생성 (레이아웃은 동적으로 생성됨)
    this.widget = {
      i: this.widgetId,
      type: this.widgetType,
      config: {},
    };

    console.log(`[AddWidgetCommand] Adding widget: ${this.widgetType}, ID: ${this.widgetId}`);

    // 위젯만 추가, 레이아웃은 동적 생성 시스템에 맡김
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: [...page.widgets, this.widget!],
              // 레이아웃은 빈 상태 유지 - 동적으로 생성됨
              layouts: [],
              responsiveLayouts: {},
            }
          : page
      )
    }));

    // 위젯 데이터만 서버에 저장
    try {
      await useDashboardStore.getState().actions.saveState();
      console.log(`[AddWidgetCommand] Widget ${this.widgetType} added successfully`);
    } catch (error) {
      console.error('Failed to save widget addition to server:', error);
      // 실패 시 롤백
      useDashboardStore.setState(state => ({
        pages: state.pages.map((page, index) =>
          index === activePageIndex
            ? {
                ...page,
                widgets: page.widgets.filter(w => w.i !== this.widgetId),
                layouts: [],
                responsiveLayouts: {},
              }
            : page
        )
      }));
      throw error;
    }
  }
  
  undo(): void {
    const { activePageIndex } = useDashboardStore.getState();

    console.log(`[AddWidgetCommand] Undoing widget addition: ${this.widgetType}, ID: ${this.widgetId}`);

    // 위젯만 제거, 레이아웃은 동적 생성 시스템에 맡김
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: page.widgets.filter(w => w.i !== this.widgetId),
              layouts: [],
              responsiveLayouts: {},
            }
          : page
      )
    }));

    // 서버 동기화
    useDashboardStore.getState().actions.saveState();
  }
  
}

// 위젯 제거 명령
export class RemoveWidgetCommand implements Command {
  private widgetId: string;
  private removedWidget: Widget | null = null;
  
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

    // 제거할 위젯만 저장 (레이아웃은 동적 생성됨)
    this.removedWidget = activePage.widgets.find(w => w.i === this.widgetId) || null;

    if (!this.removedWidget) {
      throw new Error(`Widget ${this.widgetId} not found`);
    }

    console.log(`[RemoveWidgetCommand] Removing widget: ${this.removedWidget.type}, ID: ${this.widgetId}`);

    // 위젯만 제거, 레이아웃은 동적 생성 시스템에 맡김
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: page.widgets.filter(w => w.i !== this.widgetId),
              layouts: [],
              responsiveLayouts: {},
            }
          : page
      )
    }));

    // 서버에서 위젯 삭제
    try {
      const getUserId = (): string => 'global-user';
      await deleteWidget(getUserId(), this.widgetId, activePage.id);
      console.log(`[RemoveWidgetCommand] Widget ${this.widgetId} deleted successfully`);
    } catch (error) {
      console.error(`Failed to delete widget ${this.widgetId} on server`, error);
      // 롤백: 위젯 복원
      useDashboardStore.setState(state => ({
        pages: state.pages.map((page, index) =>
          index === activePageIndex
            ? {
                ...page,
                widgets: [...page.widgets, this.removedWidget!],
                layouts: [],
                responsiveLayouts: {},
              }
            : page
        )
      }));
      throw error;
    }
  }
  
  undo(): void {
    if (!this.removedWidget) {
      throw new Error('Cannot undo: removed widget data not found');
    }

    const { activePageIndex } = useDashboardStore.getState();

    console.log(`[RemoveWidgetCommand] Undoing widget removal: ${this.removedWidget.type}, ID: ${this.widgetId}`);

    // 위젯만 복원, 레이아웃은 동적 생성 시스템에 맡김
    useDashboardStore.setState(state => ({
      pages: state.pages.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              widgets: [...page.widgets, this.removedWidget!],
              layouts: [],
              responsiveLayouts: {},
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