import { memo, useState } from 'react';
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

const MemoryDetailWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const physicalMemoryData = useSystemResourceStore((state) => state.data.memory_physical);
  const virtualMemoryData = useSystemResourceStore((state) => state.data.memory_virtual);
  const swapMemoryData = useSystemResourceStore((state) => state.data.memory_swap);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  
  // 데이터 안전성 확인
  const hasMemoryData = physicalMemoryData.length > 0 || virtualMemoryData.length > 0 || swapMemoryData.length > 0;
  
  const latestPhysical = physicalMemoryData.length > 0 ? physicalMemoryData[physicalMemoryData.length - 1] : 0;
  const latestVirtual = virtualMemoryData.length > 0 ? virtualMemoryData[virtualMemoryData.length - 1] : 0;
  const latestSwap = swapMemoryData.length > 0 ? swapMemoryData[swapMemoryData.length - 1] : 0;

  const showPhysicalMemory = config.showPhysicalMemory !== false;
  const showVirtualMemory = config.showVirtualMemory !== false;
  const showSwapMemory = config.showSwapMemory !== false;
  const showGraph = config.showGraph !== false;

  // 설정된 데이터 포인트 수만큼만 표시 (안전한 기본값 포함)
  const dataPoints = config.dataPoints || 50;
  const displayPhysicalData = physicalMemoryData.length > 0 ? physicalMemoryData.slice(-dataPoints) : [0];
  const displayVirtualData = virtualMemoryData.length > 0 ? virtualMemoryData.slice(-dataPoints) : [0];
  const displaySwapData = swapMemoryData.length > 0 ? swapMemoryData.slice(-dataPoints) : [0];

  const chartData = displayPhysicalData.map((value, index) => ({
    time: index,
    physical: value,
    virtual: displayVirtualData[index] || 0,
    swap: displaySwapData[index] || 0,
  }));

  // 메모리 사용률에 따른 색상 결정
  const getMemoryColor = (value: number, type: 'physical' | 'virtual' | 'swap') => {
    const warningThreshold = config.warningThreshold || 75;
    const criticalThreshold = config.criticalThreshold || 90;
    
    if (value > criticalThreshold) return 'var(--color-error)';
    if (value > warningThreshold) return 'var(--color-warning)';
    
    switch(type) {
      case 'physical': return config.color || 'var(--color-primary)';
      case 'virtual': return 'var(--color-secondary)';
      case 'swap': return 'var(--color-info)';
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
      <div className="widget widget-memory-detail" role="region" aria-label="Memory Detail Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="Memory detail widget settings"
              aria-label="Open Memory detail widget settings"
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
                title="Expand Memory Detail widget"
                aria-label="Expand Memory Detail widget"
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
                <path d="M3 12h18m-9 4.5V7.5m-4.5 4.5L10 9l-2.5 3 2.5 3m5-6l2.5 3L15 15" />
              </svg>
            </div>
            <span id="memory-detail-widget-title">Memory Detail</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove Memory Detail widget"
              aria-label="Remove Memory Detail widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="widget-content">
          {!hasMemoryData ? (
            <div className="widget-no-data" role="status" aria-live="polite">
              <div className="widget-no-data-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
                  <path d="M3 12h18m-9 4.5V7.5m-4.5 4.5L10 9l-2.5 3 2.5 3m5-6l2.5 3L15 15" />
                </svg>
              </div>
              <div className="widget-no-data-text">
                <div className="widget-no-data-title">No Memory Detail Data</div>
                <div className="widget-no-data-subtitle">Detailed memory information unavailable</div>
              </div>
            </div>
          ) : (
            <>
              <div className="widget-info" role="status" aria-live="polite" aria-atomic="true">
                {showPhysicalMemory && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Physical:</span>
                    <span className="widget-info-value" style={{ color: getMemoryColor(latestPhysical, 'physical') }}>
                      {latestPhysical.toFixed(1)}%
                    </span>
                  </div>
                )}
                {showVirtualMemory && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Virtual:</span>
                    <span className="widget-info-value" style={{ color: getMemoryColor(latestVirtual, 'virtual') }}>
                      {latestVirtual.toFixed(1)}%
                    </span>
                  </div>
                )}
                {showSwapMemory && (
                  <div className="widget-info-item">
                    <span className="widget-info-label">Swap:</span>
                    <span className="widget-info-value" style={{ color: getMemoryColor(latestSwap, 'swap') }}>
                      {latestSwap.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
          
              {showGraph && (
                <div className="widget-chart" role="img" aria-label="Memory usage trend chart">
              <ResponsiveContainer width="100%" height="100%">
                {config.chartType === 'line' ? (
                  <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'physical' ? 'Physical' : name === 'virtual' ? 'Virtual' : 'Swap']}
                      labelFormatter={() => ''}
                      contentStyle={{ 
                        backgroundColor: 'var(--color-surface)', 
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-primary)'
                      }}
                    />
                    {showPhysicalMemory && (
                      <Line 
                        type="monotone" 
                        dataKey="physical" 
                        stroke={getMemoryColor(latestPhysical, 'physical')}
                        strokeWidth={2}
                        dot={false}
                        name="Physical"
                      />
                    )}
                    {showVirtualMemory && (
                      <Line 
                        type="monotone" 
                        dataKey="virtual" 
                        stroke={getMemoryColor(latestVirtual, 'virtual')}
                        strokeWidth={2}
                        dot={false}
                        name="Virtual"
                      />
                    )}
                    {showSwapMemory && (
                      <Line 
                        type="monotone" 
                        dataKey="swap" 
                        stroke={getMemoryColor(latestSwap, 'swap')}
                        strokeWidth={2}
                        dot={false}
                        name="Swap"
                      />
                    )}
                  </LineChart>
                ) : config.chartType === 'bar' ? (
                  <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'physical' ? 'Physical' : name === 'virtual' ? 'Virtual' : 'Swap']}
                      labelFormatter={() => ''}
                      contentStyle={{ 
                        backgroundColor: 'var(--color-surface)', 
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-primary)'
                      }}
                    />
                    {showPhysicalMemory && (
                      <Bar 
                        dataKey="physical" 
                        fill={getMemoryColor(latestPhysical, 'physical')}
                        name="Physical"
                      />
                    )}
                    {showVirtualMemory && (
                      <Bar 
                        dataKey="virtual" 
                        fill={getMemoryColor(latestVirtual, 'virtual')}
                        name="Virtual"
                      />
                    )}
                    {showSwapMemory && (
                      <Bar 
                        dataKey="swap" 
                        fill={getMemoryColor(latestSwap, 'swap')}
                        name="Swap"
                      />
                    )}
                  </BarChart>
                ) : (
                  <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="physicalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getMemoryColor(latestPhysical, 'physical')} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={getMemoryColor(latestPhysical, 'physical')} stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="virtualGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getMemoryColor(latestVirtual, 'virtual')} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={getMemoryColor(latestVirtual, 'virtual')} stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="swapGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getMemoryColor(latestSwap, 'swap')} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={getMemoryColor(latestSwap, 'swap')} stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'physical' ? 'Physical' : name === 'virtual' ? 'Virtual' : 'Swap']}
                      labelFormatter={() => ''}
                      contentStyle={{ 
                        backgroundColor: 'var(--color-surface)', 
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-primary)'
                      }}
                    />
                    {showPhysicalMemory && (
                      <Area 
                        type="monotone" 
                        dataKey="physical" 
                        stroke={getMemoryColor(latestPhysical, 'physical')}
                        strokeWidth={2}
                        fill="url(#physicalGradient)"
                        name="Physical"
                      />
                    )}
                    {showVirtualMemory && (
                      <Area 
                        type="monotone" 
                        dataKey="virtual" 
                        stroke={getMemoryColor(latestVirtual, 'virtual')}
                        strokeWidth={2}
                        fill="url(#virtualGradient)"
                        name="Virtual"
                      />
                    )}
                    {showSwapMemory && (
                      <Area 
                        type="monotone" 
                        dataKey="swap" 
                        stroke={getMemoryColor(latestSwap, 'swap')}
                        strokeWidth={2}
                        fill="url(#swapGradient)"
                        name="Swap"
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
          title="Memory Detail Widget 설정"
        >
          <div className="settings-section">
            <label>
              <input 
                type="checkbox" 
                checked={showPhysicalMemory}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showPhysicalMemory: e.target.checked });
                }}
              />
              Show physical memory
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showVirtualMemory}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showVirtualMemory: e.target.checked });
                }}
              />
              Show virtual memory
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showSwapMemory}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showSwapMemory: e.target.checked });
                }}
              />
              Show swap memory
            </label>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

export default memo(MemoryDetailWidget);