import { memo, useState } from 'react';
import { ResponsiveContainer, AreaChart, LineChart, BarChart, XAxis, YAxis, Tooltip, Area, Line, Bar, PieChart, Pie, Cell } from 'recharts';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { CpuSettings } from './settings/CpuSettings';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const CpuWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const cpuData = useSystemResourceStore((state) => state.data.cpu);
  const cpuCores = useSystemResourceStore((state) => state.data.cpu_cores);
  const cpuInfo = useSystemResourceStore((state) => state.data.cpu_info);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find(w => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const latestValue = cpuData.length > 0 ? cpuData[cpuData.length - 1] : 0;

  // 설정된 데이터 포인트 수만큼만 표시
  const dataPoints = config.dataPoints || 50;
  const displayData = cpuData.slice(-dataPoints);
  
  const chartData = displayData.map((value, index) => ({ 
    time: index, 
    value: value 
  }));

  // CPU 사용률에 따른 색상 결정
  const getValueColor = (value: number) => {
    const warningThreshold = config.warningThreshold || 60;
    const criticalThreshold = config.criticalThreshold || 80;
    
    if (value > criticalThreshold) return 'var(--color-error)';
    if (value > warningThreshold) return 'var(--color-warning)';
    return config.color || 'var(--color-primary)';
  };

  const valueColor = getValueColor(latestValue);
  
  // CPU 사용률에 따른 상태 설명
  const getUsageDescription = (value: number) => {
    const warningThreshold = config.warningThreshold || 60;
    const criticalThreshold = config.criticalThreshold || 80;
    
    if (value > criticalThreshold) return 'Critical - High CPU usage';
    if (value > warningThreshold) return 'Warning - Moderate CPU usage';
    return 'Normal - Low CPU usage';
  };

  const showPercentage = config.showPercentage !== false;
  const showGraph = config.showGraph !== false;
  const showCoreUsage = config.showCoreUsage === true;
  const chartOnlyMode = config.chartOnlyMode === true;

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  return (
    <>
      <div className="widget widget-cpu" role="region" aria-label="CPU Usage Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="CPU widget settings"
              aria-label="Open CPU widget settings"
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
                title="Expand CPU widget"
                aria-label="Expand CPU widget"
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
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="15" x2="23" y2="15" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="15" x2="4" y2="15" />
              </svg>
            </div>
            <span id="cpu-widget-title">CPU Usage</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove CPU widget"
              aria-label="Remove CPU widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className={`widget-content ${chartOnlyMode ? 'chart-only-mode' : ''}`}>
          {!chartOnlyMode && showPercentage && (
            <div 
              className="widget-value" 
              role="status" 
              aria-live="polite" 
              aria-atomic="true"
              aria-label={`CPU usage is ${latestValue.toFixed(1)} percent. ${getUsageDescription(latestValue)}`}
            >
              <span className="widget-value-number" style={{ color: valueColor }}>
                {latestValue.toFixed(1)}
              </span>
              <span className="widget-value-unit" aria-label="percent">%</span>
            </div>
          )}
          
          {!chartOnlyMode && (
            <div className="widget-info" role="complementary" aria-label="CPU information">
              <div className="widget-info-item cpu-model">
                <span className="widget-info-label">Model:</span>
                <span className="widget-info-value" title={cpuInfo?.model || 'Loading...'}>
                  {cpuInfo?.model ? cpuInfo.model.replace(/CPU @ \d+\.\d+GHz/, '').trim() : 'Loading...'}
                </span>
              </div>
              <div className="widget-info-item">
                <span className="widget-info-label">Cores:</span>
                <span className="widget-info-value" aria-label={`${cpuInfo?.cores || 'Loading'} cores`}>
                  {cpuInfo?.cores || 'Loading'}
                </span>
              </div>
              <div className="widget-info-item">
                <span className="widget-info-label">Threads:</span>
                <span className="widget-info-value" aria-label={`${Object.keys(cpuCores).length || 'Loading'} threads`}>
                  {Object.keys(cpuCores).length || 'Loading'}
                </span>
              </div>
            </div>
          )}
          
          {!chartOnlyMode && showCoreUsage && (
            <div className="widget-core-usage" role="region" aria-label="CPU core usage">
              <h4 className="widget-core-title">코어별 사용률</h4>
              <div className="core-usage-grid">
                {Object.entries(cpuCores)
                  .sort(([a], [b]) => {
                    const numA = parseInt(a.replace('cpu_core_', ''));
                    const numB = parseInt(b.replace('cpu_core_', ''));
                    return numA - numB;
                  })
                  .map(([coreId, coreData]) => {
                    const coreIndex = parseInt(coreId.replace('cpu_core_', ''));
                    const latestCoreValue = coreData.length > 0 ? coreData[coreData.length - 1] : 0;
                    const coreColor = getValueColor(latestCoreValue);
                    
                    return (
                      <div key={coreId} className="core-usage-item">
                        <div className="core-label">Core {coreIndex}</div>
                        <div className="core-bar">
                          <div 
                            className="core-bar-fill" 
                            style={{ 
                              width: `${latestCoreValue}%`, 
                              backgroundColor: coreColor 
                            }}
                          />
                        </div>
                        <div className="core-value" style={{ color: coreColor }}>
                          {latestCoreValue.toFixed(1)}%
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          
          {showGraph && (
            <div className="widget-chart chart-container" role="img" aria-label="CPU usage trend chart">
              <ResponsiveContainer width="100%" height="100%">
                {config.chartType === 'line' ? (
                  <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'CPU']}
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
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'CPU']}
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
                    <Tooltip formatter={(value: number) => [`${value.toFixed(1)}%`, 'CPU']} />
                  </PieChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={valueColor} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={valueColor} stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'CPU']}
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
                      fill="url(#cpuGradient)"
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
          title="CPU Widget 설정"
        >
          <CpuSettings widget={widget} />
        </SettingsModal>
      )}
    </>
  );
};

export default memo(CpuWidget); 