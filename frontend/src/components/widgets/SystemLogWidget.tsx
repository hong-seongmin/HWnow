import { memo, useState, useEffect } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
}

const SystemLogWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const logCount = config.logCount || 10;
  const logLevel = config.logLevel || 'all';

  // 모의 로그 데이터 생성 (실제로는 백엔드에서 받아와야 함)
  useEffect(() => {
    const generateMockLogs = () => {
      const levels: ('error' | 'warning' | 'info')[] = ['error', 'warning', 'info'];
      const messages = [
        'System startup completed successfully',
        'Warning: High CPU usage detected',
        'Error: Failed to connect to network',
        'Info: User logged in',
        'Warning: Memory usage above 80%',
        'Error: Disk space critically low',
        'Info: Backup completed',
        'Warning: Temperature sensor reading high',
        'Error: Service crashed and restarted',
        'Info: System update available'
      ];

      const mockLogs: LogEntry[] = [];
      for (let i = 0; i < 20; i++) {
        const now = new Date();
        const timestamp = new Date(now.getTime() - (i * 60000)); // 각 로그마다 1분씩 차이
        
        mockLogs.push({
          timestamp: timestamp.toLocaleTimeString(),
          level: levels[Math.floor(Math.random() * levels.length)],
          message: messages[Math.floor(Math.random() * messages.length)]
        });
      }
      
      setLogs(mockLogs);
    };

    generateMockLogs();
    const interval = setInterval(generateMockLogs, 30000); // 30초마다 업데이트

    return () => clearInterval(interval);
  }, []);

  // 로그 필터링
  const getFilteredLogs = () => {
    let filtered = logs;
    
    if (logLevel !== 'all') {
      filtered = logs.filter(log => log.level === logLevel);
    }
    
    return filtered.slice(0, logCount);
  };

  const filteredLogs = getFilteredLogs();

  // 로그 레벨별 카운트
  const getLogCounts = () => {
    return {
      error: logs.filter(log => log.level === 'error').length,
      warning: logs.filter(log => log.level === 'warning').length,
      info: logs.filter(log => log.level === 'info').length,
    };
  };

  const logCounts = getLogCounts();

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'var(--color-error)';
      case 'warning': return 'var(--color-warning)';
      case 'info': return 'var(--color-info)';
      default: return 'var(--color-text-primary)';
    }
  };

  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'warning':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'info':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
      default:
        return null;
    }
  };

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  return (
    <>
      <div className="widget widget-system-log" role="region" aria-label="System Log Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="System log widget settings"
              aria-label="Open System log widget settings"
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
                title="Expand System Log widget"
                aria-label="Expand System Log widget"
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10,9 9,9 8,9" />
              </svg>
            </div>
            <span id="system-log-widget-title">System Logs</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove System Log widget"
              aria-label="Remove System Log widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="widget-content">
          <div className="log-summary" role="status" aria-live="polite" aria-atomic="true">
            <div className="log-count-item">
              <span className="log-count-label" style={{ color: getLogLevelColor('error') }}>
                Errors: {logCounts.error}
              </span>
            </div>
            <div className="log-count-item">
              <span className="log-count-label" style={{ color: getLogLevelColor('warning') }}>
                Warnings: {logCounts.warning}
              </span>
            </div>
            <div className="log-count-item">
              <span className="log-count-label" style={{ color: getLogLevelColor('info') }}>
                Info: {logCounts.info}
              </span>
            </div>
          </div>
          
          <div className="log-list" role="complementary" aria-label="Recent log entries">
            {filteredLogs.length === 0 ? (
              <div className="log-entry">
                <span className="log-message">No logs available</span>
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div key={index} className="log-entry">
                  <div className="log-entry-header">
                    <span className="log-timestamp">{log.timestamp}</span>
                    <span 
                      className="log-level" 
                      style={{ color: getLogLevelColor(log.level) }}
                    >
                      <span className="log-level-icon">
                        {getLogLevelIcon(log.level)}
                      </span>
                      {log.level.toUpperCase()}
                    </span>
                  </div>
                  <div className="log-message">
                    {log.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {widget && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          title="System Log Widget 설정"
        >
          <div className="settings-section">
            <label>
              Log count:
              <select 
                value={logCount}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { logCount: parseInt(e.target.value) });
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
            <label>
              Log level:
              <select 
                value={logLevel}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { logLevel: e.target.value as 'all' | 'error' | 'warning' | 'info' });
                }}
              >
                <option value="all">All</option>
                <option value="error">Error only</option>
                <option value="warning">Warning only</option>
                <option value="info">Info only</option>
              </select>
            </label>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

export default memo(SystemLogWidget);