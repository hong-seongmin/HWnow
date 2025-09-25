// Event Service Configuration Management
import type { WidgetType } from '../../stores/types';

export interface EventServiceConfig {
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

export class ConfigService {
  private static instance: ConfigService;
  private config: EventServiceConfig;

  private constructor() {
    this.config = this.getDefaultConfig();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  private getDefaultConfig(): EventServiceConfig {
    return {
      pollingInterval: 30000, // CPU 최적화 Phase 3: 20초 → 30초 (1.5배 추가 감소)
      batchProcessingDelay: 1000,  // 배치 처리 지연 추가 증가 (CPU 부하 분산)
      maxRetries: 1, // 재시도 횟수 최소화
      adaptivePolling: false, // CPU 최적화 Phase Final: 적응형 폴링 완전 비활성화
      priorityMetrics: ['gpu_process', 'system_info'], // CPU 집약적 메트릭 우선순위 축소
      performanceThreshold: 5000, // CPU 최적화: 3초 → 5초 (더욱 관대한 임계값)
      errorRateThreshold: 50, // CPU 최적화: 40% → 50% (더욱 관대한 오류율)
      backgroundPollingInterval: 300000, // CPU 최적화 Phase 3: 1분 → 5분 (백그라운드에서 극한 감소)
      highFrequencyMetrics: ['system_info'], // CPU 집약적 메트릭 축소
      lowFrequencyMetrics: ['gpu_info', 'network', 'disk'] // GPU 정보는 저주파수로 이동
    };
  }

  public getConfig(): EventServiceConfig {
    return { ...this.config };
  }

  public updateConfig(partialConfig: Partial<EventServiceConfig>): void {
    this.config = {
      ...this.config,
      ...partialConfig
    };
  }

  public resetToDefault(): void {
    this.config = this.getDefaultConfig();
  }

  public getPollingInterval(metricType: string): number {
    // Determine appropriate polling interval based on metric type
    if (this.config.highFrequencyMetrics.some(metric => metricType.includes(metric))) {
      return this.config.pollingInterval;
    } else if (this.config.lowFrequencyMetrics.some(metric => metricType.includes(metric))) {
      return this.config.pollingInterval * 4;
    }
    return this.config.pollingInterval * 2;
  }

  public isAdaptivePollingEnabled(): boolean {
    return this.config.adaptivePolling;
  }

  public getPerformanceThreshold(): number {
    return this.config.performanceThreshold;
  }

  public getErrorRateThreshold(): number {
    return this.config.errorRateThreshold;
  }

  public getBackgroundPollingInterval(): number {
    return this.config.backgroundPollingInterval;
  }
}