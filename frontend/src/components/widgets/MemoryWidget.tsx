import { memo, useState } from 'react';
import { ResponsiveContainer, AreaChart, LineChart, BarChart, XAxis, YAxis, Tooltip, Area, Line, Bar, PieChart, Pie, Cell } from 'recharts';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { MemorySettings } from './settings/MemorySettings';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
}

const MemoryWidget: React.FC<WidgetProps> = ({ widgetId, onRemove }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const ramData = useSystemResourceStore((state) => state.data.ram);
  const widgets = useDashboardStore((state) => state.widgets);
  const widget = widgets.find(w => w.i === widgetId);
  
  const config = widget?.config || {};
  const latestValue = ramData.length > 0 ? ramData[ramData.length - 1] : 0;

  // 설정된 데이터 포인트 수만큼만 표시
  const dataPoints = config.dataPoints || 50;
  const displayData = ramData.slice(-dataPoints);
  
  const chartData = displayData.map((value, index) => ({ 
    time: index, 
    value: value 
  }));

  // 메모리 사용률에 따른 색상 결정
  const getValueColor = (value: number) => {
    const warningThreshold = config.warningThreshold || 75;
    const criticalThreshold = config.criticalThreshold || 90;
    
    if (value > criticalThreshold) return 'var(--color-error)';
    if (value > warningThreshold) return 'var(--color-warning)';
    return config.color || 'var(--color-secondary)';
  };

  const valueColor = getValueColor(latestValue);

  // 총 메모리를 16GB로 가정 (실제로는 백엔드에서 받아와야 함)
  const totalMemoryGB = 16;
  const usedMemoryGB = (totalMemoryGB * latestValue / 100).toFixed(1);
  
  // 단위 설정에 따른 표시
  const showPercentage = config.showPercentage !== false;
  const showUsedMemory = config.showUsedMemory !== false;
  const showTotalMemory = config.showTotalMemory !== false;

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
    // 설정은 이미 실시간으로 저장되므로 추가 작업 불필요
  };

  return (
    <>
      <div className="widget widget-memory" role="region" aria-label="Memory Usage Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="Memory widget settings"
              aria-label="Open Memory widget settings"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleSettingsClick}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6m3.22-10.22l4.24-4.24m-4.24 10.46l4.24 4.24M21 12h-6m-6 0H3m10.22 3.22l-4.24 4.24m4.24-10.46L8.98 4.76" />
              </svg>
            </button>
          </div>
          <div className="widget-title">
            <div className="widget-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="8" width="18" height="8" rx="1" />
                <rect x="7" y="12" width="2" height="2" />
                <rect x="11" y="12" width="2" height="2" />
                <rect x="15" y="12" width="2" height="2" />
                <path d="M7 8V6a1 1 0 011-1h2m4 0h2a1 1 0 011 1v2M7 16v2a1 1 0 001 1h2m4 0h2a1 1 0 001-1v-2" />
              </svg>
            </div>
            <span>Memory Usage</span>
          </div>
          <div className="widget-actions">
             <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove Memory widget"
              aria-label="Remove Memory widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="widget-content">
          {showPercentage && (
            <div className="widget-value">
              <span className="widget-value-number" style={{ color: valueColor }}>
                {latestValue.toFixed(1)}
              </span>
              <span className="widget-value-unit">%</span>
            </div>
          )}
        
          {(showUsedMemory || showTotalMemory) && (
            <div className="widget-info">
              {showUsedMemory && (
                <div className="widget-info-item">
                  <span className="widget-info-label">Used:</span>
                  <span className="widget-info-value">{usedMemoryGB} {config.unit || 'GB'}</span>
                </div>
              )}
              {showTotalMemory && (
                <div className="widget-info-item">
                  <span className="widget-info-label">Total:</span>
                  <span className="widget-info-value">{totalMemoryGB} {config.unit || 'GB'}</span>
                </div>
              )}
            </div>
          )}
        
          <div className="widget-chart">
            <ResponsiveContainer width="100%" height="100%">
              {config.chartType === 'line' ? (
                <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Memory']}
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
                    stroke={valueColor}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              ) : config.chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Memory']}
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
                    fill={valueColor}
                  />
                </BarChart>
              ) : config.chartType === 'gauge' ? (
                <PieChart>
                  <Pie
                    data={[{ value: latestValue }, { value: 100 - latestValue }]}
                    cx="50%"
                    cy="50%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius="60%"
                    outerRadius="80%"
                    dataKey="value"
                  >
                    <Cell fill={valueColor} />
                    <Cell fill="var(--color-border)" />
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, 'Memory']} />
                </PieChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={valueColor} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={valueColor} stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Memory']}
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
                    stroke={valueColor}
                    strokeWidth={2}
                    fill="url(#memoryGradient)"
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
          title="Memory Widget 설정"
        >
          <MemorySettings widget={widget} />
        </SettingsModal>
      )}
    </>
  );
};

export default memo(MemoryWidget); 