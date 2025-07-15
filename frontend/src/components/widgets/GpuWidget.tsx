import { memo, useState } from 'react';
import { ResponsiveContainer, AreaChart, LineChart, BarChart, XAxis, YAxis, Tooltip, Area, Line, Bar } from 'recharts';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
}

// 모의 GPU 데이터 (실제로는 백엔드에서 받아와야 함)
interface GpuData {
  usage: number;
  memory: number;
  temperature: number;
  power: number;
  clock: number;
}

const GpuWidget: React.FC<WidgetProps> = ({ widgetId, onRemove }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [gpuData, setGpuData] = useState<GpuData[]>([]);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const showGpuMemory = config.showGpuMemory !== false;
  const showGpuTemperature = config.showGpuTemperature !== false;
  const showGpuPower = config.showGpuPower !== false;
  const showGraph = config.showGraph !== false;

  // 모의 GPU 데이터 생성 (실제로는 백엔드에서 받아와야 함)
  const generateMockGpuData = () => {
    const mockData: GpuData[] = [];
    for (let i = 0; i < 50; i++) {
      mockData.push({
        usage: Math.random() * 100,
        memory: Math.random() * 100,
        temperature: 45 + Math.random() * 35, // 45-80°C
        power: 100 + Math.random() * 200, // 100-300W
        clock: 1400 + Math.random() * 600, // 1400-2000 MHz
      });
    }
    return mockData;
  };

  // 초기 데이터 설정
  if (gpuData.length === 0) {
    setGpuData(generateMockGpuData());
  }

  const latestData = gpuData.length > 0 ? gpuData[gpuData.length - 1] : {
    usage: 0,
    memory: 0,
    temperature: 0,
    power: 0,
    clock: 0,
  };

  // 설정된 데이터 포인트 수만큼만 표시
  const dataPoints = config.dataPoints || 50;
  const displayData = gpuData.slice(-dataPoints);

  const chartData = displayData.map((data, index) => ({
    time: index,
    usage: data.usage,
    memory: data.memory,
    temperature: data.temperature,
  }));

  // GPU 사용률에 따른 색상 결정
  const getGpuColor = (value: number, type: 'usage' | 'memory' | 'temperature') => {
    const warningThreshold = config.warningThreshold || 75;
    const criticalThreshold = config.criticalThreshold || 90;
    
    if (value > criticalThreshold) return 'var(--color-error)';
    if (value > warningThreshold) return 'var(--color-warning)';
    
    switch(type) {
      case 'usage': return config.color || 'var(--color-primary)';
      case 'memory': return 'var(--color-secondary)';
      case 'temperature': return 'var(--color-info)';
      default: return 'var(--color-primary)';
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
      <div className="widget widget-gpu" role="region" aria-label="GPU Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="GPU widget settings"
              aria-label="Open GPU widget settings"
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
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            </div>
            <span id="gpu-widget-title">GPU Usage</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove GPU widget"
              aria-label="Remove GPU widget"
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
            aria-label={`GPU usage is ${latestData.usage.toFixed(1)} percent`}
          >
            <span className="widget-value-number" style={{ color: getGpuColor(latestData.usage, 'usage') }}>
              {latestData.usage.toFixed(1)}
            </span>
            <span className="widget-value-unit" aria-label="percent">%</span>
          </div>
          
          <div className="widget-info" role="complementary" aria-label="GPU information">
            <div className="widget-info-item">
              <span className="widget-info-label">Model:</span>
              <span className="widget-info-value">
                NVIDIA RTX 4080
              </span>
            </div>
            <div className="widget-info-item">
              <span className="widget-info-label">Clock:</span>
              <span className="widget-info-value">
                {latestData.clock.toFixed(0)} MHz
              </span>
            </div>
            {showGpuMemory && (
              <div className="widget-info-item">
                <span className="widget-info-label">Memory:</span>
                <span className="widget-info-value" style={{ color: getGpuColor(latestData.memory, 'memory') }}>
                  {latestData.memory.toFixed(1)}%
                </span>
              </div>
            )}
            {showGpuTemperature && (
              <div className="widget-info-item">
                <span className="widget-info-label">Temperature:</span>
                <span className="widget-info-value" style={{ color: getGpuColor(latestData.temperature, 'temperature') }}>
                  {latestData.temperature.toFixed(1)}°C
                </span>
              </div>
            )}
            {showGpuPower && (
              <div className="widget-info-item">
                <span className="widget-info-label">Power:</span>
                <span className="widget-info-value">
                  {latestData.power.toFixed(0)}W
                </span>
              </div>
            )}
          </div>
          
          {showGraph && (
            <div className="widget-chart" role="img" aria-label="GPU usage trend chart">
              <ResponsiveContainer width="100%" height="100%">
                {config.chartType === 'line' ? (
                  <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'usage' ? `${value.toFixed(1)}%` : 
                        name === 'memory' ? `${value.toFixed(1)}%` : 
                        `${value.toFixed(1)}°C`,
                        name === 'usage' ? 'GPU Usage' : 
                        name === 'memory' ? 'GPU Memory' : 
                        'Temperature'
                      ]}
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
                      dataKey="usage" 
                      stroke={getGpuColor(latestData.usage, 'usage')}
                      strokeWidth={2}
                      dot={false}
                      name="usage"
                    />
                    {showGpuMemory && (
                      <Line 
                        type="monotone" 
                        dataKey="memory" 
                        stroke={getGpuColor(latestData.memory, 'memory')}
                        strokeWidth={2}
                        dot={false}
                        name="memory"
                      />
                    )}
                    {showGpuTemperature && (
                      <Line 
                        type="monotone" 
                        dataKey="temperature" 
                        stroke={getGpuColor(latestData.temperature, 'temperature')}
                        strokeWidth={2}
                        dot={false}
                        name="temperature"
                      />
                    )}
                  </LineChart>
                ) : config.chartType === 'bar' ? (
                  <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'usage' ? `${value.toFixed(1)}%` : 
                        name === 'memory' ? `${value.toFixed(1)}%` : 
                        `${value.toFixed(1)}°C`,
                        name === 'usage' ? 'GPU Usage' : 
                        name === 'memory' ? 'GPU Memory' : 
                        'Temperature'
                      ]}
                      labelFormatter={() => ''}
                      contentStyle={{ 
                        backgroundColor: 'var(--color-surface)', 
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-primary)'
                      }}
                    />
                    <Bar 
                      dataKey="usage" 
                      fill={getGpuColor(latestData.usage, 'usage')}
                      name="usage"
                    />
                    {showGpuMemory && (
                      <Bar 
                        dataKey="memory" 
                        fill={getGpuColor(latestData.memory, 'memory')}
                        name="memory"
                      />
                    )}
                  </BarChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gpuUsageGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getGpuColor(latestData.usage, 'usage')} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={getGpuColor(latestData.usage, 'usage')} stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="gpuMemoryGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getGpuColor(latestData.memory, 'memory')} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={getGpuColor(latestData.memory, 'memory')} stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        name === 'usage' ? `${value.toFixed(1)}%` : 
                        name === 'memory' ? `${value.toFixed(1)}%` : 
                        `${value.toFixed(1)}°C`,
                        name === 'usage' ? 'GPU Usage' : 
                        name === 'memory' ? 'GPU Memory' : 
                        'Temperature'
                      ]}
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
                      dataKey="usage" 
                      stroke={getGpuColor(latestData.usage, 'usage')}
                      strokeWidth={2}
                      fill="url(#gpuUsageGradient)"
                      name="usage"
                    />
                    {showGpuMemory && (
                      <Area 
                        type="monotone" 
                        dataKey="memory" 
                        stroke={getGpuColor(latestData.memory, 'memory')}
                        strokeWidth={2}
                        fill="url(#gpuMemoryGradient)"
                        name="memory"
                      />
                    )}
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
          title="GPU Widget 설정"
        >
          <div className="settings-section">
            <label>
              <input 
                type="checkbox" 
                checked={showGpuMemory}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showGpuMemory: e.target.checked });
                }}
              />
              Show GPU memory usage
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showGpuTemperature}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showGpuTemperature: e.target.checked });
                }}
              />
              Show GPU temperature
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showGpuPower}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showGpuPower: e.target.checked });
                }}
              />
              Show GPU power consumption
            </label>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

export default memo(GpuWidget);