import { memo, useState } from 'react';
import { ResponsiveContainer, AreaChart, LineChart, BarChart, XAxis, YAxis, Tooltip, Area, Line, Bar } from 'recharts';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { CpuTempSettings } from './settings/CpuTempSettings';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
}

const CpuTempWidget: React.FC<WidgetProps> = ({ widgetId, onRemove }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const cpuTempData = useSystemResourceStore((state) => state.data.cpu_temp);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find(w => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const latestTemp = cpuTempData.length > 0 ? cpuTempData[cpuTempData.length - 1] : 0;

  // 설정된 데이터 포인트 수만큼만 표시
  const dataPoints = config.dataPoints || 50;
  const displayData = cpuTempData.slice(-dataPoints);
  
  const chartData = displayData.map((value, index) => ({ 
    time: index, 
    value: value 
  }));

  // CPU 온도에 따른 색상 결정
  const getTempColor = (temp: number) => {
    const warningThreshold = config.warningThreshold || 70;
    const criticalThreshold = config.criticalThreshold || 85;
    
    if (temp > criticalThreshold) return 'var(--color-error)';
    if (temp > warningThreshold) return 'var(--color-warning)';
    return config.color || '#4CAF50';
  };

  const tempColor = getTempColor(latestTemp);
  
  // CPU 온도에 따른 상태 설명
  const getTempDescription = (temp: number) => {
    const warningThreshold = config.warningThreshold || 70;
    const criticalThreshold = config.criticalThreshold || 85;
    
    if (temp > criticalThreshold) return 'Critical - High temperature';
    if (temp > warningThreshold) return 'Warning - Elevated temperature';
    return 'Normal - Safe temperature';
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
      <div className="widget widget-cpu-temp" role="region" aria-label="CPU Temperature Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="CPU temperature widget settings"
              aria-label="Open CPU temperature widget settings"
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
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
              </svg>
            </div>
            <span id="cpu-temp-widget-title">CPU Temperature</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove CPU temperature widget"
              aria-label="Remove CPU temperature widget"
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
            aria-label={`CPU temperature is ${latestTemp.toFixed(1)} degrees Celsius. ${getTempDescription(latestTemp)}`}
          >
            <span className="widget-value-number" style={{ color: tempColor }}>
              {latestTemp.toFixed(1)}
            </span>
            <span className="widget-value-unit" aria-label="degrees Celsius">°C</span>
          </div>
          
          <div className="widget-info" role="complementary" aria-label="Temperature information">
            <div className="widget-info-item">
              <span className="widget-info-label">Status:</span>
              <span className="widget-info-value" style={{ color: tempColor }}>
                {getTempDescription(latestTemp).split(' - ')[0]}
              </span>
            </div>
          </div>
          
          <div className="widget-chart" role="img" aria-label="CPU temperature trend chart">
            <ResponsiveContainer width="100%" height="100%">
              {config.chartType === 'line' ? (
                <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}°C`, 'Temperature']}
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
                    dataKey="value" 
                    stroke={tempColor}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              ) : config.chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}°C`, 'Temperature']}
                    labelFormatter={() => ''}
                    contentStyle={{ 
                      backgroundColor: 'var(--color-surface)', 
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-primary)'
                    }}
                  />
                  <Bar 
                    dataKey="value" 
                    fill={tempColor}
                  />
                </BarChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={tempColor} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={tempColor} stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}°C`, 'Temperature']}
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
                    dataKey="value" 
                    stroke={tempColor}
                    strokeWidth={2}
                    fill="url(#tempGradient)"
                  />
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
          title="CPU Temperature Widget 설정"
        >
          <CpuTempSettings widget={widget} />
        </SettingsModal>
      )}
    </>
  );
};

export default memo(CpuTempWidget); 