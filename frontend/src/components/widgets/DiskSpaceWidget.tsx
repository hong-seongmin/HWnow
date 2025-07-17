import { memo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { formatBytes } from '../../utils/formatters';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const DiskSpaceWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const diskTotalData = useSystemResourceStore((state) => state.data.disk_total);
  const diskUsedData = useSystemResourceStore((state) => state.data.disk_used);
  const diskFreeData = useSystemResourceStore((state) => state.data.disk_free);
  const diskUsagePercentData = useSystemResourceStore((state) => state.data.disk_usage_percent);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const latestTotal = diskTotalData.length > 0 ? diskTotalData[diskTotalData.length - 1] : 0;
  const latestUsed = diskUsedData.length > 0 ? diskUsedData[diskUsedData.length - 1] : 0;
  const latestFree = diskFreeData.length > 0 ? diskFreeData[diskFreeData.length - 1] : 0;
  const latestUsagePercent = diskUsagePercentData.length > 0 ? diskUsagePercentData[diskUsagePercentData.length - 1] : 0;

  const showTotalSpace = config.showTotalSpace !== false;
  const showUsedSpace = config.showUsedSpace !== false;
  const showFreeSpace = config.showFreeSpace !== false;
  const showPercentage = config.showPercentage !== false;
  const showGraph = config.showGraph !== false;

  // 사용률에 따른 색상 결정
  const getUsageColor = (percentage: number) => {
    const warningThreshold = config.warningThreshold || 75;
    const criticalThreshold = config.criticalThreshold || 90;
    
    if (percentage > criticalThreshold) return 'var(--color-error)';
    if (percentage > warningThreshold) return 'var(--color-warning)';
    return config.color || 'var(--color-success)';
  };

  const usageColor = getUsageColor(latestUsagePercent);

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
          {showPercentage && (
            <div 
              className="widget-value" 
              role="status" 
              aria-live="polite" 
              aria-atomic="true"
              aria-label={`Disk usage is ${latestUsagePercent.toFixed(1)} percent`}
            >
              <span className="widget-value-number" style={{ color: usageColor }}>
                {latestUsagePercent.toFixed(1)}
              </span>
              <span className="widget-value-unit" aria-label="percent">%</span>
            </div>
          )}
          
          <div className="widget-info" role="complementary" aria-label="Disk space information">
            {showTotalSpace && (
              <div className="widget-info-item">
                <span className="widget-info-label">Total:</span>
                <span className="widget-info-value">
                  {formatBytes(latestTotal)}
                </span>
              </div>
            )}
            {showUsedSpace && (
              <div className="widget-info-item">
                <span className="widget-info-label">Used:</span>
                <span className="widget-info-value" style={{ color: usageColor }}>
                  {formatBytes(latestUsed)}
                </span>
              </div>
            )}
            {showFreeSpace && (
              <div className="widget-info-item">
                <span className="widget-info-label">Free:</span>
                <span className="widget-info-value">
                  {formatBytes(latestFree)}
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
                      formatter={(value: number, name: string) => [formatBytes(value), name === 'used' ? 'Used' : 'Free']}
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
                      formatter={(value: number) => [formatBytes(value), '']}
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

export default memo(DiskSpaceWidget);