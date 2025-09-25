// GPU Process Operations Handler

import { killGPUProcess, suspendGPUProcess, resumeGPUProcess, setGPUProcessPriority } from '../../../services/wailsApiService';

export type ProcessOperation = 'terminate' | 'suspend' | 'resume' | 'priority';

export interface ProcessOperationResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface ProcessOperationOptions {
  pid: number;
  processName?: string;
  operation: ProcessOperation;
  priority?: string;
}

export class ProcessOperationsHandler {
  private static instance: ProcessOperationsHandler;
  private operationInProgress: Set<number> = new Set();

  private constructor() {}

  public static getInstance(): ProcessOperationsHandler {
    if (!ProcessOperationsHandler.instance) {
      ProcessOperationsHandler.instance = new ProcessOperationsHandler();
    }
    return ProcessOperationsHandler.instance;
  }

  public isOperationInProgress(pid: number): boolean {
    return this.operationInProgress.has(pid);
  }

  private setOperationInProgress(pid: number, inProgress: boolean): void {
    if (inProgress) {
      this.operationInProgress.add(pid);
    } else {
      this.operationInProgress.delete(pid);
    }
  }

  public async executeOperation(options: ProcessOperationOptions): Promise<ProcessOperationResult> {
    const { pid, processName, operation, priority } = options;

    if (this.isOperationInProgress(pid)) {
      return {
        success: false,
        message: `Operation already in progress for process ${pid}`,
        error: 'OPERATION_IN_PROGRESS'
      };
    }

    this.setOperationInProgress(pid, true);

    try {
      let result: any;
      let successMessage: string;

      switch (operation) {
        case 'terminate':
          result = await killGPUProcess(pid);
          successMessage = `Process ${processName || pid} terminated successfully`;
          break;

        case 'suspend':
          result = await suspendGPUProcess(pid);
          successMessage = `Process ${processName || pid} suspended successfully`;
          break;

        case 'resume':
          result = await resumeGPUProcess(pid);
          successMessage = `Process ${processName || pid} resumed successfully`;
          break;

        case 'priority':
          if (!priority) {
            throw new Error('Priority is required for priority operation');
          }
          result = await setGPUProcessPriority(pid, priority);
          successMessage = `Process ${processName || pid} priority set to ${priority} successfully`;
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      // Handle API result
      if (result && typeof result === 'object') {
        if (result.success === false) {
          return {
            success: false,
            message: result.message || `Failed to ${operation} process ${pid}`,
            error: result.error || 'API_ERROR'
          };
        }
      }

      return {
        success: true,
        message: successMessage
      };

    } catch (error) {
      console.error(`[ProcessOperations] Failed to ${operation} process ${pid}:`, error);
      return {
        success: false,
        message: `Failed to ${operation} process ${processName || pid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      };
    } finally {
      this.setOperationInProgress(pid, false);
    }
  }

  public async terminateProcess(pid: number, processName?: string): Promise<ProcessOperationResult> {
    return this.executeOperation({
      pid,
      processName,
      operation: 'terminate'
    });
  }

  public async suspendProcess(pid: number, processName?: string): Promise<ProcessOperationResult> {
    return this.executeOperation({
      pid,
      processName,
      operation: 'suspend'
    });
  }

  public async resumeProcess(pid: number, processName?: string): Promise<ProcessOperationResult> {
    return this.executeOperation({
      pid,
      processName,
      operation: 'resume'
    });
  }

  public async setPriority(pid: number, priority: string, processName?: string): Promise<ProcessOperationResult> {
    return this.executeOperation({
      pid,
      processName,
      operation: 'priority',
      priority
    });
  }

  public async batchOperation(
    pids: number[],
    operation: ProcessOperation,
    options?: { priority?: string; processNames?: Record<number, string> }
  ): Promise<{ results: Array<{ pid: number; result: ProcessOperationResult }>; summary: { success: number; failed: number } }> {
    const results: Array<{ pid: number; result: ProcessOperationResult }> = [];
    let successCount = 0;
    let failedCount = 0;

    // Execute operations sequentially to avoid overwhelming the system
    for (const pid of pids) {
      const processName = options?.processNames?.[pid];

      const result = await this.executeOperation({
        pid,
        processName,
        operation,
        priority: options?.priority
      });

      results.push({ pid, result });

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Small delay between operations to prevent system overload
      if (pids.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      results,
      summary: {
        success: successCount,
        failed: failedCount
      }
    };
  }

  public validatePriority(priority: string): boolean {
    const validPriorities = ['low', 'below_normal', 'normal', 'above_normal', 'high', 'realtime'];
    return validPriorities.includes(priority.toLowerCase());
  }

  public getValidPriorities(): string[] {
    return ['low', 'below_normal', 'normal', 'above_normal', 'high', 'realtime'];
  }

  public async canPerformOperation(pid: number, operation: ProcessOperation): Promise<{ canPerform: boolean; reason?: string }> {
    if (this.isOperationInProgress(pid)) {
      return {
        canPerform: false,
        reason: 'Operation already in progress'
      };
    }

    // Additional validation could be added here
    // For example, checking if the process still exists, permissions, etc.

    return { canPerform: true };
  }

  public getOperationInProgressCount(): number {
    return this.operationInProgress.size;
  }

  public clearAllOperations(): void {
    this.operationInProgress.clear();
  }
}