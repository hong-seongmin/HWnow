import type { Layout } from 'react-grid-layout';
import type { Breakpoint, ResponsiveLayouts } from '../stores/types';

// Breakpoint configurations
export const BREAKPOINT_CONFIGS = {
  lg: { cols: 12, containerWidth: 1200 },
  md: { cols: 10, containerWidth: 996 },
  sm: { cols: 6, containerWidth: 768 },
  xs: { cols: 4, containerWidth: 480 },
  xxs: { cols: 2, containerWidth: 0 }
} as const;

export const BREAKPOINTS = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0
} as const;

/**
 * Convert a layout from one breakpoint to another
 */
export function convertLayout(
  layout: Layout[],
  fromBreakpoint: Breakpoint,
  toBreakpoint: Breakpoint
): Layout[] {
  const fromConfig = BREAKPOINT_CONFIGS[fromBreakpoint];
  const toConfig = BREAKPOINT_CONFIGS[toBreakpoint];

  const scaleFactor = toConfig.cols / fromConfig.cols;

  return layout.map(item => {
    const newW = Math.max(1, Math.min(toConfig.cols, Math.round(item.w * scaleFactor)));
    const newX = Math.max(0, Math.min(toConfig.cols - newW, Math.round(item.x * scaleFactor)));

    return {
      ...item,
      x: newX,
      w: newW,
      minW: Math.max(1, Math.round((item.minW || 1) * scaleFactor)),
      maxW: item.maxW ? Math.min(toConfig.cols, Math.round(item.maxW * scaleFactor)) : undefined
    };
  });
}

/**
 * Generate responsive layouts from a base layout
 */
export function generateResponsiveLayouts(baseLayout: Layout[], baseBreakpoint: Breakpoint = 'lg'): ResponsiveLayouts {
  const responsiveLayouts: ResponsiveLayouts = {};

  // Set the base layout
  responsiveLayouts[baseBreakpoint] = baseLayout;

  // Generate layouts for other breakpoints
  const breakpoints: Breakpoint[] = ['lg', 'md', 'sm', 'xs', 'xxs'];

  breakpoints.forEach(breakpoint => {
    if (breakpoint !== baseBreakpoint) {
      responsiveLayouts[breakpoint] = convertLayout(baseLayout, baseBreakpoint, breakpoint);
    }
  });

  return responsiveLayouts;
}

/**
 * Detect collisions and resolve them
 */
export function resolveCollisions(layout: Layout[], cols: number): Layout[] {
  const sortedLayout = [...layout].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const resolvedLayout: Layout[] = [];

  for (const item of sortedLayout) {
    let newY = item.y;
    let collision = true;

    while (collision) {
      collision = false;

      for (const placedItem of resolvedLayout) {
        if (isColliding({ ...item, y: newY }, placedItem)) {
          collision = true;
          newY = placedItem.y + placedItem.h;
          break;
        }
      }
    }

    resolvedLayout.push({ ...item, y: newY });
  }

  return resolvedLayout;
}

/**
 * Check if two layout items are colliding
 */
function isColliding(item1: Layout, item2: Layout): boolean {
  return !(
    item1.x + item1.w <= item2.x ||
    item2.x + item2.w <= item1.x ||
    item1.y + item1.h <= item2.y ||
    item2.y + item2.h <= item1.y
  );
}

/**
 * Compact layout vertically
 */
export function compactLayout(layout: Layout[], cols: number): Layout[] {
  const sortedLayout = [...layout].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const compactedLayout: Layout[] = [];

  for (const item of sortedLayout) {
    let minY = 0;

    // Find the minimum Y position where this item can be placed
    for (const placedItem of compactedLayout) {
      if (placedItem.x < item.x + item.w && placedItem.x + placedItem.w > item.x) {
        minY = Math.max(minY, placedItem.y + placedItem.h);
      }
    }

    compactedLayout.push({ ...item, y: minY });
  }

  return compactedLayout;
}

/**
 * Get the current breakpoint based on window width
 */
export function getCurrentBreakpoint(width: number = window.innerWidth): Breakpoint {
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  if (width >= BREAKPOINTS.xs) return 'xs';
  return 'xxs';
}

/**
 * Migrate legacy layout to responsive layouts
 */
export function migrateLegacyLayout(legacyLayout: Layout[]): ResponsiveLayouts {
  return generateResponsiveLayouts(legacyLayout, 'lg');
}

/**
 * Merge responsive layouts with priority to user-defined layouts
 */
export function mergeResponsiveLayouts(
  current: ResponsiveLayouts,
  incoming: ResponsiveLayouts
): ResponsiveLayouts {
  const merged: ResponsiveLayouts = { ...current };

  Object.entries(incoming).forEach(([breakpoint, layout]) => {
    if (layout && layout.length > 0) {
      merged[breakpoint as Breakpoint] = layout;
    }
  });

  return merged;
}

/**
 * Validate layout items for a specific breakpoint
 */
export function validateLayout(layout: Layout[], breakpoint: Breakpoint): Layout[] {
  const config = BREAKPOINT_CONFIGS[breakpoint];

  return layout.map(item => ({
    ...item,
    x: Math.max(0, Math.min(config.cols - item.w, item.x)),
    w: Math.max(1, Math.min(config.cols, item.w)),
    h: Math.max(1, item.h),
    minW: Math.max(1, item.minW || 1),
    maxW: item.maxW ? Math.min(config.cols, item.maxW) : config.cols
  }));
}