import React, { memo, useState, useEffect } from 'react';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import './widget.css';

// Error Boundary Component for ProcessMonitorWidget
class ProcessMonitorErrorBoundary extends React.Component<
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
    console.error('[ProcessMonitorWidget] Rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="widget widget-process-monitor" role="region" aria-label="Process Monitor - Error">
          <div className="widget-header">
            <div className="widget-title">
              <div className="widget-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L13 14l-3.086-3.086a2 2 0 0 0-2.828 0L3 15" />
                </svg>
              </div>
              <span>Top Processes</span>
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
              <div className="widget-error-subtitle">Failed to display process data</div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Data validation utility functions
interface ProcessData {
  Name: string;
  PID: number;
  CPUPercent: number;
  MemoryPercent: number;
}

const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

const isValidProcess = (process: unknown): process is ProcessData => {
  if (!process || typeof process !== 'object') return false;
  
  const p = process as any;
  return (
    typeof p.Name === 'string' && p.Name.length > 0 &&
    isValidNumber(p.PID) && p.PID > 0 &&
    isValidNumber(p.CPUPercent) && p.CPUPercent >= 0 &&
    isValidNumber(p.MemoryPercent) && p.MemoryPercent >= 0
  );
};

const getSafeProcesses = (processes: unknown[]): ProcessData[] => {
  if (!Array.isArray(processes)) return [];
  
  return processes
    .filter(isValidProcess)
    .map(process => ({
      ...process,
      CPUPercent: Math.min(Math.max(process.CPUPercent, 0), 999), // Cap CPU at 999%
      MemoryPercent: Math.min(Math.max(process.MemoryPercent, 0), 100) // Cap memory at 100%
    }));
};

const safeToFixed = (value: number, digits: number = 1): string => {
  try {
    if (!isValidNumber(value)) return '0.0';
    return value.toFixed(digits);
  } catch (error) {
    console.warn('[ProcessMonitorWidget] toFixed error:', error, 'value:', value);
    return '0.0';
  }
};

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const ProcessMonitorWidgetContent: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const rawProcesses = useSystemResourceStore((state) => state.data.top_processes);
  
  // Safe process data extraction
  const processes = getSafeProcesses(rawProcesses);

  // 데이터 로딩 상태 관리
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000); // 3초 후 로딩 상태 해제

    return () => clearTimeout(timer);
  }, []);

  // 데이터 수신 시 로딩 상태 해제
  useEffect(() => {
    if (processes.length > 0) {
      setIsLoading(false);
    }
  }, [processes]);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const processCount = Math.min(Math.max(parseInt(config.processCount) || 5, 1), 50); // Safe range 1-50
  const sortBy = ['cpu', 'memory', 'name'].includes(config.sortBy) ? config.sortBy : 'cpu'; // Safe sort option
  
  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('[ProcessMonitorWidget] Data state:', {
      rawProcessCount: Array.isArray(rawProcesses) ? rawProcesses.length : 'not array',
      validProcessCount: processes.length,
      sortBy,
      processCount
    });
  }

  // 데이터 가용성 확인
  const hasProcessData = processes.length > 0;

  // 안전한 프로세스 정렬 및 제한
  const getSortedProcesses = (): ProcessData[] => {
    if (!Array.isArray(processes) || processes.length === 0) return [];
    
    try {
      const sorted = [...processes].sort((a, b) => {
        if (sortBy === 'cpu') {
          const aVal = isValidNumber(a.CPUPercent) ? a.CPUPercent : 0;
          const bVal = isValidNumber(b.CPUPercent) ? b.CPUPercent : 0;
          return bVal - aVal;
        }
        if (sortBy === 'memory') {
          const aVal = isValidNumber(a.MemoryPercent) ? a.MemoryPercent : 0;
          const bVal = isValidNumber(b.MemoryPercent) ? b.MemoryPercent : 0;
          return bVal - aVal;
        }
        if (sortBy === 'name') {
          const aName = typeof a.Name === 'string' ? a.Name : '';
          const bName = typeof b.Name === 'string' ? b.Name : '';
          return aName.localeCompare(bName);
        }
        return 0;
      });
      
      return sorted.slice(0, processCount);
    } catch (error) {
      console.warn('[ProcessMonitorWidget] Sort error:', error);
      return processes.slice(0, processCount); // Fallback without sorting
    }
  };

  const sortedProcesses = getSortedProcesses();

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  const formatProcessName = (Name: string) => {
    try {
      if (typeof Name !== 'string') return 'Unknown';
      if (Name.length > 20) {
        return Name.substring(0, 17) + '...';
      }
      return Name;
    } catch (error) {
      console.warn('[ProcessMonitorWidget] Format name error:', error);
      return 'Unknown';
    }
  };
  
  // Safe key generation for React
  const getSafeKey = (process: ProcessData, index: number): string => {
    try {
      const pid = isValidNumber(process.PID) ? process.PID : index;
      return `process-${pid}-${index}`;
    } catch (error) {
      return `process-fallback-${index}`;
    }
  };

  return (
    <>
      <div className="widget widget-process-monitor" role="region" aria-label="Process Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="Process monitor widget settings"
              aria-label="Open Process monitor widget settings"
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
                title="Expand Process Monitor widget"
                aria-label="Expand Process Monitor widget"
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
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L13 14l-3.086-3.086a2 2 0 0 0-2.828 0L3 15" />
              </svg>
            </div>
            <span id="process-monitor-widget-title">Top Processes</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove Process Monitor widget"
              aria-label="Remove Process Monitor widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="widget-content">
          {isLoading ? (
            <div className="widget-loading">
              <div className="widget-loading-spinner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              </div>
              <div className="widget-loading-text">Loading process data...</div>
            </div>
          ) : !hasProcessData ? (
            <div className="widget-no-data">
              <div className="widget-no-data-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L13 14l-3.086-3.086a2 2 0 0 0-2.828 0L3 15" />
                </svg>
              </div>
              <div className="widget-no-data-message">No process data available</div>
              <div className="widget-no-data-subtitle">Process monitoring may not be supported or enabled</div>
            </div>
          ) : (
            <>
              <div 
                className="widget-value" 
                role="status" 
                aria-live="polite" 
                aria-atomic="true"
                aria-label={`Showing top ${processCount} processes sorted by ${sortBy}`}
              >
                <span className="widget-value-text">
                  Top {processCount} by {sortBy.toUpperCase()}
                </span>
              </div>
              
              <div className="process-list" role="complementary" aria-label="Process list">
                {sortedProcesses.length === 0 ? (
                  <div className="process-item">
                    <span className="process-name">No processes available</span>
                  </div>
                ) : (
                  <>
                    <div className="process-header">
                      <div className="process-name-header">Process</div>
                      <div className="process-pid-header">PID</div>
                      <div className="process-cpu-header">CPU</div>
                      <div className="process-memory-header">Memory</div>
                    </div>
                    {sortedProcesses.map((process, index) => (
                      <div key={getSafeKey(process, index)} className="process-item">
                        <div className="process-name" title={process.Name}>
                          {formatProcessName(process.Name)}
                        </div>
                        <div className="process-pid">
                          {isValidNumber(process.PID) ? process.PID : 'N/A'}
                        </div>
                        <div 
                          className="process-cpu"
                          style={{ 
                            color: process.CPUPercent > 50 ? 'var(--color-error)' : 
                                   process.CPUPercent > 25 ? 'var(--color-warning)' : 
                                   'var(--color-success)' 
                          }}
                        >
                          {safeToFixed(process.CPUPercent)}%
                        </div>
                        <div 
                          className="process-memory"
                          style={{ 
                            color: process.MemoryPercent > 50 ? 'var(--color-error)' : 
                                   process.MemoryPercent > 25 ? 'var(--color-warning)' : 
                                   'var(--color-success)' 
                          }}
                        >
                          {safeToFixed(process.MemoryPercent)}%
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      
      {widget && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          title="Process Monitor Widget 설정"
        >
          <div className="settings-section">
            <label>
              Process count:
              <select 
                value={processCount}
                onChange={(e) => {
                  try {
                    const { actions } = useDashboardStore.getState();
                    const newCount = Math.min(Math.max(parseInt(e.target.value) || 5, 1), 50);
                    actions.updateWidgetConfig(widgetId, { processCount: newCount });
                  } catch (error) {
                    console.warn('[ProcessMonitorWidget] Process count update error:', error);
                  }
                }}
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
              </select>
            </label>
            <label>
              Sort by:
              <select 
                value={sortBy}
                onChange={(e) => {
                  try {
                    const { actions } = useDashboardStore.getState();
                    const validSortOptions = ['cpu', 'memory', 'name'];
                    const newSortBy = validSortOptions.includes(e.target.value) ? e.target.value : 'cpu';
                    actions.updateWidgetConfig(widgetId, { sortBy: newSortBy });
                  } catch (error) {
                    console.warn('[ProcessMonitorWidget] Sort by update error:', error);
                  }
                }}
              >
                <option value="cpu">CPU Usage</option>
                <option value="memory">Memory Usage</option>
                <option value="name">Process Name</option>
              </select>
            </label>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

// Main component with Error Boundary
const ProcessMonitorWidget: React.FC<WidgetProps> = (props) => {
  return (
    <ProcessMonitorErrorBoundary widgetId={props.widgetId}>
      <ProcessMonitorWidgetContent {...props} />
    </ProcessMonitorErrorBoundary>
  );
};

export default memo(ProcessMonitorWidget);