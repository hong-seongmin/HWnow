import { useMemo } from 'react';
import { useDashboardStore } from '../../../stores/dashboardStore';
import type { DashboardState, Widget, WidgetConfig } from '../../../stores/types';
import type { SortKey, SortOrder } from './processFiltering';
import { getGPUProcessConfigWithDefaults } from '../../../utils/gpuProcessWidgetDefaults';

export interface GpuProcessConfigResult {
  widget?: Widget;
  config: Partial<WidgetConfig>;
  processCount: number;
  sortBy: SortKey;
  sortOrder: SortOrder;
  filterEnabled: boolean;
  usageThreshold: number;
  memoryThreshold: number;
  filterType: 'and' | 'or';
  showUpdateIndicators: boolean;
  enableUpdateAnimations: boolean;
}

export const useGpuProcessConfig = (widgetId: string): GpuProcessConfigResult => {
  const widget = useDashboardStore((state: DashboardState) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w: Widget) => w.i === widgetId);
  });

  return useMemo(() => {
    const config = getGPUProcessConfigWithDefaults(widget?.config);

    return {
      widget,
      config,
      processCount: config.gpuProcessCount ?? 5,
      sortBy: (config.gpuSortBy ?? 'gpu_usage') as SortKey,
      sortOrder: (config.gpuSortOrder ?? 'desc') as SortOrder,
      filterEnabled: config.gpuFilterEnabled ?? false,
      usageThreshold: config.gpuUsageThreshold ?? 25,
      memoryThreshold: config.gpuMemoryThreshold ?? 100,
      filterType: (config.gpuFilterType ?? 'or') as 'and' | 'or',
      showUpdateIndicators: config.gpuShowUpdateIndicators !== false,
      enableUpdateAnimations: config.gpuEnableUpdateAnimations !== false,
    };
  }, [widget]);
};
