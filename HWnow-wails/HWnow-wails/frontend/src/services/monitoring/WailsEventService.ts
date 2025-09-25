// Refactored Wails Event Service - Main Coordinator
import type { WidgetType } from '../../stores/types';
import { ConfigService } from './EventServiceConfig';
import { PerformanceMonitor } from './PerformanceMonitor';
import { PollingManager, type PollingJob } from './PollingManager';
import { GPUProcessManager } from './GPUProcessManager';
import { SystemMetricsPoller } from './SystemMetricsPoller';
import { ConnectionManager, type ConnectionStatusCallback } from './ConnectionManager';

export class WailsEventService {
  private static instance: WailsEventService;

  // Service modules
  private configService: ConfigService;
  private performanceMonitor: PerformanceMonitor;
  private pollingManager: PollingManager;
  private gpuProcessManager: GPUProcessManager;
  private systemMetricsPoller: SystemMetricsPoller;
  private connectionManager: ConnectionManager;

  // Service state
  private isRunning: boolean = false;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.pollingManager = PollingManager.getInstance();
    this.gpuProcessManager = GPUProcessManager.getInstance();
    this.systemMetricsPoller = SystemMetricsPoller.getInstance();
    this.connectionManager = ConnectionManager.getInstance();

    this.initializePollingJobs();
  }

  public static getInstance(): WailsEventService {
    if (!WailsEventService.instance) {
      WailsEventService.instance = new WailsEventService();
    }
    return WailsEventService.instance;
  }

  private initializePollingJobs(): void {
    const jobs: PollingJob[] = [
      {
        name: 'system_info',
        pollingFunction: this.systemMetricsPoller.createSystemInfoPoller(),
        interval: this.configService.getPollingInterval('system_info'),
        isActive: false
      },
      {
        name: 'realtime_metrics',
        pollingFunction: this.systemMetricsPoller.createRealTimeMetricsPoller(),
        interval: this.configService.getPollingInterval('realtime_metrics'),
        isActive: false
      },
      {
        name: 'gpu_info',
        pollingFunction: this.systemMetricsPoller.createGPUInfoPoller(),
        interval: this.configService.getPollingInterval('gpu_info'),
        isActive: false
      },
      {
        name: 'gpu_processes',
        pollingFunction: this.systemMetricsPoller.createGPUProcessPoller(),
        interval: this.configService.getPollingInterval('gpu_processes'),
        isActive: false
      },
      {
        name: 'network',
        pollingFunction: this.systemMetricsPoller.createNetworkPoller(),
        interval: this.configService.getPollingInterval('network'),
        isActive: false
      },
      {
        name: 'disk',
        pollingFunction: this.systemMetricsPoller.createDiskPoller(),
        interval: this.configService.getPollingInterval('disk'),
        isActive: false
      },
      {
        name: 'top_processes',
        pollingFunction: this.systemMetricsPoller.createTopProcessesPoller(),
        interval: this.configService.getPollingInterval('top_processes'),
        isActive: false
      }
    ];

    jobs.forEach(job => this.pollingManager.registerPollingJob(job));
  }

  public async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.log('[WailsEvent] Service already running');
      return;
    }

    console.log('[WailsEvent] Starting Wails Event Service...');

    try {
      // Test connection first
      const isConnected = await this.connectionManager.testConnection();
      if (!isConnected) {
        throw new Error('Failed to establish connection');
      }

      // Start performance monitoring
      this.performanceMonitor.startTracking();

      // Start all polling jobs
      this.pollingManager.startAllPolling();

      // Mark service as running
      this.isRunning = true;
      this.connectionManager.setConnected(true);

      console.log('[WailsEvent] Wails Event Service started successfully');
    } catch (error) {
      console.error('[WailsEvent] Failed to start service:', error);
      this.connectionManager.setConnected(false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  public async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      console.log('[WailsEvent] Service not running');
      return;
    }

    console.log('[WailsEvent] Stopping Wails Event Service...');

    try {
      // Stop all polling
      this.pollingManager.stopAllPolling();

      // Stop performance monitoring
      this.performanceMonitor.stopTracking();

      // Flush any pending GPU batches
      this.gpuProcessManager.flushGPUBatch();

      // Clear connection
      this.connectionManager.setConnected(false);

      // Mark service as stopped
      this.isRunning = false;

      console.log('[WailsEvent] Wails Event Service stopped successfully');
    } catch (error) {
      console.error('[WailsEvent] Error during service shutdown:', error);
      throw error;
    }
  }

  public isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  public onConnectionStatusChange(callback: ConnectionStatusCallback): () => void {
    return this.connectionManager.onConnectionStatusChange(callback);
  }

  public updateActiveWidgets(widgets: Set<WidgetType>): void {
    this.connectionManager.updateActiveWidgets(widgets);
  }

  public getStatus(): any {
    return {
      isRunning: this.isRunning,
      connection: this.connectionManager.getStatus(),
      polling: this.pollingManager.getStatus(),
      performance: this.performanceMonitor.getMetrics(),
      gpuBatch: this.gpuProcessManager.getBatchStatus(),
      config: this.configService.getConfig()
    };
  }

  // Configuration methods
  public updateConfig(partialConfig: Parameters<typeof this.configService.updateConfig>[0]): void {
    this.configService.updateConfig(partialConfig);
  }

  public resetConfig(): void {
    this.configService.resetToDefault();
  }

  // Polling control methods
  public startPollingJob(jobName: string): void {
    this.pollingManager.startPolling(jobName);
  }

  public stopPollingJob(jobName: string): void {
    this.pollingManager.stopPolling(jobName);
  }

  public isJobActive(jobName: string): boolean {
    return this.pollingManager.isJobActive(jobName);
  }

  // GPU process methods
  public flushGPUBatch(): void {
    this.gpuProcessManager.flushGPUBatch();
  }

  public clearGPUBatch(): void {
    this.gpuProcessManager.clearGPUBatch();
  }

  // Performance methods
  public getPerformanceMetrics(): ReturnType<typeof this.performanceMonitor.getMetrics> {
    return this.performanceMonitor.getMetrics();
  }

  public resetPerformanceMetrics(): void {
    this.performanceMonitor.reset();
  }

  // Utility methods
  public async executeWithRetry(operation: () => Promise<void>, maxRetries?: number): Promise<void> {
    return this.systemMetricsPoller.executeWithRetry(operation, maxRetries);
  }

  public async measurePerformance(operation: () => Promise<void>): Promise<number> {
    return this.systemMetricsPoller.measurePollingPerformance(operation);
  }

  // Cleanup
  public destroy(): void {
    if (this.isRunning) {
      this.stopMonitoring().catch(console.error);
    }

    this.gpuProcessManager.destroy();
    this.connectionManager.destroy();

    console.log('[WailsEvent] Service destroyed');
  }
}

// Export singleton instance
export const wailsEventService = WailsEventService.getInstance();