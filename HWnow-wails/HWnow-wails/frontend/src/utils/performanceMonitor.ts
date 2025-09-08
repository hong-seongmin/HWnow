// Phase 4: CPU usage tracking system
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private measurementInterval: number | null = null;
  private isRunning = false;
  private callbacks: ((metrics: PerformanceMetrics) => void)[] = [];
  
  // Performance metrics
  private metrics: PerformanceMetrics = {
    cpuUsage: 0,
    memoryUsage: 0,
    renderTime: 0,
    frameRate: 0,
    gcCollections: 0,
    widgetCpuUsage: new Map(),
    timestamp: Date.now()
  };
  
  private frameCount = 0;
  private lastFrameTime = Date.now();
  private renderObserver: PerformanceObserver | null = null;

  private constructor() {
    this.setupPerformanceObserver();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private setupPerformanceObserver() {
    if ('PerformanceObserver' in window) {
      this.renderObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.entryType === 'measure' && entry.name.includes('gpu-widget')) {
            const widgetId = entry.name.split(':')[1];
            this.metrics.widgetCpuUsage.set(widgetId, entry.duration);
          }
          
          if (entry.entryType === 'paint' || entry.entryType === 'navigation') {
            this.metrics.renderTime = entry.duration;
          }
        });
      });
      
      try {
        this.renderObserver.observe({ entryTypes: ['measure', 'paint', 'navigation'] });
      } catch (e) {
        console.warn('[PerformanceMonitor] Some performance metrics not available:', e);
      }
    }
  }

  startMonitoring(intervalMs = 30000) { // CPU OPTIMIZATION: Completely disabled to eliminate CPU overhead
    console.log('[PerformanceMonitor] Performance monitoring disabled for maximum CPU optimization');
    // All monitoring functionality disabled to eliminate CPU usage
    return;
  }

  stopMonitoring() {
    this.isRunning = false;
    if (this.measurementInterval) {
      clearInterval(this.measurementInterval);
      this.measurementInterval = null;
    }
    if (this.renderObserver) {
      this.renderObserver.disconnect();
    }
    console.log('[PerformanceMonitor] Performance monitoring stopped');
  }

  private collectMetrics() {
    // Memory usage
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    }
    
    // CPU OPTIMIZATION: Use frame rate as CPU usage indicator instead of intensive computation
    // Lower frame rates typically indicate higher CPU usage
    this.metrics.cpuUsage = Math.max(0, Math.min(100, (60 - this.metrics.frameRate) * 2)); // Simplified CPU approximation
    
    // GC approximation (memory drops)
    const currentMemory = (performance as any).memory?.usedJSHeapSize || 0;
    if (this.lastMemory && currentMemory < this.lastMemory * 0.9) {
      this.metrics.gcCollections++;
    }
    this.lastMemory = currentMemory;
    
    this.metrics.timestamp = Date.now();
  }
  
  private lastMemory = 0;

  onMetricsUpdate(callback: (metrics: PerformanceMetrics) => void) {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  private notifyCallbacks() {
    this.callbacks.forEach(callback => {
      try {
        callback({ ...this.metrics });
      } catch (error) {
        console.error('[PerformanceMonitor] Callback error:', error);
      }
    });
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  // Widget-specific performance tracking
  measureWidgetRender<T>(widgetId: string, renderFunction: () => T): T {
    const measureName = `gpu-widget:${widgetId}`;
    performance.mark(`${measureName}-start`);
    
    try {
      const result = renderFunction();
      performance.mark(`${measureName}-end`);
      performance.measure(measureName, `${measureName}-start`, `${measureName}-end`);
      return result;
    } catch (error) {
      performance.mark(`${measureName}-end`);
      performance.measure(measureName, `${measureName}-start`, `${measureName}-end`);
      throw error;
    }
  }

  // CPU usage warning system
  checkCPUThreshold(threshold = 5): boolean {
    return this.metrics.cpuUsage > threshold;
  }

  // Performance report
  generateReport(): PerformanceReport {
    const avgCpuUsage = this.metrics.cpuUsage;
    const memoryMB = this.lastMemory / (1024 * 1024);
    
    return {
      summary: {
        avgCpuUsage,
        memoryUsageMB: memoryMB,
        frameRate: this.metrics.frameRate,
        renderTimeMs: this.metrics.renderTime,
        gcCollections: this.metrics.gcCollections
      },
      widgetPerformance: Object.fromEntries(this.metrics.widgetCpuUsage),
      recommendations: this.generateRecommendations(),
      timestamp: this.metrics.timestamp
    };
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.metrics.cpuUsage > 10) {
      recommendations.push('High CPU usage detected. Consider reducing update frequency.');
    }
    
    if (this.metrics.memoryUsage > 0.8) {
      recommendations.push('High memory usage. Check for memory leaks.');
    }
    
    if (this.metrics.frameRate < 30) {
      recommendations.push('Low frame rate. Optimize rendering performance.');
    }
    
    // Widget-specific recommendations
    this.metrics.widgetCpuUsage.forEach((duration, widgetId) => {
      if (duration > 16) { // More than one frame budget
        recommendations.push(`Widget ${widgetId} is taking too long to render (${duration.toFixed(1)}ms)`);
      }
    });
    
    return recommendations;
  }
}

export interface PerformanceMetrics {
  cpuUsage: number; // Percentage
  memoryUsage: number; // Percentage
  renderTime: number; // Milliseconds
  frameRate: number; // FPS
  gcCollections: number; // Count
  widgetCpuUsage: Map<string, number>; // Widget ID -> render time
  timestamp: number;
}

export interface PerformanceReport {
  summary: {
    avgCpuUsage: number;
    memoryUsageMB: number;
    frameRate: number;
    renderTimeMs: number;
    gcCollections: number;
  };
  widgetPerformance: Record<string, number>;
  recommendations: string[];
  timestamp: number;
}

// Global performance monitor instance
export const performanceMonitor = PerformanceMonitor.getInstance();