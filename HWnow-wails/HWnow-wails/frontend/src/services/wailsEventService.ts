// Wails Event Service for real-time monitoring data
// Replaces WebSocket-based communication with Wails runtime events

import { wailsApiService } from './wailsApiService';
import { useSystemResourceStore } from '../stores/systemResourceStore';
import type { WidgetType } from '../stores/types';

// Event system configuration
interface EventServiceConfig {
  pollingInterval: number;
  batchProcessingDelay: number;
  maxRetries: number;
  adaptivePolling: boolean;
  priorityMetrics: WidgetType[];
  performanceThreshold: number; // ms - threshold for slow operations
  errorRateThreshold: number; // percentage - threshold for adaptive polling
  backgroundPollingInterval: number; // ms - interval when app is backgrounded
  highFrequencyMetrics: string[];
  lowFrequencyMetrics: string[];
}

// GPU process batch interface
interface GPUProcessBatch {
  pid: number;
  name: string;
  gpu_usage: number;
  gpu_memory: number;
  type: string;
  command: string;
  status: string;
  priority?: string;
}

// Connection status callback type
type ConnectionStatusCallback = (connected: boolean) => void;

// Performance metrics interface
interface PerformanceMetrics {
  lastPollingTime: number;
  averageResponseTime: number;
  errorCount: number;
  successCount: number;
}

export class WailsEventService {
  private static instance: WailsEventService;
  
  // Service state
  private isRunning: boolean = false;
  private config: EventServiceConfig;
  private connectionStatusCallbacks = new Set<ConnectionStatusCallback>();
  
  // Widget-aware polling optimization
  private activeWidgets: Set<WidgetType> = new Set();
  private lastWidgetUpdate: number = 0;
  private widgetUpdateDebounceMs: number = 1000; // Debounce widget changes by 1 second
  
  // Performance tracking
  private performanceMetrics: PerformanceMetrics = {
    lastPollingTime: 0,
    averageResponseTime: 0,
    errorCount: 0,
    successCount: 0
  };
  
  // Polling intervals and timeouts
  private pollingIntervals: Map<string, number> = new Map();
  private batchTimeouts: Map<string, number> = new Map();
  
  // GPU process batch management
  private gpuProcessBatch: GPUProcessBatch[] = [];
  private gpuBatchTimeout: number | null = null;
  
  // Message queue for when service is not available
  private messageQueue: Array<() => Promise<void>> = [];
  
  // App state management
  private isAppVisible: boolean = true;
  private adaptiveIntervals: Map<string, number> = new Map();
  
  private constructor() {
    this.config = this.getDefaultConfig();
    this.initializePerformanceTracking();
    this.initializeVisibilityTracking();
  }
  
  public static getInstance(): WailsEventService {
    if (!WailsEventService.instance) {
      WailsEventService.instance = new WailsEventService();
    }
    return WailsEventService.instance;
  }
  
  private getDefaultConfig(): EventServiceConfig {
    return {
      pollingInterval: 30000, // CPU 최적화 Phase 3: 20초 → 30초 (1.5배 추가 감소)
      batchProcessingDelay: 1000,  // 배치 처리 지연 추가 증가 (CPU 부하 분산)
      maxRetries: 1, // 재시도 횟수 최소화 
      adaptivePolling: true,
      priorityMetrics: ['cpu', 'ram', 'gpu', 'gpu_process'],
      performanceThreshold: 5000, // CPU 최적화: 3초 → 5초 (더욱 관대한 임계값)
      errorRateThreshold: 50, // CPU 최적화: 40% → 50% (더욱 관대한 오류율)
      backgroundPollingInterval: 300000, // CPU 최적화 Phase 3: 1분 → 5분 (백그라운드에서 극한 감소)
      highFrequencyMetrics: ['cpu', 'ram', 'gpu_usage', 'gpu_processes'],
      lowFrequencyMetrics: ['system_info', 'disk_total', 'disk_free']
    };
  }
  
  private initializePerformanceTracking(): void {
    // CPU 최적화 Phase Final: 성능 메트릭 추적 완전 비활성화
    // 주기적인 성능 메트릭 리셋 및 적응형 폴링 비활성화로 CPU 사용률 대폭 감소
    // Performance tracking disabled for CPU optimization
    
    // 비활성화된 원본 코드 (CPU 소모 방지)
    /*
    setInterval(() => {
      if (this.performanceMetrics.successCount + this.performanceMetrics.errorCount > 0) {
        const totalRequests = this.performanceMetrics.successCount + this.performanceMetrics.errorCount;
        const successRate = (this.performanceMetrics.successCount / totalRequests * 100);
        const errorRate = (this.performanceMetrics.errorCount / totalRequests * 100);
        
        console.log('[WailsEvents] Performance metrics:', {
          successRate: successRate.toFixed(2) + '%',
          errorRate: errorRate.toFixed(2) + '%',
          averageResponseTime: this.performanceMetrics.averageResponseTime.toFixed(2) + 'ms',
          totalRequests,
          isVisible: this.isAppVisible
        });
        
        // Implement adaptive polling based on error rate
        if (this.config.adaptivePolling && errorRate > this.config.errorRateThreshold) {
          console.warn('[WailsEvents] High error rate detected, reducing polling frequency');
          this.adaptPollingForHighErrorRate();
        } else if (errorRate < 5 && this.adaptiveIntervals.size > 0) {
          // Restore normal polling if error rate is low
          console.log('[WailsEvents] Error rate normalized, restoring normal polling');
          this.restoreNormalPolling();
        }
      }
      
      // Reset counters but keep running average
      this.performanceMetrics.errorCount = 0;
      this.performanceMetrics.successCount = 0;
    }, 900000);
    */
  }
  
  private initializeVisibilityTracking(): void {
    if (typeof document !== 'undefined') {
      // Monitor app visibility for performance optimization
      document.addEventListener('visibilitychange', () => {
        const wasVisible = this.isAppVisible;
        this.isAppVisible = !document.hidden;
        
        if (wasVisible !== this.isAppVisible) {
          console.log('[WailsEvents] App visibility changed:', this.isAppVisible ? 'visible' : 'hidden');
          
          if (this.isRunning) {
            this.adaptPollingForVisibility();
          }
        }
      });
      
      // Initial state
      this.isAppVisible = !document.hidden;
    }
  }
  
  private adaptPollingForVisibility(): void {
    if (this.isAppVisible) {
      // App became visible - restore normal polling intervals
      console.log('[WailsEvents] App visible, restoring normal polling intervals');
      this.restoreNormalPolling();
    } else {
      // App hidden - reduce polling frequency to save resources
      console.log('[WailsEvents] App hidden, reducing polling frequency');
      this.reducePollingSForBackground();
    }
  }
  
  private adaptPollingForHighErrorRate(): void {
    // Increase intervals for all polling jobs when error rate is high
    this.pollingIntervals.forEach((intervalId, jobName) => {
      const currentInterval = this.config.pollingInterval;
      const newInterval = Math.min(currentInterval * 2, 15000); // Max 15 seconds
      
      if (!this.adaptiveIntervals.has(jobName)) {
        this.adaptiveIntervals.set(jobName, currentInterval);
        this.restartPollingJob(jobName, newInterval);
      }
    });
  }
  
  private restoreNormalPolling(): void {
    // Restore all polling jobs to their normal intervals
    this.adaptiveIntervals.forEach((originalInterval, jobName) => {
      this.restartPollingJob(jobName, originalInterval);
    });
    this.adaptiveIntervals.clear();
  }
  
  private reducePollingSForBackground(): void {
    // Reduce polling frequency when app is in background
    this.pollingIntervals.forEach((intervalId, jobName) => {
      if (!this.adaptiveIntervals.has(jobName)) {
        this.adaptiveIntervals.set(jobName, this.getJobPollingInterval(jobName));
      }
      
      // Use background polling interval for all jobs
      this.restartPollingJob(jobName, this.config.backgroundPollingInterval);
    });
  }
  
  private getJobPollingInterval(jobName: string): number {
    // Determine appropriate polling interval based on job type
    if (this.config.highFrequencyMetrics.some(metric => jobName.includes(metric))) {
      return this.config.pollingInterval;
    } else if (this.config.lowFrequencyMetrics.some(metric => jobName.includes(metric))) {
      return this.config.pollingInterval * 4;
    }
    return this.config.pollingInterval * 2;
  }
  
  private restartPollingJob(jobName: string, newInterval: number): void {
    // Get the appropriate polling function for the job
    const pollingFunction = this.getPollingFunction(jobName);
    if (!pollingFunction) return;
    
    // Clear existing interval
    this.clearPolling(jobName);
    
    // CPU 최적화 Phase Final: 적응형 폴링 타이머 완전 비활성화
    // 적응형 폴링으로 인한 CPU 소모 방지 - setInterval 타이머 제거
    console.log(`[WailsEvents] Adaptive polling disabled for CPU optimization: ${jobName}`);
    
    // 비활성화된 원본 코드 (CPU 소모 방지)
    // const intervalId = setInterval(pollingFunction, newInterval);
    // this.pollingIntervals.set(jobName, intervalId);
    
    console.log(`[WailsEvents] Restarted ${jobName} with ${newInterval}ms interval`);
  }
  
  private getPollingFunction(jobName: string): (() => void) | null {
    // Map job names to their polling functions
    switch (jobName) {
      case 'system_info':
        return this.createSystemInfoPoller();
      case 'realtime_metrics':
        return this.createRealTimeMetricsPoller();
      case 'gpu_info':
        return this.createGPUInfoPoller();
      case 'gpu_processes':
        return this.createGPUProcessPoller();
      case 'top_processes':
        return this.createTopProcessPoller();
      default:
        return null;
    }
  }
  
  // Public API methods
  
  public async startMonitoring(): Promise<void> {
    console.log('[WailsEvents] Starting monitoring service...');
    
    if (this.isRunning) {
      console.log('[WailsEvents] Monitoring already running');
      return;
    }
    
    try {
      console.log('[WailsEvents] Calling backend startMonitoring API...');
      // Start backend monitoring service
      const result = await wailsApiService.startMonitoring();
      console.log('[WailsEvents] Backend startMonitoring result:', result);
      if (!result.success) {
        throw new Error(result.message);
      }
      
      this.isRunning = true;
      this.notifyConnectionStatus(true);
      
      console.log('[WailsEvents] Monitoring started successfully');
      
      // SYSTEM RESTORATION: Re-enable essential polling services for widget functionality
      // Balance between CPU optimization and functional monitoring
      console.log('[WailsEvents] Starting balanced monitoring - essential services restored');
      // Enable backend GPU process collection only when needed
      try { await wailsApiService.setGPUProcessMonitoring(true); } catch {}
      this.startSystemInfoPolling();          // System info polling (5min intervals)
      this.startRealTimeMetricsPolling();     // CPU/Memory/Disk/Network (15sec intervals)
      this.startGPUInfoPolling();             // GPU hardware info (10min intervals)
      this.startGPUProcessPolling();          // GPU processes (5min intervals - existing)
      // this.startTopProcessPolling();       // Process monitoring (still disabled - optional feature)
      
    } catch (error) {
      console.error('[WailsEvents] Failed to start monitoring:', error);
      this.notifyConnectionStatus(false);
      throw error;
    }
  }
  
  public async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      console.log('[WailsEvents] Monitoring already stopped');
      return;
    }
    
    try {
      // Stop backend monitoring service
      const result = await wailsApiService.stopMonitoring();
      if (!result.success) {
        console.warn('[WailsEvents] Backend stop warning:', result.message);
      }
      
      this.isRunning = false;
      this.notifyConnectionStatus(false);
      
      // Clear all polling intervals
      this.clearAllPolling();
      
      // Disable backend GPU process collection when monitoring stops
      try { await wailsApiService.setGPUProcessMonitoring(false); } catch {}
      console.log('[WailsEvents] Monitoring stopped successfully');
      
    } catch (error) {
      console.error('[WailsEvents] Failed to stop monitoring:', error);
      // Force stop anyway
      this.isRunning = false;
      this.notifyConnectionStatus(false);
      this.clearAllPolling();
    }
  }
  
  public isConnected(): boolean {
    return this.isRunning;
  }
  
  public onConnectionStatusChange(callback: ConnectionStatusCallback): () => void {
    this.connectionStatusCallbacks.add(callback);
    
    // Immediately notify of current status
    callback(this.isRunning);
    
    // Return unsubscribe function
    return () => {
      this.connectionStatusCallbacks.delete(callback);
    };
  }
  
  public getStatus(): any {
    return {
      connected: this.isRunning,
      performanceMetrics: { ...this.performanceMetrics },
      activePollingJobs: this.pollingIntervals.size,
      queuedMessages: this.messageQueue.length,
      batchedGPUProcesses: this.gpuProcessBatch.length
    };
  }
  
  // Private polling methods
  
  private startSystemInfoPolling(): void {
    const poller = this.createSystemInfoPoller();
    this.startPollingJob('system_info', poller, 60000); // Reduced from 5 minutes to 1 minute for better UX
  }
  
  private createSystemInfoPoller(): () => Promise<void> {
    return async () => {
      if (!this.isRunning) return;
      
      try {
        const systemInfo = await this.executeWithRetry(
          () => wailsApiService.getSystemInfo(),
          'GetSystemInfo'
        );
        
        // Update store with system info (one-time data, no need for frequent updates)
        const { setData } = useSystemResourceStore.getState();
        setData('cpu_info', systemInfo.cpu_cores, systemInfo.cpu_model);
        
      } catch (error) {
        this.handlePollingError('system_info', error);
      }
    };
  }
  
  private startRealTimeMetricsPolling(): void {
    this.clearPolling('realtime_metrics');
    
    const pollRealTimeMetrics = async () => {
      if (!this.isRunning) return;
      
      try {
        const startTime = performance.now();
        const metrics = await this.executeWithRetry(
          () => wailsApiService.getRealTimeMetrics(),
          'GetRealTimeMetrics'
        );
        
        const { setData } = useSystemResourceStore.getState();
        
        // Update basic metrics
        setData('cpu', metrics.cpu_usage);
        setData('ram', metrics.memory_usage);
        
        // Update CPU core usage data
        if (metrics.cpu_core_usage && Array.isArray(metrics.cpu_core_usage)) {
          metrics.cpu_core_usage.forEach((coreUsage, index) => {
            setData(`cpu_core_${index + 1}`, coreUsage);
          });
        }
        
        // Update disk metrics
        if (metrics.disk_usage) {
          setData('disk_total', metrics.disk_usage.Total);
          setData('disk_used', metrics.disk_usage.Used);
          setData('disk_free', metrics.disk_usage.Free);
          setData('disk_usage_percent', metrics.disk_usage.UsedPercent);
        }
        
        // Update disk I/O speed metrics
        setData('disk_read', metrics.disk_read_speed || 0);
        setData('disk_write', metrics.disk_write_speed || 0);
        
        // Update network I/O speed metrics  
        setData('net_sent', metrics.net_sent_speed || 0);
        setData('net_recv', metrics.net_recv_speed || 0);
        
        // Update network interfaces status
        if (metrics.network_io && Array.isArray(metrics.network_io)) {
          metrics.network_io.forEach((iface, index) => {
            setData(`network_${iface.Name}_status`, iface.Status, iface.IpAddress);
          });
        }
        
        // Update new fields - real data only
        if (metrics.system_uptime !== undefined) {
          setData('system_uptime', metrics.system_uptime);
        }
        
        if (metrics.boot_time) {
          setData('boot_time', new Date(metrics.boot_time));
        }
        
        // GPU info - only if real data available
        if (metrics.gpu_info) {
          console.log('[WailsEvents] RealTime GPU data received:', {
            name: metrics.gpu_info.Name,
            usage: metrics.gpu_info.Usage,
            temperature: metrics.gpu_info.Temperature,
            power: metrics.gpu_info.Power,
            memory_total: metrics.gpu_info.MemoryTotal,
            memory_used: metrics.gpu_info.MemoryUsed
          });
          
          // Store GPU name both in gpu_name and gpu_info formats
          setData('gpu_name', metrics.gpu_info.Name || 'Unknown GPU');
          setData('gpu_info', 1, metrics.gpu_info.Name || 'Unknown GPU');
          // Only set usage if real data is available (not -1)
          if (metrics.gpu_info.Usage >= 0) {
            setData('gpu_usage', metrics.gpu_info.Usage);
          }
          if (metrics.gpu_info.Temperature >= 0) {
            setData('gpu_temperature', metrics.gpu_info.Temperature);
          }
          if (metrics.gpu_info.Power >= 0) {
            setData('gpu_power', metrics.gpu_info.Power);
          }
          if (metrics.gpu_info.MemoryTotal >= 0) {
            setData('gpu_memory_total', metrics.gpu_info.MemoryTotal);
          }
          if (metrics.gpu_info.MemoryUsed >= 0) {
            setData('gpu_memory_used', metrics.gpu_info.MemoryUsed);
          }
        } else {
          // No GPU info in RealTime metrics
        }
        
        // GPU processes - only if available
        if (metrics.gpu_processes && Array.isArray(metrics.gpu_processes)) {
          // RealTime GPU processes received
          const { setGPUProcesses } = useSystemResourceStore.getState();
          setGPUProcesses(metrics.gpu_processes);
        } else {
          // No GPU processes in RealTime metrics
        }
        
        // Top processes - only if available
        if (metrics.top_processes && Array.isArray(metrics.top_processes)) {
          setData('top_processes', metrics.top_processes);
        }
        
        // Memory details - only if available
        if (metrics.memory_details) {
          setData('memory_physical', metrics.memory_details.Physical);
          setData('memory_virtual', metrics.memory_details.Virtual);
          setData('memory_swap', metrics.memory_details.Swap);
        }
        
        // Battery info - only if available (desktop PCs won't have this)
        if (metrics.battery_info) {
          setData('battery_percent', metrics.battery_info.Percent);
          setData('battery_plugged', metrics.battery_info.Plugged);
        }
        
        // Network status - always available
        if (metrics.network_status) {
          setData('network_status', metrics.network_status);
        }
        
        // Track performance
        const responseTime = performance.now() - startTime;
        this.updatePerformanceMetrics(responseTime, true);
        
      } catch (error) {
        this.handlePollingError('realtime_metrics', error);
      }
    };
    
    // SYSTEM RESTORATION: Re-enable real-time metrics polling for essential widgets
    // High-frequency polling for real-time widget updates - 3 second intervals
    console.log('[WailsEvents] Real-time metrics polling restored - 3 second intervals for widgets');
    
    // Use 3-second intervals for real-time data updates
    const realTimeInterval = 3000; // 3 seconds for real-time updates
    const intervalId = setInterval(pollRealTimeMetrics, realTimeInterval);
    this.pollingIntervals.set('realtime_metrics', intervalId);
    
    // Initial call for immediate data
    pollRealTimeMetrics();
  }
  
  private startGPUInfoPolling(): void {
    this.clearPolling('gpu_info');
    
    const pollGPUInfo = async () => {
      if (!this.isRunning) return;
      
      try {
        const gpuInfo = await this.executeWithRetry(
          () => wailsApiService.getGPUInfo(),
          'GetGPUInfo'
        );
        
        const { setData } = useSystemResourceStore.getState();
        
        // Update GPU metrics (using correct field names from Go structs)
        setData('gpu_usage', gpuInfo.Usage);
        setData('gpu_memory_used', gpuInfo.MemoryUsed);
        setData('gpu_memory_total', gpuInfo.MemoryTotal);
        setData('gpu_temperature', gpuInfo.Temperature);
        setData('gpu_power', gpuInfo.Power);
        
        // GPU info with device name
        setData('gpu_info', 1, gpuInfo.Name);
        
        console.log('[WailsEvents] GPU data processed:', {
          name: gpuInfo.Name,
          usage: gpuInfo.Usage,
          memory_used: gpuInfo.MemoryUsed,
          memory_total: gpuInfo.MemoryTotal,
          temperature: gpuInfo.Temperature,
          power: gpuInfo.Power
        });
        
      } catch (error) {
        // GPU not available - do not store any fake data
        // Let widgets handle the absence of GPU data appropriately
        console.warn('[WailsEvents] GPU info not available:', error);
        
        // Clear any existing GPU data instead of setting fake values
        const { setData } = useSystemResourceStore.getState();
        // Note: Not setting any data when GPU is unavailable
        // Widgets should check for data availability before rendering
      }
    };
    
    // SYSTEM RESTORATION: Re-enable GPU info polling with 10-minute intervals
    // GPU hardware info changes infrequently - 10 minute intervals are sufficient
    console.log('[WailsEvents] GPU info polling restored - 10 minute intervals');
    
    // Use 10-minute intervals (600 seconds) for GPU hardware info
    const gpuInfoInterval = 600000; // 10 minutes
    const intervalId = setInterval(pollGPUInfo, gpuInfoInterval);
    this.pollingIntervals.set('gpu_info', intervalId);
    
    // Initial call for immediate data
    pollGPUInfo();
  }
  
  private startGPUProcessPolling(): void {
    this.clearPolling('gpu_processes');
    
    const pollGPUProcesses = async () => {
      if (!this.isRunning) return;
      
      try {
        const processes = await this.executeWithRetry(
          () => wailsApiService.getGPUProcesses(),
          'GetGPUProcesses'
        );
        
        // GPU processes received
        
        // Convert to our batch format and process
        this.gpuProcessBatch = processes.map(process => {
          
          return {
            pid: process.pid,
            name: process.name,
            gpu_usage: process.gpu_usage,
            gpu_memory: process.gpu_memory,  // Fixed: Use correct field name from backend
            type: process.type || 'gpu',     // Use actual type from backend
            command: process.command || process.name,  // Use actual command from backend
            status: process.status || 'running'        // Use actual status from backend
          };
        });
        
        // GPU processes mapped to store
        
        // Process batch immediately
        this.processGPUProcessBatch();
        
      } catch (error) {
        this.handlePollingError('gpu_processes', error);
        
        // Do not clear or set empty array - let widget handle absence of data
        console.warn('[WailsEvents] GPU processes unavailable, not setting fake data');
      }
    };
    
    // Phase 16.3.1: GPU 폴링 5분 간격으로 복구 (minimal CPU impact)
    console.log('[WailsEvents] Starting minimal GPU process polling (5min interval)...');
    
    // 5분 간격으로 GPU 프로세스 폴링 활성화
    // Initial call은 startPollingJob 내부에서 자동으로 실행됨
    this.startPollingJob('gpu_processes', pollGPUProcesses, 300000); // 5분 간격 (300초)
  }
  
  private startTopProcessPolling(): void {
    console.log('[WailsEvents] Starting top process polling...');
    this.clearPolling('top_processes');
    
    const pollTopProcesses = async () => {
      if (!this.isRunning) {
        console.log('[WailsEvents] Polling stopped - service not running');
        return;
      }
      
      console.log('[WailsEvents] Executing top process polling...');
      
      try {
        const processes = await this.executeWithRetry(
          () => wailsApiService.getTopProcesses(10),
          'GetTopProcesses'
        );
        
        const { setData } = useSystemResourceStore.getState();
        
        console.log('[WailsEvents] Raw process data received:', processes);
        
        // Convert process data to match ProcessMonitorWidget expectations
        // Backend Go struct uses: Name, PID, CPUPercent, MemoryPercent
        // Frontend API interface uses: name, pid, cpu_usage, memory_usage  
        const processData = processes.map(process => {
          // Handle both possible field formats
          const convertedProcess = {
            Name: process.Name || process.name || 'Unknown',
            PID: process.PID || process.pid || 0,
            CPUPercent: process.CPUPercent || process.cpu_usage || 0,
            MemoryPercent: process.MemoryPercent || process.memory_usage || 0
          };
          console.log('[WailsEvents] Converted process:', convertedProcess);
          return convertedProcess;
        });
        
        console.log('[WailsEvents] Final processData to store:', processData);
        
        // Store as top_processes array for ProcessMonitorWidget
        setData('top_processes', processData);
        
      } catch (error) {
        this.handlePollingError('top_processes', error);
      }
    };
    
    // CPU 최적화 Phase Final: Top 프로세스 폴링 완전 비활성화
    // Top 프로세스 폴링으로 인한 CPU 소모 방지 - setInterval 타이머 제거
    console.log('[WailsEvents] Top process polling disabled for CPU optimization');
    
    // 비활성화된 원본 코드 (CPU 소모 방지)
    // const intervalId = setInterval(pollTopProcesses, this.config.pollingInterval * 15);
    // this.pollingIntervals.set('top_processes', intervalId);
    // pollTopProcesses();
    pollTopProcesses();
  }
  
  // Utility methods
  
  private startPollingJob(jobName: string, poller: () => Promise<void>, interval: number): void {
    this.clearPolling(jobName);
    
    // Create wrapper to handle sync vs async polling functions
    const wrappedPoller = () => {
      poller().catch(error => {
        console.error(`[WailsEvents] Unhandled error in ${jobName} poller:`, error);
      });
    };
    
    // SYSTEM RESTORATION: Allow essential polling jobs with optimized intervals
    // Balance CPU optimization with widget functionality
    let finalInterval = interval;
    
    // Adjust intervals based on job type for optimal performance
    switch (jobName) {
      case 'gpu_processes':
        // GPU processes: 5 minute intervals (existing behavior)
        finalInterval = Math.max(interval * 10, 300000);
        break;
      case 'system_info':
        // System info: Use provided interval (now 1 minute for better UX)
        finalInterval = interval;
        break;
      case 'gpu_info':
        // GPU hardware info: 10 minute intervals (changes rarely)
        finalInterval = Math.max(interval, 600000);
        break;
      case 'realtime_metrics':
        // Real-time metrics: 3 second intervals (essential for widgets)
        finalInterval = Math.max(interval, 3000);
        break;
      default:
        // Other jobs: use provided interval
        finalInterval = interval;
    }
    
    const intervalId = setInterval(wrappedPoller, finalInterval);
    this.pollingIntervals.set(jobName, intervalId);
    console.log(`[WailsEvents] Polling job '${jobName}' restored with ${finalInterval/1000}s interval`);
    
    // Initial call
    wrappedPoller();
  }
  
  private clearPolling(jobName: string): void {
    const intervalId = this.pollingIntervals.get(jobName);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(jobName);
    }
  }
  
  private clearAllPolling(): void {
    this.pollingIntervals.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    this.pollingIntervals.clear();
    
    // Clear batch timeouts
    this.batchTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.batchTimeouts.clear();
    
    // Clear GPU batch timeout
    if (this.gpuBatchTimeout) {
      clearTimeout(this.gpuBatchTimeout);
      this.gpuBatchTimeout = null;
    }
  }
  
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries) {
          const delay = 100 * Math.pow(2, attempt - 1); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }
  
  private processGPUProcessBatch(): void {
    const { setGPUProcesses } = useSystemResourceStore.getState();
    
    // Processing GPU batch
    
    if (this.gpuProcessBatch.length > 0) {
      // Convert our batch format to store format
      const processesForStore = this.gpuProcessBatch.map(process => ({
        pid: process.pid,
        name: process.name,
        gpu_usage: process.gpu_usage,
        gpu_memory: process.gpu_memory,
        type: process.type,
        command: process.command,
        status: process.status
      }));
      
      // GPU processes updated in store
      setGPUProcesses(processesForStore);
    } else {
      // No GPU processes in batch
    }
    
    // Clear batch
    this.gpuProcessBatch = [];
  }
  
  private notifyConnectionStatus(connected: boolean): void {
    this.connectionStatusCallbacks.forEach(callback => callback(connected));
  }
  
  private updatePerformanceMetrics(responseTime: number, success: boolean): void {
    if (success) {
      this.performanceMetrics.successCount++;
      
      // Update running average response time
      const totalRequests = this.performanceMetrics.successCount + this.performanceMetrics.errorCount;
      this.performanceMetrics.averageResponseTime = 
        (this.performanceMetrics.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
      
    } else {
      this.performanceMetrics.errorCount++;
    }
    
    this.performanceMetrics.lastPollingTime = Date.now();
  }
  
  private handlePollingError(jobName: string, error: unknown): void {
    console.error(`[WailsEvents] ${jobName} polling error:`, error);
    this.updatePerformanceMetrics(0, false);
    
    // Implement adaptive polling on errors
    if (this.config.adaptivePolling) {
      this.adaptPollingInterval(jobName, false);
    }
  }
  
  private adaptPollingInterval(jobName: string, successful: boolean): void {
    // Simple adaptive polling - slow down on errors, speed up on success
    const currentInterval = this.pollingIntervals.get(jobName);
    if (!currentInterval) return;
    
    let newInterval = this.config.pollingInterval;
    
    if (!successful) {
      // Slow down on errors
      newInterval = Math.min(this.config.pollingInterval * 2, 10000);
    } else {
      // Return to normal speed on success
      newInterval = this.config.pollingInterval;
    }
    
    // Update interval if changed significantly
    if (Math.abs(newInterval - this.config.pollingInterval) > 500) {
      this.clearPolling(jobName);
      
      // Restart with new interval (simplified - would need more robust implementation)
      console.log(`[WailsEvents] Adapting ${jobName} polling interval to ${newInterval}ms`);
    }
  }
  
  // Widget-aware polling optimization methods
  public updateActiveWidgets(widgets: WidgetType[]): void {
    const newWidgets = new Set(widgets);
    const hasChanged = widgets.length !== this.activeWidgets.size || 
                      widgets.some(w => !this.activeWidgets.has(w));
                      
    if (hasChanged) {
      console.log('[WailsEvents] Active widgets changed:', widgets);
      this.activeWidgets = newWidgets;
      this.lastWidgetUpdate = Date.now();
      this.optimizePollingForWidgets();
    }
  }
  
  private optimizePollingForWidgets(): void {
    if (!this.isRunning) return;
    
    console.log('[WailsEvents] Optimizing polling for active widgets:', Array.from(this.activeWidgets));
    
    // Clear all current polling to restart with optimized intervals
    this.clearAllPolling();
    
    // Start optimized polling based on active widgets
    this.startOptimizedPolling();
  }
  
  private startOptimizedPolling(): void {
    const needsSystemInfo = this.activeWidgets.has('system_info');
    const needsRealTimeMetrics = this.needsRealTimeMetrics();
    const needsGPUInfo = this.needsGPUInfo();
    const needsGPUProcesses = this.activeWidgets.has('gpu_process');
    const needsTopProcesses = this.activeWidgets.has('process_monitor');
    
    console.log('[WailsEvents] Active widgets check:', {
      activeWidgets: Array.from(this.activeWidgets),
      needsTopProcesses,
      hasProcessMonitor: this.activeWidgets.has('process_monitor')
    });
    
    // Only start polling for data that is actually needed
    if (needsSystemInfo) {
      this.startSystemInfoPolling();
    }
    
    if (needsRealTimeMetrics) {
      this.startRealTimeMetricsPolling();
    }
    
    if (needsGPUInfo) {
      this.startGPUInfoPolling();
    }
    
    if (needsGPUProcesses) {
      // Ensure backend collection is enabled when GPU widget is active
      wailsApiService.setGPUProcessMonitoring(true).catch(() => {});
      this.startGPUProcessPolling();
    } else {
      // Disable backend collection if not needed
      wailsApiService.setGPUProcessMonitoring(false).catch(() => {});
    }
    
    if (needsTopProcesses) {
      console.log('[WailsEvents] Starting top processes polling due to process_monitor widget');
      this.startTopProcessPolling();
    } else {
      console.log('[WailsEvents] Skipping top processes polling - no process_monitor widgets found');
    }
    
    console.log(`[WailsEvents] Started optimized polling jobs - SystemInfo:${needsSystemInfo}, RealTime:${needsRealTimeMetrics}, GPU:${needsGPUInfo}, GPUProc:${needsGPUProcesses}, TopProc:${needsTopProcesses}`);
  }
  
  private needsRealTimeMetrics(): boolean {
    return this.activeWidgets.has('cpu') || 
           this.activeWidgets.has('ram') || 
           this.activeWidgets.has('disk_space') ||
           this.activeWidgets.has('network_monitor');
  }
  
  private needsGPUInfo(): boolean {
    return this.activeWidgets.has('gpu') || 
           this.activeWidgets.has('gpu_process');
  }
  
  public updateConfig(newConfig: Partial<EventServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart polling with new configuration if running
    if (this.isRunning) {
      console.log('[WailsEvents] Restarting polling with new configuration');
      this.clearAllPolling();
      
      setTimeout(() => {
        // CPU OPTIMIZATION: Only restart essential GPU process polling
        console.log('[WailsEvents] Config updated - restarting minimal GPU polling only');
        // this.startSystemInfoPolling();        // DISABLED for CPU optimization
        // this.startRealTimeMetricsPolling();   // DISABLED for CPU optimization
        // this.startGPUInfoPolling();           // DISABLED for CPU optimization
        this.startGPUProcessPolling();           // ONLY essential GPU process polling
        // this.startTopProcessPolling();        // DISABLED for CPU optimization
      }, 100);
    }
  }
  
  public cleanup(): void {
    this.clearAllPolling();
    this.connectionStatusCallbacks.clear();
    this.messageQueue = [];
    this.gpuProcessBatch = [];
    this.isRunning = false;
  }
}

// Export singleton instance
export const wailsEventService = WailsEventService.getInstance();

// Legacy API compatibility functions
export const initWebSocket = () => {
  console.log('[WailsEvents] initWebSocket called - starting monitoring...');
  return wailsEventService.startMonitoring();
};
export const isWebSocketConnected = () => wailsEventService.isConnected();
export const onConnectionStatusChange = (callback: ConnectionStatusCallback) => 
  wailsEventService.onConnectionStatusChange(callback);
export const reconnectWebSocket = () => wailsEventService.startMonitoring();
export const getWebSocketStatus = () => wailsEventService.getStatus();
export const cleanup = () => wailsEventService.cleanup();

// Event-specific functions
export const sendMessage = (message: object) => {
  console.warn('[WailsEvents] sendMessage is deprecated in event-based system', message);
  return false;
};
export const flushGPUProcessBatch = () => {
  console.log('[WailsEvents] GPU process batching is handled automatically');
};
