import { memo, useState } from 'react';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
}

const ProcessMonitorWidget: React.FC<WidgetProps> = ({ widgetId, onRemove }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const processes = useSystemResourceStore((state) => state.data.processes);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const processCount = config.processCount || 5;
  const sortBy = config.sortBy || 'cpu';

  // 프로세스 정렬 및 제한
  const getSortedProcesses = () => {
    const sorted = [...processes].sort((a, b) => {
      if (sortBy === 'cpu') return b.cpu - a.cpu;
      if (sortBy === 'memory') return b.memory - a.memory;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
    
    return sorted.slice(0, processCount);
  };

  const sortedProcesses = getSortedProcesses();

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  const formatProcessName = (name: string) => {
    if (name.length > 20) {
      return name.substring(0, 17) + '...';
    }
    return name;
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
                  <div key={`${process.pid}-${index}`} className="process-item">
                    <div className="process-name" title={process.name}>
                      {formatProcessName(process.name)}
                    </div>
                    <div className="process-pid">
                      {process.pid}
                    </div>
                    <div 
                      className="process-cpu"
                      style={{ 
                        color: process.cpu > 50 ? 'var(--color-error)' : 
                               process.cpu > 25 ? 'var(--color-warning)' : 
                               'var(--color-success)' 
                      }}
                    >
                      {process.cpu.toFixed(1)}%
                    </div>
                    <div 
                      className="process-memory"
                      style={{ 
                        color: process.memory > 50 ? 'var(--color-error)' : 
                               process.memory > 25 ? 'var(--color-warning)' : 
                               'var(--color-success)' 
                      }}
                    >
                      {process.memory.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
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
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { processCount: parseInt(e.target.value) });
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
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { sortBy: e.target.value as 'cpu' | 'memory' | 'name' });
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

export default memo(ProcessMonitorWidget);