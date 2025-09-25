// Performance Monitoring Service
import { ConfigService } from './EventServiceConfig';

export interface PerformanceMetrics {
  lastPollingTime: number;
  averageResponseTime: number;
  errorCount: number;
  successCount: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private configService: ConfigService;
  private performanceMetrics: PerformanceMetrics;
  private metricsTrackingInterval: number | null = null;

  private constructor() {
    this.configService = ConfigService.getInstance();
    this.performanceMetrics = {
      lastPollingTime: 0,
      averageResponseTime: 0,
      errorCount: 0,
      successCount: 0
    };
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public startTracking(): void {
    // CPU 최적화 Phase Final: 성능 메트릭 추적 완전 비활성화
    // 주기적인 성능 메트릭 리셋 및 적응형 폴링 비활성화로 CPU 사용률 대폭 감소
    console.log('[Performance] Performance tracking disabled for CPU optimization');

    // 비활성화된 원본 코드 (CPU 소모 방지)
    /*
    this.metricsTrackingInterval = setInterval(() => {
      const config = this.configService.getConfig();

      // Calculate error rate
      const totalRequests = this.performanceMetrics.successCount + this.performanceMetrics.errorCount;
      const errorRate = totalRequests > 0 ? (this.performanceMetrics.errorCount / totalRequests) * 100 : 0;

      if (config.adaptivePolling) {
        if (errorRate > config.errorRateThreshold) {
          // Implement adaptive polling based on error rate
          this.triggerAdaptivePolling();
        } else {
          // Restore normal polling if error rate is low
          this.restoreNormalPolling();
        }
      }

      // Reset counters but keep running average
      this.resetCounters();
    }, 30000); // Check every 30 seconds
    */
  }

  public stopTracking(): void {
    if (this.metricsTrackingInterval) {
      clearInterval(this.metricsTrackingInterval);
      this.metricsTrackingInterval = null;
    }
  }

  public recordSuccess(responseTime: number): void {
    this.performanceMetrics.successCount++;
    this.performanceMetrics.lastPollingTime = Date.now();

    // Update running average
    const totalRequests = this.performanceMetrics.successCount + this.performanceMetrics.errorCount;
    this.performanceMetrics.averageResponseTime =
      ((this.performanceMetrics.averageResponseTime * (totalRequests - 1)) + responseTime) / totalRequests;
  }

  public recordError(): void {
    this.performanceMetrics.errorCount++;
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  public getErrorRate(): number {
    const totalRequests = this.performanceMetrics.successCount + this.performanceMetrics.errorCount;
    return totalRequests > 0 ? (this.performanceMetrics.errorCount / totalRequests) * 100 : 0;
  }

  public isPerformanceGood(): boolean {
    const config = this.configService.getConfig();
    return this.performanceMetrics.averageResponseTime < config.performanceThreshold;
  }

  public shouldAdaptPolling(): boolean {
    const config = this.configService.getConfig();
    return config.adaptivePolling && this.getErrorRate() > config.errorRateThreshold;
  }

  private resetCounters(): void {
    this.performanceMetrics.errorCount = 0;
    this.performanceMetrics.successCount = 0;
  }

  private triggerAdaptivePolling(): void {
    console.log('[Performance] Triggering adaptive polling due to high error rate');
    // This would be handled by the polling manager
  }

  private restoreNormalPolling(): void {
    console.log('[Performance] Restoring normal polling - error rate normalized');
    // This would be handled by the polling manager
  }

  public reset(): void {
    this.performanceMetrics = {
      lastPollingTime: 0,
      averageResponseTime: 0,
      errorCount: 0,
      successCount: 0
    };
  }
}