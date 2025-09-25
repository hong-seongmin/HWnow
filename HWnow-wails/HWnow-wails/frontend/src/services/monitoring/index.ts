// Monitoring Services Module - Centralized Export
export { ConfigService, type EventServiceConfig } from './EventServiceConfig';
export { PerformanceMonitor, type PerformanceMetrics } from './PerformanceMonitor';
export { PollingManager, type PollingJob } from './PollingManager';
export { GPUProcessManager, type GPUProcessBatch } from './GPUProcessManager';
export { SystemMetricsPoller } from './SystemMetricsPoller';
export { ConnectionManager, type ConnectionStatusCallback, type ConnectionStatus } from './ConnectionManager';
export { WailsEventService, wailsEventService } from './WailsEventService';

// Re-export the main service as default
export { wailsEventService as default } from './WailsEventService';