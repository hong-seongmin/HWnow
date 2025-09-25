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

// ?�젯 ?�정 ?�??
export interface WidgetConfig {
  chartType?: 'line' | 'area' | 'bar' | 'gauge';
  color?: string;
  dataPoints?: number;
  unit?: string;
  showGraph?: boolean; // 그래???�시 ?��?
  showUsedMemory?: boolean;
  showTotalMemory?: boolean;
  showPercentage?: boolean;
  updateInterval?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  
  // CPU ?�젯
  showCoreUsage?: boolean;
  
  // ?�스??관??
  showReadSpeed?: boolean;
  showWriteSpeed?: boolean;
  showTotalSpace?: boolean;
  showFreeSpace?: boolean;
  
  // ?�트?�크 관??
  showSentSpeed?: boolean;
  showRecvSpeed?: boolean;
  showTotalSent?: boolean;
  showTotalRecv?: boolean;
  
  // GPU ?�젯
  showGpuMemory?: boolean;
  showGpuTemperature?: boolean;
  showGpuPower?: boolean;
  
  // ?�로?�스 모니?�링
  processCount?: number;
  sortBy?: 'cpu' | 'memory' | 'name';
  
  // GPU ?�로?�스 모니?�링 (기본 ?�정)
  gpuProcessCount?: number;
  gpuSortBy?: 'gpu_usage_percent' | 'gpu_memory_mb' | 'name' | 'pid' | 'type' | 'status';
  gpuSortOrder?: 'asc' | 'desc';
  
  // GPU ?�로?�스 ?�터�?
  gpuFilterEnabled?: boolean;
  gpuUsageThreshold?: number;
  gpuMemoryThreshold?: number;
  gpuFilterType?: 'and' | 'or';
  
  // GPU ?�로?�스 ?�시�??�데?�트
  gpuShowUpdateIndicators?: boolean;
  gpuEnableUpdateAnimations?: boolean;
  gpuUpdateInterval?: number;
  
  // GPU ?�로?�스 ?�각???�드�?
  gpuShowStatusColors?: boolean;
  gpuShowUsageGradients?: boolean;
  gpuShowProcessIcons?: boolean;
  gpuShowStatusAnimations?: boolean;
  
  // GPU ?�로?�스 ?�어
  gpuEnableProcessControl?: boolean;
  gpuShowControlButtons?: boolean;
  gpuEnableContextMenu?: boolean;
  gpuRequireConfirmation?: boolean;
  
  // GPU ?�로?�스 ?�시
  gpuShowProcessPriority?: boolean;
  gpuShowProcessCommand?: boolean;
  gpuShowLastUpdateTime?: boolean;
  gpuCompactView?: boolean;
  gpuShowTerminateButton?: boolean;
  gpuRefreshInterval?: number;
  
  // 배터�??�젯
  showBatteryTime?: boolean;
  showChargingStatus?: boolean;
  
  // 메모�??�세
  showPhysicalMemory?: boolean;
  showVirtualMemory?: boolean;
  showSwapMemory?: boolean;
  
  // ?�스??로그
  logCount?: number;
  logLevel?: 'all' | 'error' | 'warning' | 'info';
  
  // ?�트?�크 ?�태
  showIpAddress?: boolean;
  showConnectionStatus?: boolean;
  showBandwidth?: boolean;
  
  [key: string]: any; // 추�? ?�정???�한 ?�덱???�그?�처
}

// DB???�?�되???�젯???�태
export interface WidgetState {
  userId: string;
  pageId: string;
  widgetId: string;
  widgetType: WidgetType;
  config: string | WidgetConfig | Record<string, any>; // JSON string or object for widget-specific config
  layout?: string | Record<string, any>; // JSON string or object for layout info
}

// DB???�?�되???�이지 ?�보
export interface PageState {
  pageId: string;
  userId: string;
  pageName: string;
  pageOrder: number;
}

// ?�론?�엔?�에???�용?�는 ?�젯 객체
export interface Widget {
  i: string;
  type: WidgetType;
  config?: WidgetConfig; // ?�젯�??�정 추�?
  position?: { [key in Breakpoint]?: Layout }; // �?브레?�크?�인?�별 Layout 객체 (배열???�님)
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
    updateWidgetPosition: (widgetId: string, breakpoint: Breakpoint, layoutItem: Layout) => void;
    
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
