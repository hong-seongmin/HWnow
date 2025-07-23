import type { Layout } from 'react-grid-layout';

// Widget types
export type WidgetType = 'cpu' | 'ram' | 'disk_read' | 'disk_write' | 'net_sent' | 'net_recv' | 
  'gpu' | 'system_uptime' | 'process_monitor' | 'battery' | 'disk_space' | 'network_status' | 
  'memory_detail' | 'system_log';

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
  
  // CPU 위젯
  showCoreUsage?: boolean;
  
  // 디스크 관련
  showReadSpeed?: boolean;
  showWriteSpeed?: boolean;
  showTotalSpace?: boolean;
  showFreeSpace?: boolean;
  
  // 네트워크 관련
  showSentSpeed?: boolean;
  showRecvSpeed?: boolean;
  showTotalSent?: boolean;
  showTotalRecv?: boolean;
  
  // GPU 위젯
  showGpuMemory?: boolean;
  showGpuTemperature?: boolean;
  showGpuPower?: boolean;
  
  // 프로세스 모니터링
  processCount?: number;
  sortBy?: 'cpu' | 'memory' | 'name';
  
  // 배터리 위젯
  showBatteryTime?: boolean;
  showChargingStatus?: boolean;
  
  // 메모리 상세
  showPhysicalMemory?: boolean;
  showVirtualMemory?: boolean;
  showSwapMemory?: boolean;
  
  // 시스템 로그
  logCount?: number;
  logLevel?: 'all' | 'error' | 'warning' | 'info';
  
  // 네트워크 상태
  showIpAddress?: boolean;
  showConnectionStatus?: boolean;
  showBandwidth?: boolean;
  
  [key: string]: any; // 추가 설정을 위한 인덱스 시그니처
}

// DB에 저장되는 위젯의 상태
export interface WidgetState {
  userId: string;
  pageId: string;
  widgetId: string;
  widgetType: WidgetType;
  config: string; // JSON string for widget-specific config
  layout?: string; // JSON string for layout info
}

// DB에 저장되는 페이지 정보
export interface PageState {
  pageId: string;
  userId: string;
  pageName: string;
  pageOrder: number;
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
    updateLayout: (layouts: Layout[]) => Promise<void>;
    updateWidgetConfig: (widgetId: string, config: Partial<WidgetConfig>) => void;
    
    saveState: () => void;
    saveStateImmediate: () => Promise<void>;
    resetState: () => void;
  };
} 