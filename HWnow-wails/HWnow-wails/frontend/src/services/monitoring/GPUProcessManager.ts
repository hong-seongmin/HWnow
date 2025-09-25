// GPU Process Management Service
import { ConfigService } from './EventServiceConfig';

export interface GPUProcessBatch {
  pid: number;
  name: string;
  gpu_usage: number;
  gpu_memory: number;
  type: string;
  command: string;
  status: string;
  priority?: string;
}

export class GPUProcessManager {
  private static instance: GPUProcessManager;
  private configService: ConfigService;

  // GPU process batch management
  private gpuProcessBatch: GPUProcessBatch[] = [];
  private gpuBatchTimeout: number | null = null;
  private batchTimeouts: Map<string, number> = new Map();

  private constructor() {
    this.configService = ConfigService.getInstance();
  }

  public static getInstance(): GPUProcessManager {
    if (!GPUProcessManager.instance) {
      GPUProcessManager.instance = new GPUProcessManager();
    }
    return GPUProcessManager.instance;
  }

  public addToGPUBatch(process: GPUProcessBatch): void {
    this.gpuProcessBatch.push(process);

    // Schedule batch processing if not already scheduled
    if (!this.gpuBatchTimeout) {
      const config = this.configService.getConfig();
      this.gpuBatchTimeout = window.setTimeout(() => {
        this.processGPUBatch();
      }, config.batchProcessingDelay);
    }
  }

  private processGPUBatch(): void {
    if (this.gpuProcessBatch.length === 0) {
      this.gpuBatchTimeout = null;
      return;
    }

    console.log(`[GPU] Processing batch of ${this.gpuProcessBatch.length} GPU processes`);

    // Group processes by PID for deduplication
    const processMap = new Map<number, GPUProcessBatch>();
    for (const process of this.gpuProcessBatch) {
      // Keep the most recent process data for each PID
      processMap.set(process.pid, process);
    }

    // Convert back to array and emit the batch
    const uniqueProcesses = Array.from(processMap.values());
    this.emitGPUProcessBatch(uniqueProcesses);

    // Clear batch and timeout
    this.gpuProcessBatch = [];
    this.gpuBatchTimeout = null;
  }

  private emitGPUProcessBatch(processes: GPUProcessBatch[]): void {
    // This would emit the batch to the store or other components
    console.log(`[GPU] Emitting batch of ${processes.length} unique GPU processes`);

    // Emit to system resource store
    try {
      import('../../stores/systemResourceStore').then(({ useSystemResourceStore }) => {
        const store = useSystemResourceStore.getState();
        if (store.updateGPUProcesses) {
          // Transform to the expected format if needed
          const gpuProcesses = processes.map(p => ({
            pid: p.pid,
            name: p.name,
            gpu_usage: p.gpu_usage,
            gpu_memory: p.gpu_memory,
            type: p.type,
            command: p.command,
            status: p.status,
            priority: p.priority
          }));
          store.updateGPUProcesses(gpuProcesses);
        }
      });
    } catch (error) {
      console.error('[GPU] Failed to update GPU processes in store:', error);
    }
  }

  public flushGPUBatch(): void {
    if (this.gpuBatchTimeout) {
      clearTimeout(this.gpuBatchTimeout);
      this.gpuBatchTimeout = null;
    }

    if (this.gpuProcessBatch.length > 0) {
      this.processGPUBatch();
    }
  }

  public clearGPUBatch(): void {
    if (this.gpuBatchTimeout) {
      clearTimeout(this.gpuBatchTimeout);
      this.gpuBatchTimeout = null;
    }
    this.gpuProcessBatch = [];
  }

  public setBatchTimeout(jobName: string, timeoutId: number): void {
    this.batchTimeouts.set(jobName, timeoutId);
  }

  public clearBatchTimeout(jobName: string): void {
    const timeoutId = this.batchTimeouts.get(jobName);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.batchTimeouts.delete(jobName);
    }
  }

  public clearAllBatchTimeouts(): void {
    this.batchTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.batchTimeouts.clear();
  }

  public getGPUBatchSize(): number {
    return this.gpuProcessBatch.length;
  }

  public isBatchPending(): boolean {
    return this.gpuBatchTimeout !== null;
  }

  public getBatchStatus(): any {
    return {
      batchSize: this.gpuProcessBatch.length,
      isPending: this.isBatchPending(),
      timeoutCount: this.batchTimeouts.size
    };
  }

  public processSingleGPUUpdate(process: GPUProcessBatch): void {
    // For immediate processing without batching
    this.emitGPUProcessBatch([process]);
  }

  public destroy(): void {
    this.clearGPUBatch();
    this.clearAllBatchTimeouts();
    console.log('[GPU] GPU Process Manager destroyed');
  }
}