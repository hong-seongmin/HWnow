import type { Layout } from 'react-grid-layout';

// Responsive breakpoints
export type Breakpoint = 'lg' | 'md' | 'sm' | 'xs' | 'xxs';

// Responsive layouts for different screen sizes
export type ResponsiveLayouts = {
  [key in Breakpoint]?: Layout[];
};

// Widget types
export type WidgetType = 'cpu' | 'ram' | 'disk_read' | 'disk_write' | 'net_sent' | 'net_recv' | 
  'gpu' | 'gpu_process' | 'system_uptime' | 'process_monitor' | 'battery' | 'disk_space' | 'network_status' | 
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
  
  // GPU 프로세스 모니터링 (기본 설정)
  gpuProcessCount?: number;
  gpuSortBy?: 'gpu_usage_percent' | 'gpu_memory_mb' | 'name' | 'pid' | 'type' | 'status';
  gpuSortOrder?: 'asc' | 'desc';
  
  // GPU 프로세스 필터링
  gpuFilterEnabled?: boolean;
  gpuUsageThreshold?: number;
  gpuMemoryThreshold?: number;
  gpuFilterType?: 'and' | 'or';
  
  // GPU 프로세스 실시간 업데이트
  gpuShowUpdateIndicators?: boolean;
  gpuEnableUpdateAnimations?: boolean;
  gpuUpdateInterval?: number;
  
  // GPU 프로세스 시각적 피드백
  gpuShowStatusColors?: boolean;
  gpuShowUsageGradients?: boolean;
  gpuShowProcessIcons?: boolean;
  gpuShowStatusAnimations?: boolean;
  
  // GPU 프로세스 제어
  gpuEnableProcessControl?: boolean;
  gpuShowControlButtons?: boolean;
  gpuEnableContextMenu?: boolean;
  gpuRequireConfirmation?: boolean;
  
  // GPU 프로세스 표시
  gpuShowProcessPriority?: boolean;
  gpuShowProcessCommand?: boolean;
  gpuShowLastUpdateTime?: boolean;
  gpuCompactView?: boolean;
  gpuShowTerminateButton?: boolean;
  gpuRefreshInterval?: number;
  
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
  position?: ResponsiveLayouts; // 각 브레이크포인트별 고정 위치 정보
}

export interface Page {
  id: string;
  name: string;
  widgets: Widget[];
  layouts: Layout[]; // Legacy support - will be converted to responsiveLayouts
  responsiveLayouts?: ResponsiveLayouts; // New responsive layout support
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
    updatePage: (pageId: string, updatedPage: Page) => void;

    addWidget: (type: WidgetType) => void;
    removeWidget: (widgetId: string) => void;
    updateLayout: (layouts: Layout[]) => Promise<void>;
    updateResponsiveLayouts: (responsiveLayouts: ResponsiveLayouts) => Promise<void>;
    updateWidgetConfig: (widgetId: string, config: Partial<WidgetConfig>) => void;
    
    saveState: () => void;
    saveStateImmediate: () => Promise<void>;
    resetState: () => void;
  };
}

// Enhanced Dashboard State with Wails integration
export interface WailsDashboardState extends DashboardState {
  _wailsMetadata: {
    isWailsEnvironment: boolean;
    isOnline: boolean;
    lastSyncTime: number;
    pendingOperations: Array<{
      id: string;
      operation: string;
      data: any;
      timestamp: number;
    }>;
    performanceMetrics: {
      operationCount: number;
      averageResponseTime: number;
      errorCount: number;
      lastOperation: string;
      lastOperationTime: number;
    };
  };
} 