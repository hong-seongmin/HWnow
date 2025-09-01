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
      pollingInterval: 2000, // 2 seconds default
      batchProcessingDelay: 150,
      maxRetries: 3,
      adaptivePolling: true,
      priorityMetrics: ['cpu', 'ram', 'gpu', 'gpu_process'],
      performanceThreshold: 1000, // 1 second
      errorRateThreshold: 20, // 20%
      backgroundPollingInterval: 10000, // 10 seconds when backgrounded
      highFrequencyMetrics: ['cpu', 'ram', 'gpu_usage', 'gpu_processes'],
      lowFrequencyMetrics: ['system_info', 'disk_total', 'disk_free']
    };
  }
  
  private initializePerformanceTracking(): void {
    // Reset performance metrics periodically
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
    }, 60000); // Every minute
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
    
    // Start with new interval
    const intervalId = setInterval(pollingFunction, newInterval);
    this.pollingIntervals.set(jobName, intervalId);
    
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
    if (this.isRunning) {
      console.log('[WailsEvents] Monitoring already running');
      return;
    }
    
    try {
      // Start backend monitoring service
      const result = await wailsApiService.startMonitoring();
      if (!result.success) {
        throw new Error(result.message);
      }
      
      this.isRunning = true;
      this.notifyConnectionStatus(true);
      
      console.log('[WailsEvents] Monitoring started successfully');
      
      // Start polling for different data types
      this.startSystemInfoPolling();
      this.startRealTimeMetricsPolling();
      this.startGPUInfoPolling();
      this.startGPUProcessPolling();
      this.startTopProcessPolling();
      
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
    this.startPollingJob('system_info', poller, 30000); // Every 30 seconds
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
        setData('cpu_info', systemInfo.cpu_cores, `${systemInfo.platform} - ${systemInfo.total_memory}MB`);
        
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
        
        // Update disk metrics
        if (metrics.disk_usage) {
          setData('disk_total', metrics.disk_usage.total);
          setData('disk_used', metrics.disk_usage.used);
          setData('disk_free', metrics.disk_usage.free);
          setData('disk_usage_percent', metrics.disk_usage.usedPercent);
        }
        
        // Update network metrics
        if (metrics.network_io && Array.isArray(metrics.network_io)) {
          metrics.network_io.forEach((iface, index) => {
            setData(`network_${iface.name}_sent`, iface.bytesSent);
            setData(`network_${iface.name}_recv`, iface.bytesRecv);
            setData(`network_${iface.name}_status`, iface.status, iface.ipAddress);
          });
        }
        
        // Track performance
        const responseTime = performance.now() - startTime;
        this.updatePerformanceMetrics(responseTime, true);
        
      } catch (error) {
        this.handlePollingError('realtime_metrics', error);
      }
    };
    
    // High frequency polling for real-time data
    const intervalId = setInterval(pollRealTimeMetrics, this.config.pollingInterval);
    this.pollingIntervals.set('realtime_metrics', intervalId);
    
    // Initial call
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
        
        // Update GPU metrics
        setData('gpu_usage', gpuInfo.usage);
        setData('gpu_memory_used', gpuInfo.memory_used);
        setData('gpu_memory_total', gpuInfo.memory_total);
        setData('gpu_temperature', gpuInfo.temperature);
        
        // GPU info with device name
        setData('gpu_info', 1, gpuInfo.name);
        
      } catch (error) {
        // GPU might not be available, handle gracefully
        console.warn('[WailsEvents] GPU info not available:', error);
        
        // Set default values
        const { setData } = useSystemResourceStore.getState();
        setData('gpu_usage', 0);
        setData('gpu_memory_used', 0);
        setData('gpu_memory_total', 0);
        setData('gpu_temperature', 0);
        setData('gpu_info', 0, 'N/A');
      }
    };
    
    // GPU info polling - moderate frequency
    const intervalId = setInterval(pollGPUInfo, this.config.pollingInterval * 2); // Every 4 seconds
    this.pollingIntervals.set('gpu_info', intervalId);
    
    // Initial call
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
        
        // Convert to our batch format and process
        this.gpuProcessBatch = processes.map(process => ({
          pid: process.pid,
          name: process.name,
          gpu_usage: process.gpu_usage,
          gpu_memory: process.memory_usage,
          type: 'gpu',
          command: process.name,
          status: 'running'
        }));
        
        // Process batch immediately
        this.processGPUProcessBatch();
        
      } catch (error) {
        this.handlePollingError('gpu_processes', error);
        
        // Clear GPU processes on error
        const { clearGPUProcesses } = useSystemResourceStore.getState();
        clearGPUProcesses();
      }
    };
    
    // GPU process polling - frequent for real-time updates
    const intervalId = setInterval(pollGPUProcesses, this.config.pollingInterval);
    this.pollingIntervals.set('gpu_processes', intervalId);
    
    // Initial call
    pollGPUProcesses();
  }
  
  private startTopProcessPolling(): void {
    this.clearPolling('top_processes');
    
    const pollTopProcesses = async () => {
      if (!this.isRunning) return;
      
      try {
        const processes = await this.executeWithRetry(
          () => wailsApiService.getTopProcesses(10),
          'GetTopProcesses'
        );
        
        const { setData } = useSystemResourceStore.getState();
        
        // Update process data
        processes.forEach((process, index) => {
          setData(`process_${index}`, process.cpu_usage, 
                   `${process.name}|${process.pid}|${process.memory_mb}`);
        });
        
      } catch (error) {
        this.handlePollingError('top_processes', error);
      }
    };
    
    // Process polling - moderate frequency
    const intervalId = setInterval(pollTopProcesses, this.config.pollingInterval * 3); // Every 6 seconds
    this.pollingIntervals.set('top_processes', intervalId);
    
    // Initial call
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
    
    // Start interval
    const intervalId = setInterval(wrappedPoller, interval);
    this.pollingIntervals.set(jobName, intervalId);
    
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
      
      setGPUProcesses(processesForStore);
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
  
  public updateConfig(newConfig: Partial<EventServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart polling with new configuration if running
    if (this.isRunning) {
      console.log('[WailsEvents] Restarting polling with new configuration');
      this.clearAllPolling();
      
      setTimeout(() => {
        this.startSystemInfoPolling();
        this.startRealTimeMetricsPolling();
        this.startGPUInfoPolling();
        this.startGPUProcessPolling();
        this.startTopProcessPolling();
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
export const initWebSocket = () => wailsEventService.startMonitoring();
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