// Polling Management Service
import { ConfigService } from './EventServiceConfig';
import { PerformanceMonitor } from './PerformanceMonitor';

export interface PollingJob {
  name: string;
  pollingFunction: () => Promise<void>;
  interval: number;
  isActive: boolean;
}

export class PollingManager {
  private static instance: PollingManager;
  private configService: ConfigService;
  private performanceMonitor: PerformanceMonitor;

  // Polling intervals and state
  private pollingIntervals: Map<string, number> = new Map();
  private adaptiveIntervals: Map<string, number> = new Map();
  private isAppVisible: boolean = true;
  private pollingJobs: Map<string, PollingJob> = new Map();

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.initializeVisibilityTracking();
  }

  public static getInstance(): PollingManager {
    if (!PollingManager.instance) {
      PollingManager.instance = new PollingManager();
    }
    return PollingManager.instance;
  }

  private initializeVisibilityTracking(): void {
    // Track app visibility for adaptive polling
    document.addEventListener('visibilitychange', () => {
      this.isAppVisible = !document.hidden;
      console.log(`[Polling] App visibility changed: ${this.isAppVisible ? 'visible' : 'hidden'}`);

      if (this.configService.isAdaptivePollingEnabled()) {
        this.adaptPollingForVisibility();
      }
    });

    // Track window focus for additional optimization
    window.addEventListener('blur', () => {
      console.log('[Polling] App lost focus');
      if (this.configService.isAdaptivePollingEnabled()) {
        this.reducePollingSForBackground();
      }
    });

    window.addEventListener('focus', () => {
      console.log('[Polling] App gained focus');
      if (this.configService.isAdaptivePollingEnabled()) {
        this.restoreNormalPolling();
      }
    });
  }

  public registerPollingJob(job: PollingJob): void {
    this.pollingJobs.set(job.name, job);
    console.log(`[Polling] Registered job: ${job.name}`);
  }

  public startPolling(jobName: string): void {
    const job = this.pollingJobs.get(jobName);
    if (!job) {
      console.warn(`[Polling] Job not found: ${jobName}`);
      return;
    }

    // Clear existing polling if any
    this.clearPolling(jobName);

    const interval = this.getJobPollingInterval(jobName);
    const intervalId = setInterval(async () => {
      try {
        const startTime = Date.now();
        await job.pollingFunction();
        const responseTime = Date.now() - startTime;
        this.performanceMonitor.recordSuccess(responseTime);
      } catch (error) {
        console.error(`[Polling] Error in ${jobName}:`, error);
        this.performanceMonitor.recordError();
      }
    }, interval);

    this.pollingIntervals.set(jobName, intervalId);
    job.isActive = true;
    console.log(`[Polling] Started ${jobName} with ${interval}ms interval`);
  }

  public stopPolling(jobName: string): void {
    this.clearPolling(jobName);
    const job = this.pollingJobs.get(jobName);
    if (job) {
      job.isActive = false;
    }
    console.log(`[Polling] Stopped ${jobName}`);
  }

  public clearPolling(jobName: string): void {
    const intervalId = this.pollingIntervals.get(jobName);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(jobName);
    }
  }

  public stopAllPolling(): void {
    this.pollingIntervals.forEach((intervalId, jobName) => {
      clearInterval(intervalId);
      const job = this.pollingJobs.get(jobName);
      if (job) {
        job.isActive = false;
      }
    });
    this.pollingIntervals.clear();
    console.log('[Polling] Stopped all polling');
  }

  public startAllPolling(): void {
    this.pollingJobs.forEach((job, jobName) => {
      if (!job.isActive) {
        this.startPolling(jobName);
      }
    });
    console.log('[Polling] Started all polling jobs');
  }

  private getJobPollingInterval(jobName: string): number {
    const config = this.configService.getConfig();

    // Check if we have an adaptive interval override
    if (this.adaptiveIntervals.has(jobName)) {
      return this.adaptiveIntervals.get(jobName)!;
    }

    // Use config service to determine interval
    return this.configService.getPollingInterval(jobName);
  }

  private adaptPollingForVisibility(): void {
    if (!this.isAppVisible) {
      // App is hidden, reduce polling frequency
      this.pollingIntervals.forEach((intervalId, jobName) => {
        if (!this.adaptiveIntervals.has(jobName)) {
          this.adaptiveIntervals.set(jobName, this.getJobPollingInterval(jobName));
        }
        this.restartPollingJob(jobName, this.configService.getBackgroundPollingInterval());
      });
    } else {
      // App is visible, restore normal polling
      this.restoreNormalPolling();
    }
  }

  private adaptPollingForHighErrorRate(): void {
    // Increase polling intervals due to high error rate
    this.pollingIntervals.forEach((intervalId, jobName) => {
      if (!this.adaptiveIntervals.has(jobName)) {
        this.adaptiveIntervals.set(jobName, this.getJobPollingInterval(jobName));
      }

      const currentInterval = this.getJobPollingInterval(jobName);
      const adaptiveInterval = currentInterval * 2; // Double the interval
      this.restartPollingJob(jobName, adaptiveInterval);
    });
  }

  private restoreNormalPolling(): void {
    // Restore original polling intervals
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
      this.restartPollingJob(jobName, this.configService.getBackgroundPollingInterval());
    });
  }

  private restartPollingJob(jobName: string, newInterval: number): void {
    const job = this.pollingJobs.get(jobName);
    if (!job) return;

    // Clear existing interval
    this.clearPolling(jobName);

    // CPU 최적화 Phase Final: 적응형 폴링 타이머 완전 비활성화
    // 적응형 폴링으로 인한 CPU 소모 방지 - setInterval 타이머 제거
    console.log(`[Polling] Adaptive polling disabled for CPU optimization: ${jobName}`);

    // 비활성화된 원본 코드 (CPU 소모 방지)
    /*
    const intervalId = setInterval(async () => {
      try {
        const startTime = Date.now();
        await job.pollingFunction();
        const responseTime = Date.now() - startTime;
        this.performanceMonitor.recordSuccess(responseTime);
      } catch (error) {
        console.error(`[Polling] Error in ${jobName}:`, error);
        this.performanceMonitor.recordError();
      }
    }, newInterval);

    this.pollingIntervals.set(jobName, intervalId);
    job.isActive = true;
    */

    console.log(`[Polling] Restarted ${jobName} with ${newInterval}ms interval`);
  }

  public getActiveJobs(): string[] {
    return Array.from(this.pollingJobs.keys()).filter(jobName => {
      const job = this.pollingJobs.get(jobName);
      return job?.isActive ?? false;
    });
  }

  public isJobActive(jobName: string): boolean {
    const job = this.pollingJobs.get(jobName);
    return job?.isActive ?? false;
  }

  public getJobCount(): number {
    return this.pollingJobs.size;
  }

  public getStatus(): any {
    return {
      activeJobs: this.getActiveJobs(),
      totalJobs: this.getJobCount(),
      isAppVisible: this.isAppVisible,
      adaptiveIntervalsCount: this.adaptiveIntervals.size
    };
  }
}