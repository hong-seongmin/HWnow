import { memo, useState } from 'react';
import { ResponsiveContainer, AreaChart, LineChart, BarChart, XAxis, YAxis, Tooltip, Area, Line, Bar } from 'recharts';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { DiskSettings } from './settings/DiskSettings';
import { formatBytes } from '../../utils/formatters';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
}

const DiskWidget: React.FC<WidgetProps> = ({ widgetId, onRemove }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const diskReadData = useSystemResourceStore((state) => state.data.disk_read);
  const diskWriteData = useSystemResourceStore((state) => state.data.disk_write);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const latestRead = diskReadData.length > 0 ? diskReadData[diskReadData.length - 1] : 0;
  const latestWrite = diskWriteData.length > 0 ? diskWriteData[diskWriteData.length - 1] : 0;

  // 설정된 데이터 포인트 수만큼만 표시
  const dataPoints = config.dataPoints || 50;
  const displayReadData = diskReadData.slice(-dataPoints);
  const displayWriteData = diskWriteData.slice(-dataPoints);

  const chartData = displayReadData.map((value, index) => ({
    time: index,
    read: value,
    write: displayWriteData[index] || 0,
  }));

  const showReadSpeed = config.showReadSpeed !== false;
  const showWriteSpeed = config.showWriteSpeed !== false;
  const showTotalSpace = config.showTotalSpace || false;
  const showFreeSpace = config.showFreeSpace || false;

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  // 단위 변환 함수
  const formatSpeed = (bytes: number) => {
    const unit = config.unit || 'MB/s';
    if (unit === 'KB/s') return `${(bytes / 1024).toFixed(1)} KB/s`;
    if (unit === 'GB/s') return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  return (
    <>
      <div className="widget widget-disk" role="region" aria-label="Disk I/O Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="Disk widget settings"
              aria-label="Open Disk widget settings"
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
                <path d="M22 12H2M22 12a10 10 0 11-20 0 10 10 0 0120 0z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <span id="disk-widget-title">Disk I/O</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove Disk widget"
              aria-label="Remove Disk widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="widget-content">
          <div className="widget-info" role="status" aria-live="polite" aria-atomic="true">
            {showReadSpeed && (
              <div className="widget-info-item">
                <span className="widget-info-label">Read:</span>
                <span className="widget-info-value" aria-label={`Disk read speed is ${formatSpeed(latestRead)}`}>
                  {formatSpeed(latestRead)}
                </span>
              </div>
            )}
            {showWriteSpeed && (
              <div className="widget-info-item">
                <span className="widget-info-label">Write:</span>
                <span className="widget-info-value" aria-label={`Disk write speed is ${formatSpeed(latestWrite)}`}>
                  {formatSpeed(latestWrite)}
                </span>
              </div>
            )}
            {showTotalSpace && (
              <div className="widget-info-item">
                <span className="widget-info-label">Total:</span>
                <span className="widget-info-value">500 GB</span>
              </div>
            )}
            {showFreeSpace && (
              <div className="widget-info-item">
                <span className="widget-info-label">Free:</span>
                <span className="widget-info-value">250 GB</span>
              </div>
            )}
          </div>
          
          <div className="widget-chart" role="img" aria-label="Disk I/O trend chart">
            <ResponsiveContainer width="100%" height="100%">
              {config.chartType === 'line' ? (
                <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="time" hide />
                  <YAxis tickFormatter={(val) => formatBytes(val)} tick={{ fill: 'var(--color-text-secondary)', fontSize: '0.75rem' }} />
                  <Tooltip
                    formatter={(value: number) => [formatBytes(value), 'Speed']}
                    labelFormatter={() => ''}
                    contentStyle={{ 
                      backgroundColor: 'var(--color-surface)', 
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-primary)'
                    }}
                  />
                  <Line type="monotone" dataKey="read" stroke="var(--color-primary)" strokeWidth={2} dot={false} name="Read" />
                  <Line type="monotone" dataKey="write" stroke="var(--color-secondary)" strokeWidth={2} dot={false} name="Write" />
                </LineChart>
              ) : config.chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="time" hide />
                  <YAxis tickFormatter={(val) => formatBytes(val)} tick={{ fill: 'var(--color-text-secondary)', fontSize: '0.75rem' }} />
                  <Tooltip
                    formatter={(value: number) => [formatBytes(value), 'Speed']}
                    labelFormatter={() => ''}
                    contentStyle={{ 
                      backgroundColor: 'var(--color-surface)', 
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-primary)'
                    }}
                  />
                  <Bar dataKey="read" fill="var(--color-primary)" name="Read" />
                  <Bar dataKey="write" fill="var(--color-secondary)" name="Write" />
                </BarChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="diskReadGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={config.color || "var(--color-primary)"} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={config.color || "var(--color-primary)"} stopOpacity={0.1}/>
                    </linearGradient>
                    <linearGradient id="diskWriteGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-secondary)" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="var(--color-secondary)" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis tickFormatter={(val) => formatBytes(val)} tick={{ fill: 'var(--color-text-secondary)', fontSize: '0.75rem' }} />
                  <Tooltip
                    formatter={(value: number) => [formatBytes(value), 'Speed']}
                    labelFormatter={() => ''}
                    contentStyle={{ 
                      backgroundColor: 'var(--color-surface)', 
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-primary)'
                    }}
                  />
                  <Area type="monotone" dataKey="read" stroke={config.color || "var(--color-primary)"} fill="url(#diskReadGradient)" name="Read" />
                  <Area type="monotone" dataKey="write" stroke="var(--color-secondary)" fill="url(#diskWriteGradient)" name="Write" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {widget && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          title="Disk Widget 설정"
        >
          <DiskSettings widget={widget} />
        </SettingsModal>
      )}
    </>
  );
};

export default memo(DiskWidget); 