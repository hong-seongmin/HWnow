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

// ?„ì ¯ ?¤ì • ?€??
export interface WidgetConfig {
  chartType?: 'line' | 'area' | 'bar' | 'gauge';
  color?: string;
  dataPoints?: number;
  unit?: string;
  showGraph?: boolean; // ê·¸ë˜???œì‹œ ?¬ë?
  showUsedMemory?: boolean;
  showTotalMemory?: boolean;
  showPercentage?: boolean;
  updateInterval?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  
  // CPU ?„ì ¯
  showCoreUsage?: boolean;
  
  // ?”ìŠ¤??ê´€??
  showReadSpeed?: boolean;
  showWriteSpeed?: boolean;
  showTotalSpace?: boolean;
  showFreeSpace?: boolean;
  
  // ?¤íŠ¸?Œí¬ ê´€??
  showSentSpeed?: boolean;
  showRecvSpeed?: boolean;
  showTotalSent?: boolean;
  showTotalRecv?: boolean;
  
  // GPU ?„ì ¯
  showGpuMemory?: boolean;
  showGpuTemperature?: boolean;
  showGpuPower?: boolean;
  
  // ?„ë¡œ?¸ìŠ¤ ëª¨ë‹ˆ?°ë§
  processCount?: number;
  sortBy?: 'cpu' | 'memory' | 'name';
  
  // GPU ?„ë¡œ?¸ìŠ¤ ëª¨ë‹ˆ?°ë§ (ê¸°ë³¸ ?¤ì •)
  gpuProcessCount?: number;
  gpuSortBy?: 'gpu_usage_percent' | 'gpu_memory_mb' | 'name' | 'pid' | 'type' | 'status';
  gpuSortOrder?: 'asc' | 'desc';
  
  // GPU ?„ë¡œ?¸ìŠ¤ ?„í„°ë§?
  gpuFilterEnabled?: boolean;
  gpuUsageThreshold?: number;
  gpuMemoryThreshold?: number;
  gpuFilterType?: 'and' | 'or';
  
  // GPU ?„ë¡œ?¸ìŠ¤ ?¤ì‹œê°??…ë°?´íŠ¸
  gpuShowUpdateIndicators?: boolean;
  gpuEnableUpdateAnimations?: boolean;
  gpuUpdateInterval?: number;
  
  // GPU ?„ë¡œ?¸ìŠ¤ ?œê°???¼ë“œë°?
  gpuShowStatusColors?: boolean;
  gpuShowUsageGradients?: boolean;
  gpuShowProcessIcons?: boolean;
  gpuShowStatusAnimations?: boolean;
  
  // GPU ?„ë¡œ?¸ìŠ¤ ?œì–´
  gpuEnableProcessControl?: boolean;
  gpuShowControlButtons?: boolean;
  gpuEnableContextMenu?: boolean;
  gpuRequireConfirmation?: boolean;
  
  // GPU ?„ë¡œ?¸ìŠ¤ ?œì‹œ
  gpuShowProcessPriority?: boolean;
  gpuShowProcessCommand?: boolean;
  gpuShowLastUpdateTime?: boolean;
  gpuCompactView?: boolean;
  gpuShowTerminateButton?: boolean;
  gpuRefreshInterval?: number;
  
  // ë°°í„°ë¦??„ì ¯
  showBatteryTime?: boolean;
  showChargingStatus?: boolean;
  
  // ë©”ëª¨ë¦??ì„¸
  showPhysicalMemory?: boolean;
  showVirtualMemory?: boolean;
  showSwapMemory?: boolean;
  
  // ?œìŠ¤??ë¡œê·¸
  logCount?: number;
  logLevel?: 'all' | 'error' | 'warning' | 'info';
  
  // ?¤íŠ¸?Œí¬ ?íƒœ
  showIpAddress?: boolean;
  showConnectionStatus?: boolean;
  showBandwidth?: boolean;
  
  [key: string]: any; // ì¶”ê? ?¤ì •???„í•œ ?¸ë±???œê·¸?ˆì²˜
}

// DB???€?¥ë˜???„ì ¯???íƒœ
export interface WidgetState {
  userId: string;
  pageId: string;
  widgetId: string;
  widgetType: WidgetType;
  config: string | WidgetConfig | Record<string, any>; // JSON string or object for widget-specific config
  layout?: string | Record<string, any>; // JSON string or object for layout info
}

// DB???€?¥ë˜???˜ì´ì§€ ?•ë³´
export interface PageState {
  pageId: string;
  userId: string;
  pageName: string;
  pageOrder: number;
}

// ?„ë¡ ?¸ì—”?œì—???¬ìš©?˜ëŠ” ?„ì ¯ ê°ì²´
export interface Widget {
  i: string;
  type: WidgetType;
  config?: WidgetConfig; // ?„ì ¯ë³??¤ì • ì¶”ê?
  position?: { [key in Breakpoint]?: Layout }; // ê°?ë¸Œë ˆ?´í¬?¬ì¸?¸ë³„ Layout ê°ì²´ (ë°°ì—´???„ë‹˜)
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
