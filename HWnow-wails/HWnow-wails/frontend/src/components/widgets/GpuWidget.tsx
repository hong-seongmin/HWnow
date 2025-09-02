import { memo, useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, LineChart, BarChart, XAxis, YAxis, Tooltip, Area, Line, Bar } from 'recharts';
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

const GpuWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // 실제 GPU 데이터 사용
  const gpuUsageData = useSystemResourceStore((state) => state.data.gpu_usage);
  const gpuMemoryUsedData = useSystemResourceStore((state) => state.data.gpu_memory_used);
  const gpuMemoryTotalData = useSystemResourceStore((state) => state.data.gpu_memory_total);
  const gpuTemperatureData = useSystemResourceStore((state) => state.data.gpu_temperature);
  const gpuPowerData = useSystemResourceStore((state) => state.data.gpu_power);
  const gpuInfo = useSystemResourceStore((state) => state.data.gpu_info);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const showGpuMemory = config.showGpuMemory !== false;
  const showGpuTemperature = config.showGpuTemperature !== false;
  const showGpuPower = config.showGpuPower !== false;
  const showGraph = config.showGraph !== false;

  // 데이터 안전성 확인 및 디버깅
  const hasGpuData = gpuUsageData.length > 0 || gpuInfo.length > 0;
  const hasRealGpuData = hasGpuData && gpuInfo.some(info => info.info && info.info !== "No GPU Detected");

  // 디버그 로깅과 로딩 상태 관리
  useEffect(() => {
    console.log('[GPU Widget Debug]', {
      gpuUsageData: gpuUsageData.length,
      gpuMemoryUsedData: gpuMemoryUsedData.length,
      gpuMemoryTotalData: gpuMemoryTotalData.length,
      gpuTemperatureData: gpuTemperatureData.length,
      gpuPowerData: gpuPowerData.length,
      gpuInfo: gpuInfo.length,
      hasGpuData,
      hasRealGpuData,
      latestGpuInfo: gpuInfo.length > 0 ? gpuInfo[gpuInfo.length - 1] : null
    });

    // 5초 후 로딩 상태 해제 (데이터가 없어도)
    const loadingTimer = setTimeout(() => {
      if (isLoading) {
        console.log('[GPU Widget] Loading timeout - showing No Data state');
        setIsLoading(false);
      }
    }, 5000);

    // 데이터가 있으면 즉시 로딩 해제
    if (hasGpuData && isLoading) {
      console.log('[GPU Widget] Data received - stopping loading');
      setIsLoading(false);
    }

    return () => clearTimeout(loadingTimer);
  }, [gpuUsageData, gpuMemoryUsedData, gpuMemoryTotalData, gpuTemperatureData, gpuPowerData, gpuInfo, hasGpuData, isLoading]);
  
  // 최신 GPU 데이터 계산 (안전한 기본값 포함)
  const latestUsage = gpuUsageData.length > 0 ? gpuUsageData[gpuUsageData.length - 1] : 0;
  const latestMemoryUsed = gpuMemoryUsedData.length > 0 ? gpuMemoryUsedData[gpuMemoryUsedData.length - 1] : 0;
  const latestMemoryTotal = gpuMemoryTotalData.length > 0 ? gpuMemoryTotalData[gpuMemoryTotalData.length - 1] : 1;
  const latestTemperature = gpuTemperatureData.length > 0 ? gpuTemperatureData[gpuTemperatureData.length - 1] : 0;
  const latestPower = gpuPowerData.length > 0 ? gpuPowerData[gpuPowerData.length - 1] : 0;
  const gpuName = gpuInfo.length > 0 && gpuInfo[gpuInfo.length - 1]?.info ? gpuInfo[gpuInfo.length - 1].info : 'No GPU Detected';

  // 메모리 사용률 계산 (퍼센트)
  const memoryUsagePercent = latestMemoryTotal > 0 ? (latestMemoryUsed / latestMemoryTotal) * 100 : 0;

  // 설정된 데이터 포인트 수만큼만 표시 (최소 차트 데이터 생성)
  const dataPoints = config.dataPoints || 50;
  const usageChartData = gpuUsageData.length > 0 ? gpuUsageData.slice(-dataPoints) : [0];
  const memoryChartData = gpuMemoryUsedData.length > 0 ? 
    gpuMemoryUsedData.slice(-dataPoints).map((used, index) => {
      const total = gpuMemoryTotalData[Math.min(index, gpuMemoryTotalData.length - 1)] || 1;
      return (used / total) * 100;
    }) : [0];
  const temperatureChartData = gpuTemperatureData.length > 0 ? gpuTemperatureData.slice(-dataPoints) : [0];

  const chartData = usageChartData.map((usage, index) => ({
    time: index,
    usage: usage,
    memory: memoryChartData[index] || 0,
    temperature: temperatureChartData[index] || 0,
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
            {!isExpanded && onExpand && (
              <button
                className="widget-action-button expand-button"
                onClick={onExpand}
                title="Expand GPU widget"
                aria-label="Expand GPU widget"
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
          {isLoading ? (
            <div className="widget-loading" role="status" aria-live="polite">
              <div className="widget-loading-spinner">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
              </div>
              <div className="widget-loading-text">
                <div className="widget-loading-title">Loading GPU Data...</div>
                <div className="widget-loading-subtitle">Detecting GPU hardware</div>
              </div>
            </div>
          ) : !hasRealGpuData ? (
            <div className="widget-no-data" role="status" aria-live="polite">
              <div className="widget-no-data-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
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
              <div className="widget-no-data-text">
                <div className="widget-no-data-title">No GPU Data</div>
                <div className="widget-no-data-subtitle">GPU not detected or data unavailable</div>
              </div>
            </div>
          ) : (
            <>
              <div 
                className="widget-value" 
                role="status" 
                aria-live="polite" 
                aria-atomic="true"
                aria-label={`GPU usage is ${latestUsage.toFixed(1)} percent`}
              >
                <span className="widget-value-number" style={{ color: getGpuColor(latestUsage, 'usage') }}>
                  {latestUsage.toFixed(1)}
                </span>
                <span className="widget-value-unit" aria-label="percent">%</span>
              </div>
          
              <div className="widget-info" role="complementary" aria-label="GPU information">
                <div className="widget-info-item">
                  <span className="widget-info-label">Model:</span>
                  <span className="widget-info-value">
                    {gpuName}
                  </span>
                </div>
                {showGpuMemory && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Memory:</span>
                    <span className="widget-info-value" style={{ color: getGpuColor(memoryUsagePercent, 'memory') }}>
                      {memoryUsagePercent.toFixed(1)}%
                    </span>
                  </div>
                )}
                {showGpuTemperature && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Temperature:</span>
                    <span className="widget-info-value" style={{ color: getGpuColor(latestTemperature, 'temperature') }}>
                      {latestTemperature.toFixed(1)}°C
                    </span>
                  </div>
                )}
                {showGpuPower && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Power:</span>
                    <span className="widget-info-value">
                      {latestPower.toFixed(0)}W
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
                      stroke={getGpuColor(latestUsage, 'usage')}
                      strokeWidth={2}
                      dot={false}
                      name="usage"
                    />
                    {showGpuMemory && (
                      <Line 
                        type="monotone" 
                        dataKey="memory" 
                        stroke={getGpuColor(memoryUsagePercent, 'memory')}
                        strokeWidth={2}
                        dot={false}
                        name="memory"
                      />
                    )}
                    {showGpuTemperature && (
                      <Line 
                        type="monotone" 
                        dataKey="temperature" 
                        stroke={getGpuColor(latestTemperature, 'temperature')}
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
                      fill={getGpuColor(latestUsage, 'usage')}
                      name="usage"
                    />
                    {showGpuMemory && (
                      <Bar 
                        dataKey="memory" 
                        fill={getGpuColor(memoryUsagePercent, 'memory')}
                        name="memory"
                      />
                    )}
                  </BarChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gpuUsageGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getGpuColor(latestUsage, 'usage')} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={getGpuColor(latestUsage, 'usage')} stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="gpuMemoryGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getGpuColor(memoryUsagePercent, 'memory')} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={getGpuColor(memoryUsagePercent, 'memory')} stopOpacity={0.1}/>
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
                      stroke={getGpuColor(latestUsage, 'usage')}
                      strokeWidth={2}
                      fill="url(#gpuUsageGradient)"
                      name="usage"
                    />
                    {showGpuMemory && (
                      <Area 
                        type="monotone" 
                        dataKey="memory" 
                        stroke={getGpuColor(memoryUsagePercent, 'memory')}
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
            </>
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