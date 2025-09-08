import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { useConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import { ButtonSpinner, InlineLoader } from '../common/LoadingSpinner';
import { killGPUProcess, suspendGPUProcess, resumeGPUProcess, setGPUProcessPriority } from '../../services/wailsApiService';
import { onConnectionStatusChange, getWebSocketStatus, flushGPUProcessBatch } from '../../services/wailsEventService';
import { getGPUProcessConfigWithDefaults, GPU_PROCESS_PRESETS, type GPUProcessPresetType } from '../../utils/gpuProcessWidgetDefaults';
import { performanceMonitor, type PerformanceMetrics } from '../../utils/performanceMonitor';
import './widget.css';

// Error Boundary Component for GPUProcessWidget
class GPUProcessErrorBoundary extends React.Component<
  { children: React.ReactNode; widgetId: string },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; widgetId: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[GPUProcessWidget] Rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="widget widget-gpu-process" role="region" aria-label="GPU Process Monitor - Error">
          <div className="widget-header">
            <div className="widget-title">
              <div className="widget-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              </div>
              <span>GPU Processes</span>
            </div>
          </div>
          <div className="widget-content">
            <div className="widget-error">
              <div className="widget-error-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <div className="widget-error-message">Widget Error</div>
              <div className="widget-error-subtitle">Failed to display GPU process data</div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface GPUProcessData {
  pid: number;
  name: string;
  gpu_usage: number;
  gpu_memory: number;
  type: string;
  command: string;
  status: string;
}

const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

const isValidGPUProcess = (process: unknown): process is GPUProcessData => {
  if (!process || typeof process !== 'object') return false;
  
  const p = process as any;
  return (
    isValidNumber(p.pid) && p.pid > 0 &&
    typeof p.name === 'string' && p.name.length > 0 &&
    isValidNumber(p.gpu_usage) && p.gpu_usage >= 0 &&
    isValidNumber(p.gpu_memory) && p.gpu_memory >= 0 &&
    typeof p.type === 'string' &&
    typeof p.command === 'string' &&
    typeof p.status === 'string'
  );
};

const getSafeGPUProcesses = (processes: unknown[]): GPUProcessData[] => {
  if (!Array.isArray(processes)) return [];
  
  return processes
    .filter(isValidGPUProcess)
    .map(process => ({
      ...process,
      gpu_usage: Math.min(Math.max(process.gpu_usage, 0), 999),
      gpu_memory: Math.min(Math.max(process.gpu_memory, 0), 999999)
    }));
};

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const GpuProcessWidgetContent: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [isConnected, setIsConnected] = useState<boolean>(true);
  
  const widgetRef = useRef<HTMLDivElement>(null);
  
  const rawGpuProcesses = useSystemResourceStore((state) => state.data.gpu_processes);
  const gpuProcesses = getSafeGPUProcesses(rawGpuProcesses);
  
  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = getGPUProcessConfigWithDefaults(widget?.data || {});
  
  const processCount = config.gpuProcessCount || 5;
  const sortBy = config.gpuSortBy || 'gpu_usage';
  const sortOrder = config.gpuSortOrder || 'desc';
  const filterEnabled = config.gpuFilterEnabled || false;
  const usageThreshold = config.gpuUsageThreshold || 25;
  const memoryThreshold = config.gpuMemoryThreshold || 100;
  const filterType = config.gpuFilterType || 'or';
  
  // GPU 프로세스 필터링 - useMemo 최적화
  const filteredProcesses = useMemo((): GPUProcessData[] => {
    if (!Array.isArray(gpuProcesses) || gpuProcesses.length === 0) return [];
    if (!filterEnabled) return gpuProcesses;
    
    return gpuProcesses.filter(process => {
      const meetsUsageThreshold = process.gpu_usage >= usageThreshold;
      const meetsMemoryThreshold = process.gpu_memory >= memoryThreshold;
      
      if (filterType === 'and') {
        return meetsUsageThreshold && meetsMemoryThreshold;
      } else {
        return meetsUsageThreshold || meetsMemoryThreshold;
      }
    });
  }, [gpuProcesses, filterEnabled, usageThreshold, memoryThreshold, filterType]);
  
  // GPU 프로세스 정렬 및 제한 - useMemo 최적화
  const sortedProcesses = useMemo((): GPUProcessData[] => {
    if (!Array.isArray(filteredProcesses) || filteredProcesses.length === 0) return [];
    
    const sorted = [...filteredProcesses].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'gpu_usage':
          comparison = a.gpu_usage - b.gpu_usage;
          break;
        case 'gpu_memory':
          comparison = a.gpu_memory - b.gpu_memory;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'pid':
          comparison = a.pid - b.pid;
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted.slice(0, Math.min(processCount, 100));
  }, [filteredProcesses, sortBy, sortOrder, processCount]);
  
  // CPU 최적화: 프로세스 상태별 카운트를 useMemo로 캐싱하여 매 렌더링마다 filter 재실행 방지
  const processStatusCounts = useMemo(() => {
    const running = sortedProcesses.filter(p => p.status.toLowerCase() === 'running').length;
    const idle = sortedProcesses.filter(p => p.status.toLowerCase() === 'idle').length;
    const suspended = sortedProcesses.filter(p => p.status.toLowerCase() === 'suspended').length;
    const highUsage = sortedProcesses.filter(p => p.gpu_usage > 90).length;
    
    return { running, idle, suspended, highUsage };
  }, [sortedProcesses]);
  
  const isEmpty = useMemo(() => sortedProcesses.length === 0, [sortedProcesses.length]);
  
  // WebSocket 연결 상태 모니터링
  React.useEffect(() => {
    const unsubscribe = onConnectionStatusChange((connected) => {
      setIsConnected(connected);
    });
    
    // CPU 최적화: 정기적인 상태 확인 완전 비활성화 (CPU 사용량 대폭 감소)
    // const statusCheckInterval = setInterval(() => { ... }, 600000);
    
    return () => {
      unsubscribe();
      // clearInterval(statusCheckInterval);
    };
  }, [lastUpdateTime]);
  
  // CPU 최적화: 프로세스 변경 하이라이트 자동 제거 비활성화 (3초마다 실행되던 타이머 제거)
  // React.useEffect(() => {
  //   const cleanupTimer = setTimeout(() => { ... }, 3000);
  //   return () => clearTimeout(cleanupTimer);
  // }, [processUpdates]);
  
  const handleSettingsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  }, []);
  
  const handleSettingsSave = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);
  
  if (isEmpty) {
    return (
      <div 
        id={`gpu-process-widget-${widgetId}`}
        ref={widgetRef}
        className="widget widget-gpu-process"
        role="region" 
        aria-label="GPU Process Monitor"
        tabIndex={-1}
      >
        <div className="widget-header">
          <div className="widget-title">
            <div className="widget-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <span>GPU Processes</span>
          </div>
          <div className="widget-actions">
            <button 
              className="widget-action-button" 
              onClick={handleSettingsClick}
              title="GPU process monitor widget settings"
              aria-label="Open GPU process monitor widget settings"
            >
              ⚙️
            </button>
          </div>
        </div>
        <div className="widget-content">
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: 'var(--spacing-xl)',
            color: 'var(--color-text-secondary)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '2rem',
              marginBottom: 'var(--spacing-md)',
              opacity: 0.5
            }}>
              🎮
            </div>
            <div style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: 'var(--spacing-xs)'
            }}>
              {filterEnabled ? 
                'No processes match filter criteria' : 
                'No GPU processes detected'
              }
            </div>
            <div style={{
              fontSize: '0.75rem',
              opacity: 0.7,
              maxWidth: '200px',
              lineHeight: 1.4
            }}>
              {filterEnabled ? (
                <>
                  Try adjusting GPU usage ({usageThreshold}%) or memory ({memoryThreshold}MB) thresholds
                </>
              ) : (
                'Make sure your GPU drivers are installed and applications are using the GPU'
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <div 
        id={`gpu-process-widget-${widgetId}`}
        ref={widgetRef}
        className="widget widget-gpu-process"
        role="region" 
        aria-label="GPU Process Monitor"
        tabIndex={-1}
      >
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="GPU process monitor widget settings"
              aria-label="Open GPU process monitor widget settings"
            >
              ⚙️
            </button>
          </div>
          
          <div className="widget-title">
            <div className="widget-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <span>GPU Processes</span>
            <span className="process-count" style={{ 
              marginLeft: 'var(--spacing-xs)', 
              fontSize: '0.8rem', 
              opacity: 0.7 
            }}>
              ({sortedProcesses.length})
            </span>
          </div>
          
          <div className="widget-actions right">
            <button 
              className="widget-action-button" 
              onClick={handleSettingsClick}
              title="Widget settings"
              aria-label="Open widget settings"
            >
              ⚙️
            </button>
          </div>
        </div>
        
        <div className="widget-content">
          {/* Status Summary Row */}
          <div className="status-summary" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: 'var(--spacing-sm)',
            marginBottom: 'var(--spacing-md)',
            padding: 'var(--spacing-sm)',
            backgroundColor: 'var(--color-background-secondary)',
            borderRadius: 'var(--border-radius)',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ textAlign: 'center' }} role="group" aria-labelledby="running-status-label">
              <div 
                id="running-status-label"
                style={{ 
                  color: 'var(--color-success)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  justifyContent: 'center'
                }}
                aria-label={`실행 중인 프로세스: ${processStatusCounts.running}개`}
              >
                <div 
                  role="img"
                  aria-label="실행 중 상태 표시기"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-success)'
                  }} 
                />
                {processStatusCounts.running}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>Running</div>
            </div>
            
            <div style={{ textAlign: 'center' }} role="group" aria-labelledby="idle-status-label">
              <div 
                id="idle-status-label"
                style={{ 
                  color: 'var(--color-warning)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  justifyContent: 'center'
                }}
                aria-label={`대기 중인 프로세스: ${processStatusCounts.idle}개`}
              >
                <div 
                  role="img"
                  aria-label="대기 중 상태 표시기"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-warning)'
                  }} 
                />
                {processStatusCounts.idle}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>Idle</div>
            </div>
            
            <div style={{ textAlign: 'center' }} role="group" aria-labelledby="suspended-status-label">
              <div 
                id="suspended-status-label"
                style={{ 
                  color: 'var(--color-info)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  justifyContent: 'center'
                }}
                aria-label={`일시정지된 프로세스: ${processStatusCounts.suspended}개`}
              >
                <div 
                  role="img"
                  aria-label="일시정지 상태 표시기"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-info)'
                  }} 
                />
                {processStatusCounts.suspended}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>Suspended</div>
            </div>
            
            <div style={{ textAlign: 'center' }} role="group" aria-labelledby="high-usage-label">
              <div 
                id="high-usage-label"
                style={{ 
                  color: 'var(--color-danger)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  justifyContent: 'center'
                }}
                aria-label={`높은 GPU 사용률 프로세스: ${processStatusCounts.highUsage}개`}
              >
                <span role="img" aria-label="높은 사용률 표시">🔥</span> {processStatusCounts.highUsage}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>High Usage</div>
            </div>
          </div>
          
          {/* Process List */}
          <div className="process-list" role="table" aria-label="GPU process list">
            {sortedProcesses.map((process, index) => (
              <div 
                key={`gpu-process-${process.pid}-${index}`}
                className="process-item"
                role="row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: 'var(--spacing-sm)',
                  padding: 'var(--spacing-sm)',
                  borderBottom: '1px solid var(--color-border)',
                  alignItems: 'center',
                  transition: 'background-color 0.2s ease'
                }}
              >
                <div role="cell">
                  <div style={{ 
                    fontWeight: 500, 
                    fontSize: '0.875rem',
                    color: 'var(--color-text-primary)'
                  }}>
                    {process.name}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--color-text-secondary)',
                    marginTop: '0.125rem'
                  }}>
                    PID: {process.pid} • {process.status}
                  </div>
                </div>
                <div role="cell" style={{ textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 500,
                    color: process.gpu_usage > 90 ? 'var(--color-danger)' : 'var(--color-text-primary)'
                  }}>
                    {process.gpu_usage.toFixed(1)}%
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--color-text-secondary)'
                  }}>
                    GPU
                  </div>
                </div>
                <div role="cell" style={{ textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 500,
                    color: 'var(--color-text-primary)'
                  }}>
                    {(process.gpu_memory / 1024).toFixed(1)}GB
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--color-text-secondary)'
                  }}>
                    VRAM
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {isSettingsOpen && (
        <SettingsModal
          title="GPU Process Widget Settings"
          onSave={handleSettingsSave}
          onCancel={() => setIsSettingsOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                Process Count: {processCount}
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={processCount}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuProcessCount: parseInt(e.target.value) });
                }}
                style={{ width: '100%' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                Sort By:
              </label>
              <select
                value={sortBy}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuSortBy: e.target.value as any });
                }}
                style={{ width: '100%', padding: 'var(--spacing-xs)' }}
              >
                <option value="gpu_usage">GPU Usage</option>
                <option value="gpu_memory">GPU Memory</option>
                <option value="name">Name</option>
                <option value="pid">PID</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                Sort Order:
              </label>
              <select
                value={sortOrder}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuSortOrder: e.target.value as any });
                }}
                style={{ width: '100%', padding: 'var(--spacing-xs)' }}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

// Main component with Error Boundary
const GpuProcessWidget: React.FC<WidgetProps> = (props) => {
  return (
    <GPUProcessErrorBoundary widgetId={props.widgetId}>
      <GpuProcessWidgetContent {...props} />
    </GPUProcessErrorBoundary>
  );
};

export default memo(GpuProcessWidget);