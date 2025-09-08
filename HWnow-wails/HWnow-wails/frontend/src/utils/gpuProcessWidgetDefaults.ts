import type { WidgetConfig } from '../stores/types';

// GPU Process Widget 기본 설정값 정의
export const GPU_PROCESS_WIDGET_DEFAULTS: Partial<WidgetConfig> = {
  // 기본 프로세스 모니터링 설정
  gpuProcessCount: 5,
  gpuSortBy: 'gpu_usage',
  gpuSortOrder: 'desc',
  
  // 레이아웃/사이즈 동작
  gpuAutoSize: false, // CPU 최적화 기본: 자동 리사이즈 비활성화
  
  // 필터링 설정
  gpuFilterEnabled: false,
  gpuUsageThreshold: 25,
  gpuMemoryThreshold: 100, // MB
  gpuFilterType: 'or',
  
  // 실시간 업데이트 설정
  gpuShowUpdateIndicators: true,
  gpuEnableUpdateAnimations: false,
  gpuUpdateInterval: 2000, // ms
  
  // 시각적 피드백 설정
  gpuShowStatusColors: true,
  gpuShowUsageGradients: true,
  gpuShowProcessIcons: true,
  gpuShowStatusAnimations: false,
  
  // 프로세스 제어 설정
  gpuEnableProcessControl: true,
  gpuShowControlButtons: true,
  gpuEnableContextMenu: true,
  gpuRequireConfirmation: true,
  
  // 디스플레이 옵션
  gpuShowProcessPriority: false,
  gpuShowProcessCommand: false,
  gpuShowLastUpdateTime: false,
  gpuCompactView: false,
};

// 설정값 검증 함수
export const validateGPUProcessConfig = (config: Partial<WidgetConfig>): Partial<WidgetConfig> => {
  const validated: Partial<WidgetConfig> = { ...config };

  // Process count 검증 (최소 1, 최대 20)
  if (validated.gpuProcessCount !== undefined) {
    validated.gpuProcessCount = Math.max(1, Math.min(20, validated.gpuProcessCount));
  }

  // Usage threshold 검증 (0-100%)
  if (validated.gpuUsageThreshold !== undefined) {
    validated.gpuUsageThreshold = Math.max(0, Math.min(100, validated.gpuUsageThreshold));
  }

  // Memory threshold 검증 (최소 50MB, 최대 16GB)
  if (validated.gpuMemoryThreshold !== undefined) {
    validated.gpuMemoryThreshold = Math.max(50, Math.min(16384, validated.gpuMemoryThreshold));
  }

  // Update interval 검증 (최소 500ms, 최대 30초)
  if (validated.gpuUpdateInterval !== undefined) {
    validated.gpuUpdateInterval = Math.max(500, Math.min(30000, validated.gpuUpdateInterval));
  }

  // Sort by 검증
  const validSortFields = ['gpu_usage', 'gpu_memory', 'name', 'pid', 'type', 'status'];
  if (validated.gpuSortBy && !validSortFields.includes(validated.gpuSortBy)) {
    validated.gpuSortBy = 'gpu_usage';
  }

  // Sort order 검증
  if (validated.gpuSortOrder && !['asc', 'desc'].includes(validated.gpuSortOrder)) {
    validated.gpuSortOrder = 'desc';
  }

  // Filter type 검증
  if (validated.gpuFilterType && !['and', 'or'].includes(validated.gpuFilterType)) {
    validated.gpuFilterType = 'or';
  }

  return validated;
};

// 기본값과 함께 병합된 설정 반환
export const getGPUProcessConfigWithDefaults = (config: Partial<WidgetConfig> = {}): Partial<WidgetConfig> => {
  const mergedConfig = {
    ...GPU_PROCESS_WIDGET_DEFAULTS,
    ...config,
  };

  return validateGPUProcessConfig(mergedConfig);
};

// 설정 초기화 함수
export const resetGPUProcessConfig = (): Partial<WidgetConfig> => {
  return { ...GPU_PROCESS_WIDGET_DEFAULTS };
};

// 설정 변경사항 검증 및 적용
export const applyGPUProcessConfigChange = (
  currentConfig: Partial<WidgetConfig>,
  changes: Partial<WidgetConfig>
): Partial<WidgetConfig> => {
  const newConfig = {
    ...currentConfig,
    ...changes,
  };

  return validateGPUProcessConfig(newConfig);
};

// 프리셋 설정들
export const GPU_PROCESS_PRESETS = {
  performance: {
    ...GPU_PROCESS_WIDGET_DEFAULTS,
    gpuProcessCount: 10,
    gpuFilterEnabled: true,
    gpuUsageThreshold: 10,
    gpuMemoryThreshold: 50,
    gpuUpdateInterval: 1000,
    gpuShowUpdateIndicators: true,
    gpuEnableUpdateAnimations: true,
  },
  
  minimal: {
    ...GPU_PROCESS_WIDGET_DEFAULTS,
    gpuProcessCount: 3,
    gpuShowUpdateIndicators: false,
    gpuEnableUpdateAnimations: false,
    gpuShowStatusColors: false,
    gpuShowUsageGradients: false,
    gpuShowProcessIcons: false,
    gpuCompactView: true,
    gpuUpdateInterval: 5000,
  },
  
  gaming: {
    ...GPU_PROCESS_WIDGET_DEFAULTS,
    gpuProcessCount: 8,
    gpuFilterEnabled: true,
    gpuUsageThreshold: 30,
    gpuMemoryThreshold: 200,
    gpuFilterType: 'or',
    gpuShowStatusColors: true,
    gpuEnableUpdateAnimations: true,
    gpuUpdateInterval: 1500,
  },
  
  developer: {
    ...GPU_PROCESS_WIDGET_DEFAULTS,
    gpuProcessCount: 15,
    gpuShowProcessPriority: true,
    gpuShowProcessCommand: true,
    gpuShowLastUpdateTime: true,
    gpuFilterEnabled: false,
    gpuUpdateInterval: 2000,
    gpuRequireConfirmation: true,
  },
} as const;

export type GPUProcessPresetType = keyof typeof GPU_PROCESS_PRESETS;
