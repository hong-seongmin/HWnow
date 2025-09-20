import type { WidgetType, Breakpoint } from '../stores/types';

// Widget size categories
export type WidgetSizeCategory = 'small' | 'medium' | 'large' | 'xlarge';

// Size dimensions [width, height]
export type SizeDimensions = [number, number];

// Widget size mapping by breakpoint
export const WIDGET_SIZES: Record<Breakpoint, Record<WidgetSizeCategory, SizeDimensions>> = {
  lg: {
    small: [4, 3],    // Battery, uptime, simple metrics
    medium: [6, 4],   // CPU, memory, disk, GPU basic
    large: [8, 5],    // Process monitor, memory detail, logs
    xlarge: [10, 6]   // GPU processes, complex monitoring
  },
  md: {
    small: [4, 3],    // Keep same
    medium: [5, 4],   // Slightly smaller for medium screens
    large: [7, 5],    // Balanced size
    xlarge: [9, 6]    // Reasonable for medium screens
  },
  sm: {
    small: [3, 3],    // Balanced for small screens
    medium: [4, 3],   // Compact but usable
    large: [5, 4],    // Reasonable size
    xlarge: [6, 5]    // Maximum for small screens
  },
  xs: {
    small: [2, 2],    // Minimal but visible
    medium: [3, 3],   // Compact
    large: [4, 4],    // Limited by screen width
    xlarge: [4, 6]    // Tall format for complex content
  },
  xxs: {
    small: [2, 2],    // Very constrained
    medium: [2, 3],   // Narrow but functional
    large: [2, 4],    // Prioritize height
    xlarge: [2, 6]    // Maximum height utilization
  }
};

// Widget type to size category mapping
export const WIDGET_SIZE_MAPPING: Record<WidgetType, WidgetSizeCategory> = {
  // Small widgets - simple metrics that don't need much space
  'battery': 'small',
  'system_uptime': 'small',
  'network_status': 'small',

  // Medium widgets - basic charts and metrics
  'cpu': 'medium',
  'ram': 'medium',
  'disk_read': 'medium',
  'disk_write': 'medium',
  'disk_space': 'medium',
  'net_sent': 'medium',
  'net_recv': 'medium',
  'gpu': 'medium',

  // Large widgets - detailed information requiring more space
  'memory_detail': 'large',
  'process_monitor': 'large',
  'system_log': 'large',

  // Extra large widgets - complex interfaces with lots of data
  'gpu_process': 'xlarge'
};

// Minimum and maximum size constraints by widget type
export const WIDGET_SIZE_CONSTRAINTS: Record<WidgetType, {
  min: SizeDimensions;
  max: SizeDimensions;
}> = {
  'cpu': { min: [4, 3], max: [10, 7] },           // Increased from [3,2] to [4,3]
  'ram': { min: [4, 3], max: [10, 7] },           // Increased from [3,2] to [4,3]
  'disk_read': { min: [4, 3], max: [10, 7] },     // Increased from [3,2] to [4,3]
  'disk_write': { min: [4, 3], max: [10, 7] },    // Increased from [3,2] to [4,3]
  'disk_space': { min: [4, 3], max: [10, 7] },    // Increased from [3,2] to [4,3]
  'net_sent': { min: [4, 3], max: [10, 7] },      // Increased from [3,2] to [4,3]
  'net_recv': { min: [4, 3], max: [10, 7] },      // Increased from [3,2] to [4,3]
  'gpu': { min: [4, 3], max: [10, 7] },           // Increased from [3,2] to [4,3]
  'gpu_process': { min: [8, 5], max: [12, 8] },   // Increased from [6,4] to [8,5]
  'system_uptime': { min: [3, 2], max: [6, 4] },  // Increased from [2,1] to [3,2]
  'process_monitor': { min: [6, 4], max: [12, 8] }, // Increased from [4,3] to [6,4]
  'battery': { min: [3, 2], max: [5, 4] },        // Increased from [2,1] to [3,2]
  'network_status': { min: [3, 2], max: [6, 4] }, // Increased from [2,1] to [3,2]
  'memory_detail': { min: [6, 4], max: [12, 7] }, // Increased from [4,3] to [6,4]
  'system_log': { min: [6, 4], max: [12, 8] }     // Increased from [4,3] to [6,4]
};

/**
 * Get optimal size for a widget type at a specific breakpoint
 */
export function getOptimalWidgetSize(
  widgetType: WidgetType,
  breakpoint: Breakpoint
): SizeDimensions {
  const sizeCategory = WIDGET_SIZE_MAPPING[widgetType];
  const size = WIDGET_SIZES[breakpoint][sizeCategory];

  // Apply widget-specific constraints
  const constraints = WIDGET_SIZE_CONSTRAINTS[widgetType];
  if (constraints) {
    const [width, height] = size;
    const [minW, minH] = constraints.min;
    const [maxW, maxH] = constraints.max;

    return [
      Math.max(minW, Math.min(maxW, width)),
      Math.max(minH, Math.min(maxH, height))
    ];
  }

  return size;
}

/**
 * Get size category for a widget type
 */
export function getWidgetSizeCategory(widgetType: WidgetType): WidgetSizeCategory {
  return WIDGET_SIZE_MAPPING[widgetType];
}

/**
 * Check if a widget can fit in available space
 */
export function canWidgetFit(
  widgetType: WidgetType,
  breakpoint: Breakpoint,
  availableWidth: number,
  availableHeight: number
): boolean {
  const [width, height] = getOptimalWidgetSize(widgetType, breakpoint);
  return width <= availableWidth && height <= availableHeight;
}

/**
 * Get alternative size if optimal size doesn't fit
 */
export function getAlternativeWidgetSize(
  widgetType: WidgetType,
  breakpoint: Breakpoint,
  maxWidth: number,
  maxHeight: number
): SizeDimensions {
  const constraints = WIDGET_SIZE_CONSTRAINTS[widgetType];
  if (!constraints) {
    return getOptimalWidgetSize(widgetType, breakpoint);
  }

  const [minW, minH] = constraints.min;
  const [maxW, maxH] = constraints.max;

  // Calculate the largest possible size within constraints and available space
  const width = Math.max(minW, Math.min(maxW, maxWidth));
  const height = Math.max(minH, Math.min(maxH, maxHeight));

  return [width, height];
}

/**
 * Get all size variants for a widget type across breakpoints
 */
export function getWidgetSizeVariants(widgetType: WidgetType): Record<Breakpoint, SizeDimensions> {
  const variants: Record<Breakpoint, SizeDimensions> = {} as Record<Breakpoint, SizeDimensions>;

  (['lg', 'md', 'sm', 'xs', 'xxs'] as Breakpoint[]).forEach(breakpoint => {
    variants[breakpoint] = getOptimalWidgetSize(widgetType, breakpoint);
  });

  return variants;
}

/**
 * Calculate space efficiency for widget placement
 */
export function calculateWidgetSpaceEfficiency(
  widgetType: WidgetType,
  breakpoint: Breakpoint,
  actualSize: SizeDimensions
): number {
  const optimalSize = getOptimalWidgetSize(widgetType, breakpoint);
  const [optimalW, optimalH] = optimalSize;
  const [actualW, actualH] = actualSize;

  const optimalArea = optimalW * optimalH;
  const actualArea = actualW * actualH;

  // Return efficiency as a percentage (100% = perfect match)
  return optimalArea > 0 ? Math.min(100, (actualArea / optimalArea) * 100) : 0;
}