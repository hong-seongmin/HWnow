import { memo, useState } from 'react';
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

const NetworkStatusWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const networkInterfaces = useSystemResourceStore((state) => state.data.network_interfaces);

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  const config = widget?.config || {};
  const showIpAddress = config.showIpAddress !== false;
  const showConnectionStatus = config.showConnectionStatus !== false;
  const showBandwidth = config.showBandwidth !== false;

  // 네트워크 인터페이스 목록 생성
  const getNetworkList = () => {
    return Object.entries(networkInterfaces).map(([name, data]) => {
      const latestStatus = data.status.length > 0 ? data.status[data.status.length - 1] : 0;
      const isConnected = latestStatus === 1;
      
      return {
        name,
        status: isConnected ? 'Connected' : 'Disconnected',
        ip: data.ip || 'N/A',
        isConnected,
      };
    });
  };

  const networkList = getNetworkList();
  const connectedCount = networkList.filter(n => n.isConnected).length;
  const totalCount = networkList.length;

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  return (
    <>
      <div className="widget widget-network-status" role="region" aria-label="Network Status Monitor">
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="Network status widget settings"
              aria-label="Open Network status widget settings"
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
                title="Expand Network Status widget"
                aria-label="Expand Network Status widget"
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
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            </div>
            <span id="network-status-widget-title">Network Status</span>
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove Network Status widget"
              aria-label="Remove Network Status widget"
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
            aria-label={`${connectedCount} of ${totalCount} network interfaces connected`}
          >
            <span className="widget-value-number" style={{ color: connectedCount > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
              {connectedCount}
            </span>
            <span className="widget-value-text">/ {totalCount}</span>
          </div>
          
          <div className="widget-info" role="complementary" aria-label="Network interface details">
            {networkList.length === 0 ? (
              <div className="widget-info-item">
                <span className="widget-info-value">No network interfaces detected</span>
              </div>
            ) : (
              <div className="network-interfaces-list">
                {networkList.map((network) => (
                  <div key={network.name} className="network-interface-item">
                    <div className="network-interface-header">
                      <span className="network-interface-name">{network.name}</span>
                      <span 
                        className="network-interface-status" 
                        style={{ 
                          color: network.isConnected ? 'var(--color-success)' : 'var(--color-error)' 
                        }}
                      >
                        {network.status}
                      </span>
                    </div>
                    
                    {showIpAddress && network.ip !== 'N/A' && (
                      <div className="network-interface-details">
                        <span className="network-interface-ip">{network.ip}</span>
                      </div>
                    )}
                    
                    {showBandwidth && (
                      <div className="network-interface-details">
                        <span className="network-interface-bandwidth">
                          {network.isConnected ? '1 Gbps' : 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="widget-summary">
            <div className="widget-info-item">
              <span className="widget-info-label">Active:</span>
              <span className="widget-info-value" style={{ color: 'var(--color-success)' }}>
                {connectedCount}
              </span>
            </div>
            <div className="widget-info-item">
              <span className="widget-info-label">Inactive:</span>
              <span className="widget-info-value" style={{ color: 'var(--color-error)' }}>
                {totalCount - connectedCount}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {widget && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          title="Network Status Widget 설정"
        >
          <div className="settings-section">
            <label>
              <input 
                type="checkbox" 
                checked={showIpAddress}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showIpAddress: e.target.checked });
                }}
              />
              Show IP address
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showConnectionStatus}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showConnectionStatus: e.target.checked });
                }}
              />
              Show connection status
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={showBandwidth}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { showBandwidth: e.target.checked });
                }}
              />
              Show bandwidth
            </label>
          </div>
        </SettingsModal>
      )}
    </>
  );
};

export default memo(NetworkStatusWidget);