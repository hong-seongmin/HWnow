// GPU Process Widget Module - Centralized Export

export { GpuProcessWidget as default } from './GpuProcessWidget';
export { GPUProcessErrorBoundary } from './ErrorBoundary';
export { ProcessTable } from './ProcessTable';
export { useWidgetState, useProcessOperations } from './WidgetStateManager';
export { ProcessOperationsHandler } from './ProcessOperations';
export * from './DataProcessor';

// Re-export main component
export { GpuProcessWidget } from './GpuProcessWidget';