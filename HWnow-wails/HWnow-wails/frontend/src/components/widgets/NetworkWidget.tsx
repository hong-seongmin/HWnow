import { memo, useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, LineChart, BarChart, XAxis, YAxis, Tooltip, Area, Line, Bar } from 'recharts';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { NetworkSettings } from './settings/NetworkSettings';
import { formatSpeed } from '../../utils/formatters';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const NetworkWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const netSentData = useSystemResourceStore((state) => state.data.net_sent);
  const netRecvData = useSystemResourceStore((state) => state.data.net_recv);

  // 데이터 로딩 상태 관리
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000); // 3초 후 로딩 상태 해제

    return () => clearTimeout(timer);
  }, []);

  // 데이터 수신 시 로딩 상태 해제
  useEffect(() => {
    if (netSentData.length > 0 || netRecvData.length > 0) {
      setIsLoading(false);
    }
  }, [netSentData, netRecvData]);
  
  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });

  const config = widget?.config || {};
  const latestSent = netSentData.length > 0 ? netSentData[netSentData.length - 1] : 0;
  const latestRecv = netRecvData.length > 0 ? netRecvData[netRecvData.length - 1] : 0;

  // 데이터 가용성 확인
  const hasNetworkData = netSentData.length > 0 || netRecvData.length > 0;

  // 설정된 데이터 포인트 수만큼만 표시
  const dataPoints = config.dataPoints || 50;
  const displaySentData = netSentData.slice(-dataPoints);
  const displayRecvData = netRecvData.slice(-dataPoints);

  const chartData = displaySentData.map((value, index) => ({
    time: index,
    sent: value,
    received: displayRecvData[index] || 0,
  }));

  const showSentSpeed = config.showSentSpeed !== false;
  const showRecvSpeed = config.showRecvSpeed !== false;
  const showTotalSent = config.showTotalSent || false;
  const showTotalRecv = config.showTotalRecv || false;
  const showGraph = config.showGraph !== false; // 기본값 true

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  // 단위 변환 함수
  const formatSpeed = (bytes: number) => {
    const unit = config.unit || 'Mbps';
    if (unit === 'Kbps') return `${(bytes * 8 / 1024).toFixed(1)} Kbps`;
    if (unit === 'Gbps') return `${(bytes * 8 / (1024 * 1024 * 1024)).toFixed(2)} Gbps`;
    if (unit === 'KB/s') return `${(bytes / 1024).toFixed(1)} KB/s`;
    if (unit === 'MB/s') return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytes * 8 / (1024 * 1024)).toFixed(1)} Mbps`;
  };

  return (
    <>
      <div className="widget widget-network" role="region" aria-label="Network I/O Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="Network widget settings"
              aria-label="Open Network widget settings"
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
                title="Expand Network widget"
                aria-label="Expand Network widget"
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
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <span id="network-widget-title">Network I/O</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove Network widget"
              aria-label="Remove Network widget"
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
              <div className="widget-loading-text">Loading network I/O data...</div>
            </div>
          ) : !hasNetworkData ? (
            <div className="widget-no-data">
              <div className="widget-no-data-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div className="widget-no-data-message">No network I/O data available</div>
              <div className="widget-no-data-subtitle">Network monitoring may not be supported or enabled</div>
            </div>
          ) : (
            <>
              <div className="widget-info" role="status" aria-live="polite" aria-atomic="true">
                {showSentSpeed && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Sent:</span>
                    <span className="widget-info-value" aria-label={`Data sent speed is ${formatSpeed(latestSent)}`}>
                      {formatSpeed(latestSent)}
                    </span>
                  </div>
                )}
                {showRecvSpeed && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Received:</span>
                    <span className="widget-info-value" aria-label={`Data received speed is ${formatSpeed(latestRecv)}`}>
                      {formatSpeed(latestRecv)}
                    </span>
                  </div>
                )}
                {showTotalSent && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Total Sent:</span>
                    <span className="widget-info-value">{formatSpeed(latestSent * 3600)}</span>
                  </div>
                )}
                {showTotalRecv && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Total Recv:</span>
                    <span className="widget-info-value">{formatSpeed(latestRecv * 3600)}</span>
                  </div>
                )}
              </div>
              
              {showGraph && (
                <div className="widget-chart" role="img" aria-label="Network I/O trend chart">
                  <ResponsiveContainer width="100%" height="100%">
                  {config.chartType === 'line' ? (
                    <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="time" hide />
                      <YAxis tickFormatter={(val) => formatSpeed(val)} tick={{ fill: 'var(--color-text-secondary)', fontSize: '0.75rem' }} />
                      <Tooltip
                        formatter={(value: number) => [formatSpeed(value), 'Speed']}
                        labelFormatter={() => ''}
                        contentStyle={{ 
                          backgroundColor: 'var(--color-surface)', 
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-text-primary)'
                        }}
                      />
                      <Line type="monotone" dataKey="sent" stroke={config.color || "var(--color-info)"} strokeWidth={2} dot={false} name="Sent" />
                      <Line type="monotone" dataKey="received" stroke="var(--color-success)" strokeWidth={2} dot={false} name="Received" />
                    </LineChart>
                  ) : config.chartType === 'bar' ? (
                    <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="time" hide />
                      <YAxis tickFormatter={(val) => formatSpeed(val)} tick={{ fill: 'var(--color-text-secondary)', fontSize: '0.75rem' }} />
                      <Tooltip
                        formatter={(value: number) => [formatSpeed(value), 'Speed']}
                        labelFormatter={() => ''}
                        contentStyle={{ 
                          backgroundColor: 'var(--color-surface)', 
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-text-primary)'
                        }}
                      />
                      <Bar dataKey="sent" fill={config.color || "var(--color-info)"} name="Sent" />
                      <Bar dataKey="received" fill="var(--color-success)" name="Received" />
                    </BarChart>
                  ) : (
                    <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`netSentGradient-${widgetId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={config.color || "var(--color-info)"} stopOpacity={0.8}/>
                          <stop offset="95%" stopColor={config.color || "var(--color-info)"} stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id={`netRecvGradient-${widgetId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" hide />
                      <YAxis tickFormatter={(val) => formatSpeed(val)} tick={{ fill: 'var(--color-text-secondary)', fontSize: '0.75rem' }} />
                      <Tooltip
                        formatter={(value: number) => [formatSpeed(value), 'Speed']}
                        labelFormatter={() => ''}
                        contentStyle={{ 
                          backgroundColor: 'var(--color-surface)', 
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--color-text-primary)'
                        }}
                      />
                      <Area type="monotone" dataKey="sent" stroke={config.color || "var(--color-info)"} fill={`url(#netSentGradient-${widgetId})`} name="Sent" />
                      <Area type="monotone" dataKey="received" stroke="var(--color-success)" fill={`url(#netRecvGradient-${widgetId})`} name="Received" />
                    </AreaChart>
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
          title="Network Widget 설정"
        >
          <NetworkSettings widget={widget} />
        </SettingsModal>
      )}
    </>
  );
};

export default memo(NetworkWidget); 