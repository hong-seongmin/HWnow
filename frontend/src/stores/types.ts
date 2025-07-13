import type { Layout } from 'react-grid-layout';

// Widget types
export type WidgetType = 'cpu' | 'ram' | 'disk_read' | 'disk_write' | 'net_sent' | 'net_recv' | 'cpu_temp';

// 위젯 설정 타입
export interface WidgetConfig {
  chartType?: 'line' | 'area' | 'bar' | 'gauge';
  color?: string;
  dataPoints?: number;
  unit?: string;
  showGraph?: boolean; // 그래프 표시 여부
  showUsedMemory?: boolean;
  showTotalMemory?: boolean;
  showPercentage?: boolean;
  updateInterval?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  [key: string]: any; // 추가 설정을 위한 인덱스 시그니처
}

// DB에 저장되는 위젯의 상태
export interface WidgetState {
  userId: string;
  widgetId: string;
  widgetType: WidgetType;
  config: string; // JSON string for widget-specific config
  layout?: string; // JSON string for layout info
}

// 프론트엔드에서 사용하는 위젯 객체
export interface Widget {
  i: string;
  type: WidgetType;
  config?: WidgetConfig; // 위젯별 설정 추가
}

export interface Page {
  id: string;
  name: string;
  widgets: Widget[];
  layouts: Layout[];
}

export interface DashboardState {
  pages: Page[];
  activePageIndex: number;
  isInitialized: boolean;
  actions: {
    initialize: () => void;
    addPage: () => void;
    removePage: (pageId: string) => void;
    setActivePageIndex: (index: number) => void;
    updatePageName: (pageId: string, name: string) => void;
    
    addWidget: (type: WidgetType) => void;
    removeWidget: (widgetId: string) => void;
    updateLayout: (layouts: Layout[]) => void;
    updateWidgetConfig: (widgetId: string, config: Partial<WidgetConfig>) => void;
    
    saveState: () => void;
    resetState: () => void;
  };
} 