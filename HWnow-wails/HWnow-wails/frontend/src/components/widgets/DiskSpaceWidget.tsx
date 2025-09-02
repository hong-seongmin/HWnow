import React, { memo, useState, useEffect } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { formatBytes } from '../../utils/formatters';
import './widget.css';

// Error Boundary Component
class DiskSpaceWidgetErrorBoundary extends React.Component<
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
    console.error('[DiskSpaceWidget] Rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="widget widget-disk-space" role="region" aria-label="Disk Space Monitor - Error">
          <div className="widget-header">
            <div className="widget-title">
              <div className="widget-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              </div>
              <span>Disk Space</span>
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
              <div className="widget-error-subtitle">Failed to display disk space data</div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Data validation utility functions
const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value) && value >= 0;
};

const validateDiskData = (data: number[]): boolean => {
  return Array.isArray(data) && data.length > 0 && data.every(isValidNumber);
};

const getSafeValue = (data: number[], defaultValue: number = 0): number => {
  if (!validateDiskData(data)) return defaultValue;
  const latestValue = data[data.length - 1];
  return isValidNumber(latestValue) ? latestValue : defaultValue;
};

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const DiskSpaceWidgetContent: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const diskTotalData = useSystemResourceStore((state) => state.data.disk_total);
  const diskUsedData = useSystemResourceStore((state) => state.data.disk_used);
  const diskFreeData = useSystemResourceStore((state) => state.data.disk_free);
  const diskUsagePercentData = useSystemResourceStore((state) => state.data.disk_usage_percent);

  // 데이터 로딩 상태 관리
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000); // 3초 후 로딩 상태 해제

    return () => clearTimeout(timer);
  }, []);

  // 데이터 수신 시 로딩 상태 해제
  useEffect(() => {
    if (diskTotalData.length > 0 || diskUsedData.length > 0) {
      setIsLoading(false);
    }
  }, [diskTotalData, diskUsedData]);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  
  // Safe data extraction with validation
  const latestTotal = getSafeValue(diskTotalData, 0);
  const latestUsed = getSafeValue(diskUsedData, 0);
  const latestFree = getSafeValue(diskFreeData, 0);
  const latestUsagePercent = getSafeValue(diskUsagePercentData, 0);

  // 데이터 가용성 확인 (더 엄격한 검증)
  const hasDiskData = validateDiskData(diskTotalData) || validateDiskData(diskUsedData) || 
                     validateDiskData(diskFreeData) || validateDiskData(diskUsagePercentData);
  
  // Additional safety check for percentage values
  const safeUsagePercent = Math.min(Math.max(latestUsagePercent, 0), 100);
  
  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('[DiskSpaceWidget] Data state:', {
      total: latestTotal,
      used: latestUsed,
      free: latestFree,
      percent: latestUsagePercent,
      hasDiskData
    });
  }

  const showTotalSpace = config.showTotalSpace !== false;
  const showUsedSpace = config.showUsedSpace !== false;
  const showFreeSpace = config.showFreeSpace !== false;
  const showPercentage = config.showPercentage !== false;
  const showGraph = config.showGraph !== false;

  // 사용률에 따른 색상 결정 (안전한 퍼센트 사용)
  const getUsageColor = (percentage: number) => {
    const warningThreshold = config.warningThreshold || 75;
    const criticalThreshold = config.criticalThreshold || 90;
    
    if (percentage > criticalThreshold) return 'var(--color-error)';
    if (percentage > warningThreshold) return 'var(--color-warning)';
    return config.color || 'var(--color-success)';
  };

  const usageColor = getUsageColor(safeUsagePercent);
  
  // Safe formatting functions
  const safeFormatBytes = (bytes: number): string => {
    try {
      return formatBytes(bytes);
    } catch (error) {
      console.warn('[DiskSpaceWidget] Format error:', error, 'bytes:', bytes);
      return '0 B';
    }
  };

  // 파이 차트 데이터
  const pieData = [
    { name: 'Used', value: latestUsed, color: usageColor },
    { name: 'Free', value: latestFree, color: 'var(--color-border)' }
  ];

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  return (
    <>
      <div className="widget widget-disk-space" role="region" aria-label="Disk Space Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="Disk space widget settings"
              aria-label="Open Disk space widget settings"
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
                title="Expand Disk Space widget"
                aria-label="Expand Disk Space widget"
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
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <span id="disk-space-widget-title">Disk Space</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove Disk Space widget"
              aria-label="Remove Disk Space widget"
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
              <div className="widget-loading-text">Loading disk data...</div>
            </div>
          ) : !hasDiskData ? (
            <div className="widget-no-data">
              <div className="widget-no-data-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              </div>
              <div className="widget-no-data-message">No disk data available</div>
              <div className="widget-no-data-subtitle">Disk monitoring may not be supported or enabled</div>
            </div>
          ) : (
            <>
              {showPercentage && (
                <div 
                  className="widget-value" 
                  role="status" 
                  aria-live="polite" 
                  aria-atomic="true"
                  aria-label={`Disk usage is ${safeUsagePercent.toFixed(1)} percent`}
                >
                  <span className="widget-value-number" style={{ color: usageColor }}>
                    {safeUsagePercent.toFixed(1)}
                  </span>
                  <span className="widget-value-unit" aria-label="percent">%</span>
                </div>
              )}
              
              <div className="widget-info" role="complementary" aria-label="Disk space information">
                {showTotalSpace && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Total:</span>
                    <span className="widget-info-value">
                      {safeFormatBytes(latestTotal)}
                    </span>
                  </div>
                )}
                {showUsedSpace && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Used:</span>
                    <span className="widget-info-value" style={{ color: usageColor }}>
                      {safeFormatBytes(latestUsed)}
                    </span>
                  </div>
                )}
                {showFreeSpace && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Free:</span>
                    <span className="widget-info-value">
                      {safeFormatBytes(latestFree)}
                    </span>
                  </div>
                )}
              </div>
              
              {showGraph && (
                <div className="widget-chart" role="img" aria-label="Disk space usage chart">
                  <ResponsiveContainer width="100%" height="100%">
                    {config.chartType === 'bar' ? (
                      <BarChart data={[{ used: latestUsed, free: latestFree }]} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                        <XAxis hide />
                        <YAxis hide />
                        <Tooltip
                          formatter={(value: number, name: string) => [safeFormatBytes(value), name === 'used' ? 'Used' : 'Free']}
                          labelFormatter={() => ''}
                          contentStyle={{ 
                            backgroundColor: 'var(--color-surface)', 
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text-primary)'
                          }}
                        />
                        <Bar dataKey="used" fill={usageColor} stackId="disk" />
                        <Bar dataKey="free" fill="var(--color-border)" stackId="disk" />
                      </BarChart>
                    ) : (
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius="50%"
                          outerRadius="80%"
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [safeFormatBytes(value), '']}
                          contentStyle={{ 
                            backgroundColor: 'var(--color-surface)', 
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text-primary)'
                          }}
                        />
                      </PieChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {widget && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          title="Disk Space Widget 설정"
        >
          <div className="settings-section">
            <label>
              <input 
                type="checkbox" 
                checked={showTotalSpace}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showTotalSpace: e.target.checked });
                }}
              />
              Show total space
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showUsedSpace}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showUsedSpace: e.target.checked });
                }}
              />
              Show used space
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showFreeSpace}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showFreeSpace: e.target.checked });
                }}
              />
              Show free space
            </label>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

// Main component with Error Boundary
const DiskSpaceWidget: React.FC<WidgetProps> = (props) => {
  return (
    <DiskSpaceWidgetErrorBoundary widgetId={props.widgetId}>
      <DiskSpaceWidgetContent {...props} />
    </DiskSpaceWidgetErrorBoundary>
  );
};

export default memo(DiskSpaceWidget);