// Debug configuration for widget loading
export const DEBUG_FLAGS = {
  // Widget loading and initialization debugging
  WIDGET_LOADING: typeof window !== 'undefined' &&
                 (localStorage.getItem('WIDGET_LOADING_DEBUG') === 'true' ||
                  process.env.NODE_ENV === 'development'),

  // Disable all other debug logs by default
  WIDGET_OPERATIONS: false,
  LAYOUT_CHANGES: false,
  API_CALLS: false,
  PERFORMANCE: false,
} as const;

// Conditional logging functions
export const widgetLoadingLog = (...args: any[]) => {
  if (DEBUG_FLAGS.WIDGET_LOADING) {
    console.log(...args);
  }
};

export const widgetOperationsLog = (...args: any[]) => {
  if (DEBUG_FLAGS.WIDGET_OPERATIONS) {
    console.log(...args);
  }
};

export const layoutChangesLog = (...args: any[]) => {
  if (DEBUG_FLAGS.LAYOUT_CHANGES) {
    console.log(...args);
  }
};

export const apiCallsLog = (...args: any[]) => {
  if (DEBUG_FLAGS.API_CALLS) {
    console.log(...args);
  }
};

// Helper to enable widget loading debug from console
if (typeof window !== 'undefined') {
  (window as any).enableWidgetLoadingDebug = () => {
    localStorage.setItem('WIDGET_LOADING_DEBUG', 'true');
    console.log('Widget loading debug enabled. Refresh the page to see logs.');
  };

  (window as any).disableWidgetLoadingDebug = () => {
    localStorage.removeItem('WIDGET_LOADING_DEBUG');
    console.log('Widget loading debug disabled. Refresh the page to apply.');
  };
}