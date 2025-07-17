import { memo, useState } from 'react';
import { ResponsiveContainer, LineChart, AreaChart, XAxis, YAxis, Tooltip, Line, Area } from 'recharts';
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

const BatteryWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const batteryPercentData = useSystemResourceStore((state) => state.data.battery_percent);
  const batteryPluggedData = useSystemResourceStore((state) => state.data.battery_plugged);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const latestPercent = batteryPercentData.length > 0 ? batteryPercentData[batteryPercentData.length - 1] : 0;
  const latestPlugged = batteryPluggedData.length > 0 ? batteryPluggedData[batteryPluggedData.length - 1] : 0;

  const showChargingStatus = config.showChargingStatus !== false;
  const showBatteryTime = config.showBatteryTime !== false;
  const showGraph = config.showGraph !== false;

  // 설정된 데이터 포인트 수만큼만 표시
  const dataPoints = config.dataPoints || 50;
  const displayPercentData = batteryPercentData.slice(-dataPoints);

  const chartData = displayPercentData.map((value, index) => ({
    time: index,
    battery: value,
  }));

  // 배터리 잔량에 따른 색상 결정
  const getBatteryColor = (percentage: number) => {
    const warningThreshold = config.warningThreshold || 20;
    const criticalThreshold = config.criticalThreshold || 10;
    
    if (percentage <= criticalThreshold) return 'var(--color-error)';
    if (percentage <= warningThreshold) return 'var(--color-warning)';
    return config.color || 'var(--color-success)';
  };

  const batteryColor = getBatteryColor(latestPercent);

  // 충전 상태 텍스트
  const getChargingStatusText = () => {
    if (latestPlugged === 1) {
      return latestPercent >= 100 ? 'Charged' : 'Charging';
    } else {
      return 'Discharging';
    }
  };

  // 배터리 아이콘 (퍼센트에 따라 다른 아이콘)
  const getBatteryIcon = () => {
    if (latestPercent > 75) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
          <line x1="23" y1="13" x2="23" y2="11" />
          <rect x="3" y="8" width="14" height="8" rx="1" />
        </svg>
      );
    } else if (latestPercent > 50) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
          <line x1="23" y1="13" x2="23" y2="11" />
          <rect x="3" y="8" width="10" height="8" rx="1" />
        </svg>
      );
    } else if (latestPercent > 25) {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
          <line x1="23" y1="13" x2="23" y2="11" />
          <rect x="3" y="8" width="6" height="8" rx="1" />
        </svg>
      );
    } else {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
          <line x1="23" y1="13" x2="23" y2="11" />
          <rect x="3" y="8" width="2" height="8" rx="1" />
        </svg>
      );
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
      <div className="widget widget-battery" role="region" aria-label="Battery Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="Battery widget settings"
              aria-label="Open Battery widget settings"
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
                title="Expand Battery widget"
                aria-label="Expand Battery widget"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              </button>
            )}
          </div>
          <div className="widget-title">
            <div className="widget-icon" aria-hidden="true" style={{ color: batteryColor }}>
              {getBatteryIcon()}
            </div>
            <span id="battery-widget-title">Battery</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove Battery widget"
              aria-label="Remove Battery widget"
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
            aria-label={`Battery level is ${latestPercent.toFixed(1)} percent`}
          >
            <span className="widget-value-number" style={{ color: batteryColor }}>
              {latestPercent.toFixed(1)}
            </span>
            <span className="widget-value-unit" aria-label="percent">%</span>
          </div>
          
          <div className="widget-info" role="complementary" aria-label="Battery information">
            {showChargingStatus && (
              <div className="widget-info-item">
                <span className="widget-info-label">Status:</span>
                <span className="widget-info-value" style={{ color: latestPlugged === 1 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                  {getChargingStatusText()}
                </span>
              </div>
            )}
            {showBatteryTime && (
              <div className="widget-info-item">
                <span className="widget-info-label">Estimated:</span>
                <span className="widget-info-value">
                  {latestPercent > 20 ? '2h 30m' : latestPercent > 10 ? '45m' : '15m'}
                </span>
              </div>
            )}
            <div className="widget-info-item">
              <span className="widget-info-label">Plugged:</span>
              <span className="widget-info-value">
                {latestPlugged === 1 ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
          
          {showGraph && (
            <div className="widget-chart" role="img" aria-label="Battery level trend chart">
              <ResponsiveContainer width="100%" height="100%">
                {config.chartType === 'line' ? (
                  <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Battery']}
                      labelFormatter={() => ''}
                      contentStyle={{ 
                        backgroundColor: 'var(--color-surface)', 
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-primary)'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="battery" 
                      stroke={batteryColor}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="batteryGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={batteryColor} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={batteryColor} stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Battery']}
                      labelFormatter={() => ''}
                      contentStyle={{ 
                        backgroundColor: 'var(--color-surface)', 
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-primary)'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="battery" 
                      stroke={batteryColor}
                      strokeWidth={2}
                      fill="url(#batteryGradient)"
                    />
                  </AreaChart>
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
          title="Battery Widget 설정"
        >
          <div className="settings-section">
            <label>
              <input 
                type="checkbox" 
                checked={showChargingStatus}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showChargingStatus: e.target.checked });
                }}
              />
              Show charging status
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showBatteryTime}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showBatteryTime: e.target.checked });
                }}
              />
              Show estimated time
            </label>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

export default memo(BatteryWidget);