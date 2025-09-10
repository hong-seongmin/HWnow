import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { GpuProcessSettings } from './settings/GpuProcessSettings';
import { useConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import { ButtonSpinner, InlineLoader } from '../common/LoadingSpinner';
import { killGPUProcess, suspendGPUProcess, resumeGPUProcess, setGPUProcessPriority } from '../../services/wailsApiService';
import { onConnectionStatusChange, getWebSocketStatus, flushGPUProcessBatch } from '../../services/wailsEventService';
import { GPU_PROCESS_PRESETS, type GPUProcessPresetType } from '../../utils/gpuProcessWidgetDefaults';
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

// 프로세스 이름을 스마트하게 줄이는 함수
const abbreviateProcessName = (name: string, maxLength: number = 25): string => {
  if (!name || name.length <= maxLength) return name;
  
  // Windows 경로 패턴 감지
  if (name.includes('\\') && (name.includes('Program Files') || name.includes('Users'))) {
    const parts = name.split('\\');
    const fileName = parts[parts.length - 1];
    
    // 파일명이 너무 긴 경우 확장자 유지하고 줄임
    if (fileName.length > maxLength) {
      const dotIndex = fileName.lastIndexOf('.');
      if (dotIndex > 0) {
        const nameWithoutExt = fileName.substring(0, dotIndex);
        const extension = fileName.substring(dotIndex);
        const maxNameLength = maxLength - extension.length - 3; // "..." 고려
        return `${nameWithoutExt.substring(0, maxNameLength)}...${extension}`;
      }
    }
    
    // 경로 줄임: C:\Program Files\... → C:\...\filename.exe
    if (parts.length > 3) {
      return `C:\\...\\${fileName}`;
    }
    
    return fileName;
  }
  
  // 일반 텍스트 줄임
  return `${name.substring(0, maxLength - 3)}...`;
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
  const [selectedProcesses, setSelectedProcesses] = useState<Set<number>>(new Set());
  const [isTerminating, setIsTerminating] = useState<Set<number>>(new Set());
  
  const { showToast } = useToast();
  
  const widgetRef = useRef<HTMLDivElement>(null);
  
  const rawGpuProcesses = useSystemResourceStore((state) => state.data.gpu_processes);
  const gpuProcesses = getSafeGPUProcesses(rawGpuProcesses);
  
  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  // GPU Process Widget 기본 설정
  const defaultConfig = {
    gpuProcessCount: 10,
    gpuSortBy: 'gpu_usage_percent',
    gpuSortOrder: 'desc',
    gpuFilterEnabled: false,
    gpuUsageThreshold: 0,
    gpuMemoryThreshold: 0,
    gpuFilterType: 'or',
    gpuShowTerminateButton: true,
    gpuRefreshInterval: 3,
  };

  const config = { ...defaultConfig, ...widget?.config };
  
  const processCount = config.gpuProcessCount;
  const sortBy = config.gpuSortBy;
  const sortOrder = config.gpuSortOrder;
  const filterEnabled = config.gpuFilterEnabled;
  const usageThreshold = config.gpuUsageThreshold;
  const memoryThreshold = config.gpuMemoryThreshold;
  const filterType = config.gpuFilterType;
  
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
  }, [gpuProcesses, filterEnabled, usageThreshold, memoryThreshold, filterType, widget?.config]);
  
  // GPU 프로세스 정렬 및 제한 - useMemo 최적화
  const sortedProcesses = useMemo((): GPUProcessData[] => {
    if (!Array.isArray(filteredProcesses) || filteredProcesses.length === 0) return [];
    
    const sorted = [...filteredProcesses].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'gpu_usage_percent':
          comparison = a.gpu_usage - b.gpu_usage;
          break;
        case 'gpu_memory_mb':
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
  }, [filteredProcesses, sortBy, sortOrder, processCount, widget?.config]);
  
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
    console.log('[GPUProcessWidget] Settings button clicked', { widgetId, widget });
    
    if (!widget) {
      console.error('[GPUProcessWidget] Cannot open settings: widget is undefined', { widgetId });
      showToast('위젯 설정을 열 수 없습니다. 페이지를 새로고침해주세요.', 'error');
      return;
    }
    
    setIsSettingsOpen(true);
    console.log('[GPUProcessWidget] Settings modal opened successfully');
  }, [widget, widgetId, showToast]);
  
  const handleSettingsSave = useCallback(() => {
    if (!widget) {
      console.error('[GPUProcessWidget] Cannot save settings: widget is undefined', { widgetId });
      showToast('설정을 저장할 수 없습니다. 페이지를 새로고침해주세요.', 'error');
      return;
    }
    
    console.log('[GPUProcessWidget] Settings saved successfully', { widgetId, config: widget.config });
    
    setIsSettingsOpen(false);
    showToast('GPU 프로세스 위젯 설정이 저장되었습니다.', 'success');
  }, [widget, widgetId, showToast]);
  
  const { confirmDialog } = useConfirmDialog();
  
  // 정렬 헤더 클릭 핸들러
  const handleSort = useCallback((column: string) => {
    const { actions } = useDashboardStore.getState();
    const newSortOrder = sortBy === column && sortOrder === 'desc' ? 'asc' : 'desc';
    actions.updateWidgetConfig(widgetId, { 
      gpuSortBy: column,
      gpuSortOrder: newSortOrder
    });
  }, [sortBy, sortOrder, widgetId]);
  
  // 프로세스 선택 핸들러
  const handleProcessSelect = useCallback((pid: number, isSelected: boolean) => {
    setSelectedProcesses(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(pid);
      } else {
        newSet.delete(pid);
      }
      return newSet;
    });
  }, []);
  
  // 전체 선택/해제
  const handleSelectAll = useCallback(() => {
    if (selectedProcesses.size === sortedProcesses.length) {
      setSelectedProcesses(new Set());
    } else {
      setSelectedProcesses(new Set(sortedProcesses.map(p => p.pid)));
    }
  }, [selectedProcesses.size, sortedProcesses]);
  
  // 프로세스 강제종료
  const handleTerminateProcess = useCallback(async (pid: number, processName: string) => {
    const confirmed = await confirmDialog({
      title: 'Terminate GPU Process',
      message: `Are you sure you want to terminate process:\n\n${processName} (PID: ${pid})?\n\nThis action cannot be undone and may cause data loss.`,
      confirmText: 'Terminate',
      cancelText: 'Cancel',
      type: 'danger'
    });
    
    if (!confirmed) return;
    
    setIsTerminating(prev => new Set([...prev, pid]));
    
    try {
      const result = await killGPUProcess(pid);
      if (result.success) {
        showToast(`Process ${processName} (PID: ${pid}) terminated successfully`, 'success');
        setSelectedProcesses(prev => {
          const newSet = new Set(prev);
          newSet.delete(pid);
          return newSet;
        });
      } else {
        showToast(`Failed to terminate process: ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('Failed to terminate process:', error);
      showToast(`Failed to terminate process: ${error}`, 'error');
    } finally {
      setIsTerminating(prev => {
        const newSet = new Set(prev);
        newSet.delete(pid);
        return newSet;
      });
    }
  }, [confirmDialog, showToast]);
  
  // 선택된 프로세스들 강제종료
  const handleTerminateSelected = useCallback(async () => {
    if (selectedProcesses.size === 0) return;
    
    const processNames = sortedProcesses
      .filter(p => selectedProcesses.has(p.pid))
      .map(p => `${abbreviateProcessName(p.name)} (PID: ${p.pid})`)
      .join('\n');
    
    const confirmed = await confirmDialog({
      title: `Terminate ${selectedProcesses.size} GPU Processes`,
      message: `Are you sure you want to terminate the following processes?\n\n${processNames}\n\nThis action cannot be undone and may cause data loss.`,
      confirmText: `Terminate ${selectedProcesses.size} Processes`,
      cancelText: 'Cancel',
      type: 'danger'
    });
    
    if (!confirmed) return;
    
    const pidsToTerminate = Array.from(selectedProcesses);
    setIsTerminating(prev => new Set([...prev, ...pidsToTerminate]));
    
    let successCount = 0;
    let failCount = 0;
    
    for (const pid of pidsToTerminate) {
      try {
        const result = await killGPUProcess(pid);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`Failed to terminate process ${pid}:`, error);
        failCount++;
      }
    }
    
    setIsTerminating(new Set());
    setSelectedProcesses(new Set());
    
    if (successCount > 0) {
      showToast(`Successfully terminated ${successCount} processes`, 'success');
    }
    if (failCount > 0) {
      showToast(`Failed to terminate ${failCount} processes`, 'error');
    }
  }, [selectedProcesses, sortedProcesses, confirmDialog, showToast]);
  
  // 정렬 아이콘 렌더링
  const renderSortIcon = useCallback((column: string) => {
    if (sortBy !== column) {
      return (
        <span style={{ opacity: 0.3, marginLeft: '0.25rem' }}>↕️</span>
      );
    }
    return (
      <span style={{ marginLeft: '0.25rem' }}>
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  }, [sortBy, sortOrder]);
  
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
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="GPU process monitor widget settings"
              aria-label="Open GPU process monitor widget settings"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleSettingsClick}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6m3.22-10.22l4.24-4.24m-4.24 10.46l4.24 4.24M21 12h-6m-6 0H3m10.22 3.22l-4.24 4.24m4.24-10.46L8.98 4.76" />
              </svg>
            </button>
            {!isExpanded && onExpand && (
              <button
                className="widget-action-button expand-button"
                onClick={onExpand}
                title="Expand GPU process widget"
                aria-label="Expand GPU process widget"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              </button>
            )}
          </div>
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
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove GPU process widget"
              aria-label="Remove GPU process widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
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
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleSettingsClick}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6m3.22-10.22l4.24-4.24m-4.24 10.46l4.24 4.24M21 12h-6m-6 0H3m10.22 3.22l-4.24 4.24m4.24-10.46L8.98 4.76" />
              </svg>
            </button>
            {!isExpanded && onExpand && (
              <button
                className="widget-action-button expand-button"
                onClick={onExpand}
                title="Expand GPU process widget"
                aria-label="Expand GPU process widget"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              </button>
            )}
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
          
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove GPU process widget"
              aria-label="Remove GPU process widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
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
          
          {/* Process List Header */}
          <div className="process-list-header" style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto auto auto',
            gap: 'var(--spacing-sm)',
            padding: 'var(--spacing-sm)',
            backgroundColor: 'var(--color-background-tertiary)',
            borderBottom: '2px solid var(--color-border)',
            fontWeight: 600,
            fontSize: '0.75rem',
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={selectedProcesses.size === sortedProcesses.length && sortedProcesses.length > 0}
                onChange={handleSelectAll}
                style={{ margin: 0 }}
                aria-label="Select all processes"
              />
            </div>
            <div 
              className="sortable-header"
              onClick={() => handleSort('name')}
              style={{ 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center',
                userSelect: 'none'
              }}
            >
              Process Name
              {renderSortIcon('name')}
            </div>
            <div 
              className="sortable-header"
              onClick={() => handleSort('gpu_usage')}
              style={{ 
                cursor: 'pointer', 
                textAlign: 'center',
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none'
              }}
            >
              GPU Usage
              {renderSortIcon('gpu_usage')}
            </div>
            <div 
              className="sortable-header"
              onClick={() => handleSort('gpu_memory')}
              style={{ 
                cursor: 'pointer', 
                textAlign: 'center',
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none'
              }}
            >
              VRAM
              {renderSortIcon('gpu_memory')}
            </div>
            <div style={{ textAlign: 'center' }}>Actions</div>
          </div>
          
          {/* Selected Actions Bar */}
          {selectedProcesses.size > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--spacing-sm)',
              backgroundColor: 'var(--color-warning-bg)',
              borderBottom: '1px solid var(--color-warning)',
              fontSize: '0.875rem'
            }}>
              <span>
                {selectedProcesses.size} process{selectedProcesses.size > 1 ? 'es' : ''} selected
              </span>
              <button
                onClick={handleTerminateSelected}
                disabled={isTerminating.size > 0}
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  backgroundColor: 'var(--color-danger)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--border-radius-sm)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  opacity: isTerminating.size > 0 ? 0.6 : 1
                }}
              >
                {isTerminating.size > 0 && <ButtonSpinner size="sm" />}
                Terminate Selected
              </button>
            </div>
          )}
          
          {/* Process List */}
          <div className="process-list" role="table" aria-label="GPU process list">
            {sortedProcesses.map((process, index) => (
              <div 
                key={`gpu-process-${process.pid}-${index}`}
                className={`process-item ${selectedProcesses.has(process.pid) ? 'selected' : ''}`}
                role="row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto auto auto',
                  gap: 'var(--spacing-sm)',
                  padding: 'var(--spacing-sm)',
                  borderBottom: '1px solid var(--color-border)',
                  alignItems: 'center',
                  transition: 'background-color 0.2s ease',
                  backgroundColor: selectedProcesses.has(process.pid) ? 'var(--color-primary-bg)' : 'transparent'
                }}
              >
                <div role="cell" style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedProcesses.has(process.pid)}
                    onChange={(e) => handleProcessSelect(process.pid, e.target.checked)}
                    style={{ margin: 0 }}
                    aria-label={`Select process ${process.name} (PID: ${process.pid})`}
                  />
                </div>
                <div role="cell">
                  <div 
                    style={{ 
                      fontWeight: 500, 
                      fontSize: '0.875rem',
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: process.name.length > 25 ? 'help' : 'default'
                    }}
                    title={process.name.length > 25 ? `Full path: ${process.name}\n\nCommand: ${process.command}\nType: ${process.type}` : undefined}
                  >
                    {abbreviateProcessName(process.name)}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--color-text-secondary)',
                    marginTop: '0.125rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    PID: {process.pid} • {process.status}
                  </div>
                </div>
                <div role="cell" style={{ textAlign: 'center' }}>
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
                <div role="cell" style={{ textAlign: 'center' }}>
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
                <div role="cell" style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => handleTerminateProcess(process.pid, process.name)}
                    disabled={isTerminating.has(process.pid)}
                    title={`Terminate ${abbreviateProcessName(process.name)} (PID: ${process.pid})`}
                    style={{
                      padding: 'var(--spacing-xs)',
                      backgroundColor: 'var(--color-danger)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--border-radius-sm)',
                      cursor: isTerminating.has(process.pid) ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '60px',
                      opacity: isTerminating.has(process.pid) ? 0.6 : 1,
                      transition: 'opacity 0.2s ease'
                    }}
                  >
                    {isTerminating.has(process.pid) ? (
                      <ButtonSpinner size="sm" />
                    ) : (
                      '🗑️ Kill'
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {widget && isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          title="GPU Process Widget Settings"
          onSave={handleSettingsSave}
          onClose={() => setIsSettingsOpen(false)}
        >
          <GpuProcessSettings widget={widget} />
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