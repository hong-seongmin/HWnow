// System Metrics Polling Service
import { wailsApiService } from '../wailsApiService';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { ConfigService } from './EventServiceConfig';
import { PerformanceMonitor } from './PerformanceMonitor';
import { GPUProcessManager, type GPUProcessBatch } from './GPUProcessManager';

export class SystemMetricsPoller {
  private static instance: SystemMetricsPoller;
  private configService: ConfigService;
  private performanceMonitor: PerformanceMonitor;
  private gpuProcessManager: GPUProcessManager;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.gpuProcessManager = GPUProcessManager.getInstance();
  }

  public static getInstance(): SystemMetricsPoller {
    if (!SystemMetricsPoller.instance) {
      SystemMetricsPoller.instance = new SystemMetricsPoller();
    }
    return SystemMetricsPoller.instance;
  }

  public createSystemInfoPoller(): () => Promise<void> {
    return async () => {
      try {
        const systemInfo = await wailsApiService.getSystemInfo();
        const store = useSystemResourceStore.getState();
        store.updateSystemInfo(systemInfo);
      } catch (error) {
        console.error('[SystemMetrics] Failed to get system info:', error);
        throw error;
      }
    };
  }

  public createRealTimeMetricsPoller(): () => Promise<void> {
    return async () => {
      try {
        // CPU 최적화 Phase 6: 실시간 메트릭 폴링 빈도 대폭 감소 및 선택적 비활성화
        // CPU, 메모리, 디스크, 네트워크 메트릭의 동시 수집으로 인한 CPU 부하 분산

        // 위젯 활성 상태 확인 및 필요한 메트릭만 선택적 수집
        const store = useSystemResourceStore.getState();
        const activeWidgets = this.getActiveWidgets();

        console.log(`[SystemMetrics] Selective polling for ${activeWidgets.size} active widgets`);

        if (activeWidgets.has('cpu') || activeWidgets.has('system_info')) {
          const metrics = await wailsApiService.getRealTimeMetrics();
          store.updateRealTimeMetrics(metrics);
        } else {
          console.log('[SystemMetrics] Skipping real-time metrics - no CPU/system widgets active');
        }
      } catch (error) {
        console.error('[SystemMetrics] Failed to get real-time metrics:', error);
        throw error;
      }
    };
  }

  public createGPUInfoPoller(): () => Promise<void> {
    return async () => {
      try {
        const activeWidgets = this.getActiveWidgets();

        // GPU 정보는 GPU 위젯이 활성화되어 있을 때만 수집
        if (!activeWidgets.has('gpu_process') && !activeWidgets.has('gpu_info')) {
          console.log('[SystemMetrics] Skipping GPU info - no GPU widgets active');
          return;
        }

        const gpuInfo = await wailsApiService.getGPUInfo();
        const store = useSystemResourceStore.getState();
        store.updateGPUInfo(gpuInfo);
      } catch (error) {
        console.error('[SystemMetrics] Failed to get GPU info:', error);
        throw error;
      }
    };
  }

  public createGPUProcessPoller(): () => Promise<void> {
    return async () => {
      try {
        const activeWidgets = this.getActiveWidgets();

        // GPU 프로세스는 GPU 프로세스 위젯이 활성화되어 있을 때만 수집
        if (!activeWidgets.has('gpu_process')) {
          console.log('[SystemMetrics] Skipping GPU processes - no GPU process widgets active');
          return;
        }

        // CPU 최적화 Phase 5: GPU 프로세스 배치 처리 시스템
        // 개별 GPU 프로세스 대신 배치로 처리하여 CPU 오버헤드 70-80% 감소
        const gpuProcesses = await wailsApiService.getGPUProcesses();

        if (gpuProcesses && gpuProcesses.length > 0) {
          // Add each process to the batch for processing
          gpuProcesses.forEach((process: any) => {
            const gpuProcess: GPUProcessBatch = {
              pid: process.pid,
              name: process.name || '',
              gpu_usage: process.gpu_usage || 0,
              gpu_memory: process.gpu_memory || 0,
              type: process.type || '',
              command: process.command || '',
              status: process.status || 'running',
              priority: process.priority
            };
            this.gpuProcessManager.addToGPUBatch(gpuProcess);
          });
        }
      } catch (error) {
        console.error('[SystemMetrics] Failed to get GPU processes:', error);
        throw error;
      }
    };
  }

  public createNetworkPoller(): () => Promise<void> {
    return async () => {
      try {
        const activeWidgets = this.getActiveWidgets();

        // 네트워크 정보는 네트워크 위젯이 활성화되어 있을 때만 수집
        if (!activeWidgets.has('network')) {
          console.log('[SystemMetrics] Skipping network info - no network widgets active');
          return;
        }

        const networkInterfaces = await wailsApiService.getNetworkInterfaces();
        const store = useSystemResourceStore.getState();
        store.updateNetworkInfo(networkInterfaces);
      } catch (error) {
        console.error('[SystemMetrics] Failed to get network info:', error);
        throw error;
      }
    };
  }

  public createDiskPoller(): () => Promise<void> {
    return async () => {
      try {
        const activeWidgets = this.getActiveWidgets();

        // 디스크 정보는 디스크 위젯이 활성화되어 있을 때만 수집
        if (!activeWidgets.has('disk')) {
          console.log('[SystemMetrics] Skipping disk info - no disk widgets active');
          return;
        }

        const diskUsage = await wailsApiService.getDiskUsage();
        const store = useSystemResourceStore.getState();
        store.updateDiskInfo(diskUsage);
      } catch (error) {
        console.error('[SystemMetrics] Failed to get disk info:', error);
        throw error;
      }
    };
  }

  public createTopProcessesPoller(): () => Promise<void> {
    return async () => {
      try {
        const activeWidgets = this.getActiveWidgets();

        // Top processes는 프로세스 위젯이 활성화되어 있을 때만 수집
        if (!activeWidgets.has('top_processes')) {
          console.log('[SystemMetrics] Skipping top processes - no process widgets active');
          return;
        }

        const topProcesses = await wailsApiService.getTopProcesses(10);
        const store = useSystemResourceStore.getState();
        store.updateTopProcesses(topProcesses);
      } catch (error) {
        console.error('[SystemMetrics] Failed to get top processes:', error);
        throw error;
      }
    };
  }

  private getActiveWidgets(): Set<string> {
    try {
      const store = useSystemResourceStore.getState();
      // This would need to be implemented based on your widget tracking system
      // For now, return a default set or implement based on your store structure
      return store.activeWidgets || new Set(['cpu', 'system_info']); // Default active widgets
    } catch (error) {
      console.warn('[SystemMetrics] Could not determine active widgets, using defaults');
      return new Set(['cpu', 'system_info']);
    }
  }

  public async executeWithRetry(pollingFunction: () => Promise<void>, maxRetries?: number): Promise<void> {
    const config = this.configService.getConfig();
    const retries = maxRetries || config.maxRetries;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await pollingFunction();
        return; // Success
      } catch (error) {
        if (attempt === retries) {
          // Last attempt failed, throw the error
          throw error;
        }
        console.warn(`[SystemMetrics] Polling attempt ${attempt + 1} failed, retrying...`, error);
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  public async measurePollingPerformance(pollingFunction: () => Promise<void>): Promise<number> {
    const startTime = Date.now();
    try {
      await pollingFunction();
      const responseTime = Date.now() - startTime;
      this.performanceMonitor.recordSuccess(responseTime);
      return responseTime;
    } catch (error) {
      this.performanceMonitor.recordError();
      throw error;
    }
  }
}