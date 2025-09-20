import type { Layout } from 'react-grid-layout';
import type { Breakpoint, ResponsiveLayouts, WidgetType } from '../stores/types';
import {
  getOptimalWidgetSize,
  getAlternativeWidgetSize,
  canWidgetFit,
  WIDGET_SIZE_CONSTRAINTS,
  type SizeDimensions
} from './widgetSizeDefinitions';

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
 * Convert a layout from one breakpoint to another with widget-type-aware sizing
 */
export function convertLayoutSmart(
  layout: Layout[],
  fromBreakpoint: Breakpoint,
  toBreakpoint: Breakpoint,
  widgets: Array<{i: string, type: WidgetType}>
): Layout[] {
  const fromConfig = BREAKPOINT_CONFIGS[fromBreakpoint];
  const toConfig = BREAKPOINT_CONFIGS[toBreakpoint];
  const scaleFactor = toConfig.cols / fromConfig.cols;

  console.log(`[LayoutUtils] Converting layout: ${fromBreakpoint} → ${toBreakpoint}, scale: ${scaleFactor}`);

  return layout.map(item => {
    // Find widget type
    const widget = widgets.find(w => w.i === item.i);

    if (widget) {
      // Use widget-type-specific optimal size
      const [optimalW, optimalH] = getOptimalWidgetSize(widget.type, toBreakpoint);
      const constraints = WIDGET_SIZE_CONSTRAINTS[widget.type];

      const newX = Math.max(0, Math.min(toConfig.cols - optimalW, Math.round(item.x * scaleFactor)));

      console.log(`[LayoutUtils] Widget ${widget.i} (${widget.type}): ${item.w}×${item.h} → ${optimalW}×${optimalH}, x: ${item.x} → ${newX}`);

      return {
        ...item,
        x: newX,
        w: optimalW,
        h: optimalH,
        minW: constraints?.min[0] || optimalW,
        maxW: constraints?.max[0] || toConfig.cols,
        minH: constraints?.min[1] || optimalH,
        maxH: constraints?.max[1] || 10
      };
    } else {
      // Fallback: enhanced proportional conversion with minimum guarantees
      const newW = Math.max(3, Math.min(toConfig.cols, Math.round(item.w * scaleFactor)));
      const newH = Math.max(2, Math.round(item.h || 3));
      const newX = Math.max(0, Math.min(toConfig.cols - newW, Math.round(item.x * scaleFactor)));

      console.log(`[LayoutUtils] Unknown widget ${item.i}: ${item.w}×${item.h} → ${newW}×${newH} (fallback), x: ${item.x} → ${newX}`);

      return {
        ...item,
        x: newX,
        w: newW,
        h: newH,
        minW: Math.max(3, Math.round((item.minW || 1) * scaleFactor)),
        maxW: item.maxW ? Math.min(toConfig.cols, Math.round(item.maxW * scaleFactor)) : toConfig.cols
      };
    }
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

/**
 * Calculate the Y position at the bottom of all existing widgets
 */
function calculateBottomPosition(existingLayouts: Layout[]): number {
  if (existingLayouts.length === 0) {
    return 0;
  }

  // Find the maximum Y + height position among all existing widgets
  const maxBottomY = existingLayouts.reduce((maxY, layout) => {
    return Math.max(maxY, layout.y + layout.h);
  }, 0);

  return maxBottomY;
}

/**
 * Find optimal position for a new widget with dynamic sizing
 */
export function findOptimalWidgetPosition(
  widgetType: WidgetType,
  existingLayouts: Layout[],
  breakpoint: Breakpoint = 'lg'
): Layout {
  const config = BREAKPOINT_CONFIGS[breakpoint];
  const gridWidth = config.cols;

  // Get optimal size for this widget type and breakpoint
  const [optimalWidth, optimalHeight] = getOptimalWidgetSize(widgetType, breakpoint);

  // Get minimum constraints to ensure we never go below them
  const constraints = WIDGET_SIZE_CONSTRAINTS[widgetType];
  const [absoluteMinWidth, absoluteMinHeight] = constraints?.min || [3, 2];

  console.log(`[Layout] Finding position for ${widgetType}: optimal=${optimalWidth}×${optimalHeight}, min=${absoluteMinWidth}×${absoluteMinHeight}`);

  // Create a set of occupied positions for collision detection
  const occupiedPositions = new Set<string>();
  existingLayouts.forEach(layout => {
    for (let x = layout.x; x < layout.x + layout.w; x++) {
      for (let y = layout.y; y < layout.y + layout.h; y++) {
        occupiedPositions.add(`${x},${y}`);
      }
    }
  });

  // Enhanced widget placement with smart collision detection
  const tryPlaceWidget = (width: number, height: number) => {
    // Calculate maximum possible search height based on existing widgets
    const maxExistingY = existingLayouts.reduce((max, layout) =>
      Math.max(max, layout.y + layout.h), 0
    );
    const searchHeight = Math.max(20, maxExistingY + 10); // Dynamic search depth

    // Search for empty space (top to bottom, left to right)
    for (let y = 0; y < searchHeight; y++) {
      for (let x = 0; x <= gridWidth - width; x++) {
        // Quick boundary check first
        if (x + width > gridWidth) continue;

        let canPlace = true;

        // Optimized collision detection - check corners first for quick rejection
        if (occupiedPositions.has(`${x},${y}`) ||
            occupiedPositions.has(`${x + width - 1},${y}`) ||
            occupiedPositions.has(`${x},${y + height - 1}`) ||
            occupiedPositions.has(`${x + width - 1},${y + height - 1}`)) {
          continue; // Quick rejection if any corner is occupied
        }

        // Full area check only if corners are free
        for (let dx = 0; dx < width && canPlace; dx++) {
          for (let dy = 0; dy < height && canPlace; dy++) {
            if (occupiedPositions.has(`${x + dx},${y + dy}`)) {
              canPlace = false;
            }
          }
        }

        if (canPlace) {
          return { x, y, w: width, h: height };
        }
      }
    }
    return null;
  };

  // First attempt: optimal size
  let position = tryPlaceWidget(optimalWidth, optimalHeight);

  if (position) {
    console.log(`[Layout] Found space for ${widgetType} with optimal size ${optimalWidth}×${optimalHeight}`);
    return {
      i: '', // Will be set by caller
      ...position
    };
  }

  console.log(`[Layout] No space for optimal size ${optimalWidth}×${optimalHeight}, trying alternatives...`);

  // Second attempt: try alternative sizes if optimal doesn't fit
  const alternativeSize = getAlternativeWidgetSize(
    widgetType,
    breakpoint,
    Math.min(gridWidth, optimalWidth),
    optimalHeight
  );

  const [altWidth, altHeight] = alternativeSize;
  position = tryPlaceWidget(altWidth, altHeight);

  if (position) {
    return {
      i: '',
      ...position
    };
  }

  // Third attempt: try optimal size first, then progressively smaller (respecting minimum constraints)

  // Try optimal size once more in case space opened up
  position = tryPlaceWidget(optimalWidth, optimalHeight);
  if (position) {
    console.log(`[Layout] Found delayed space for ${widgetType} with optimal size ${optimalWidth}×${optimalHeight}`);
    return {
      i: '',
      ...position
    };
  }

  // Then progressively reduce from alternative size down to minimum
  for (let width = altWidth; width >= absoluteMinWidth; width--) {
    for (let height = altHeight; height >= absoluteMinHeight; height--) {
      // Skip if this is the same as alternative size (already tried)
      if (width === altWidth && height === altHeight) continue;

      position = tryPlaceWidget(width, height);
      if (position) {
        console.log(`[Layout] Found space for ${widgetType} with reduced size ${width}×${height} (min: ${absoluteMinWidth}×${absoluteMinHeight})`);
        return {
          i: '',
          ...position
        };
      }
    }
  }

  // Last resort: place at bottom with optimal size instead of minimum
  const bottomY = calculateBottomPosition(existingLayouts);

  // Use optimal size to maintain consistent widget appearance
  const finalWidth = Math.min(optimalWidth, gridWidth);
  const finalHeight = optimalHeight;

  console.log(`[Layout] Last resort for ${widgetType}: using optimal size ${finalWidth}×${finalHeight} at Y=${bottomY}`);

  return {
    i: '',
    x: 0,
    y: bottomY,
    w: finalWidth,
    h: finalHeight
  };
}

/**
 * Force place widget with minimum guaranteed size by pushing existing widgets down
 */
export function forceOptimalWidgetPlacement(
  widgetType: WidgetType,
  existingLayouts: Layout[],
  breakpoint: Breakpoint = 'lg'
): Layout {
  const [optimalWidth, optimalHeight] = getOptimalWidgetSize(widgetType, breakpoint);
  const constraints = WIDGET_SIZE_CONSTRAINTS[widgetType];
  const [minWidth, minHeight] = constraints?.min || [3, 2];

  // Use optimal size if possible, otherwise use minimum guaranteed size
  const targetWidth = Math.max(minWidth, optimalWidth);
  const targetHeight = Math.max(minHeight, optimalHeight);

  console.log(`[Layout] Force placing ${widgetType} with guaranteed size ${targetWidth}×${targetHeight}`);

  return {
    i: '',
    x: 0,
    y: 0, // Place at top, push others down
    w: targetWidth,
    h: targetHeight
  };
}

/**
 * Calculate available space in a grid layout
 */
export function calculateAvailableSpace(
  existingLayouts: Layout[],
  breakpoint: Breakpoint = 'lg'
): { maxContiguousWidth: number; maxContiguousHeight: number; totalFreeSlots: number } {
  const config = BREAKPOINT_CONFIGS[breakpoint];
  const gridWidth = config.cols;

  // Find the maximum Y coordinate to determine grid height
  const maxY = existingLayouts.reduce((max, layout) =>
    Math.max(max, layout.y + layout.h), 0
  );
  const gridHeight = Math.max(20, maxY + 5); // Add some buffer

  // Create occupied position set
  const occupiedPositions = new Set<string>();
  existingLayouts.forEach(layout => {
    for (let x = layout.x; x < layout.x + layout.w; x++) {
      for (let y = layout.y; y < layout.y + layout.h; y++) {
        occupiedPositions.add(`${x},${y}`);
      }
    }
  });

  let maxContiguousWidth = 0;
  let maxContiguousHeight = 0;
  let totalFreeSlots = 0;

  // Check each position for the largest contiguous area
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (!occupiedPositions.has(`${x},${y}`)) {
        totalFreeSlots++;

        // Check maximum width from this position
        let width = 0;
        while (x + width < gridWidth && !occupiedPositions.has(`${x + width},${y}`)) {
          width++;
        }
        maxContiguousWidth = Math.max(maxContiguousWidth, width);

        // Check maximum height from this position
        let height = 0;
        while (y + height < gridHeight && !occupiedPositions.has(`${x},${y + height}`)) {
          height++;
        }
        maxContiguousHeight = Math.max(maxContiguousHeight, height);
      }
    }
  }

  return {
    maxContiguousWidth,
    maxContiguousHeight,
    totalFreeSlots
  };
}

/**
 * Get grid utilization statistics
 */
export function getGridUtilization(
  existingLayouts: Layout[],
  breakpoint: Breakpoint = 'lg'
): { utilizationPercentage: number; occupiedSlots: number; totalVisibleSlots: number } {
  const config = BREAKPOINT_CONFIGS[breakpoint];
  const gridWidth = config.cols;

  const maxY = existingLayouts.reduce((max, layout) =>
    Math.max(max, layout.y + layout.h), 0
  );

  const totalVisibleSlots = gridWidth * Math.max(10, maxY); // Minimum 10 rows visible

  const occupiedSlots = existingLayouts.reduce((total, layout) =>
    total + (layout.w * layout.h), 0
  );

  const utilizationPercentage = totalVisibleSlots > 0
    ? (occupiedSlots / totalVisibleSlots) * 100
    : 0;

  return {
    utilizationPercentage,
    occupiedSlots,
    totalVisibleSlots
  };
}