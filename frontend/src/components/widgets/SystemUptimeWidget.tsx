import { memo, useState } from 'react';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const SystemUptimeWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const uptimeData = useSystemResourceStore((state) => state.data.system_uptime);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const latestUptime = uptimeData.length > 0 ? uptimeData[uptimeData.length - 1] : 0;

  // 초를 읽기 쉬운 형태로 변환
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
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
      <div className="widget widget-uptime" role="region" aria-label="System Uptime Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="System uptime widget settings"
              aria-label="Open System uptime widget settings"
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
                title="Expand System Uptime widget"
                aria-label="Expand System Uptime widget"
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
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <span id="uptime-widget-title">System Uptime</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove System Uptime widget"
              aria-label="Remove System Uptime widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="widget-content">
          <div 
            className="widget-value large" 
            role="status" 
            aria-live="polite" 
            aria-atomic="true"
            aria-label={`System has been running for ${formatUptime(latestUptime)}`}
          >
            <span className="widget-value-text">
              {formatUptime(latestUptime)}
            </span>
          </div>
          
          <div className="widget-info" role="complementary" aria-label="Uptime details">
            <div className="widget-info-item">
              <span className="widget-info-label">Total seconds:</span>
              <span className="widget-info-value">
                {latestUptime.toFixed(0)}
              </span>
            </div>
            <div className="widget-info-item">
              <span className="widget-info-label">Days:</span>
              <span className="widget-info-value">
                {Math.floor(latestUptime / 86400)}
              </span>
            </div>
            <div className="widget-info-item">
              <span className="widget-info-label">Hours:</span>
              <span className="widget-info-value">
                {Math.floor((latestUptime % 86400) / 3600)}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {widget && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          title="System Uptime Widget 설정"
        >
          <div className="settings-section">
            <p>This widget displays system uptime. No additional settings are available.</p>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

export default memo(SystemUptimeWidget);