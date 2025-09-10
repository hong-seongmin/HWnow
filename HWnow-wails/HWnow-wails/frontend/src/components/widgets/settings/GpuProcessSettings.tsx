import React from 'react';
import type { Widget, WidgetConfig } from '../../../stores/types';
import { useDashboardStore } from '../../../stores/dashboardStore';
import './SettingsForm.css';

interface GpuProcessSettingsProps {
  widget: Widget;
}

const defaultConfig: WidgetConfig = {
  gpuProcessCount: 10,
  gpuSortBy: 'gpu_usage_percent',
  gpuSortOrder: 'desc',
  gpuFilterEnabled: false,
  gpuUsageThreshold: 0,
  gpuMemoryThreshold: 0,
  gpuFilterType: 'or',
  gpuShowTerminateButton: true,
  gpuRefreshInterval: 3,
};

export const GpuProcessSettings: React.FC<GpuProcessSettingsProps> = ({ widget }) => {
  const { updateWidgetConfig } = useDashboardStore((state) => state.actions);
  
  const config = { ...defaultConfig, ...widget.config };

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let updatedValue: any = value;
    
    if (type === 'checkbox') {
      updatedValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'number' || type === 'range') {
      updatedValue = Number(value);
    }
    
    updateWidgetConfig(widget.i, { [name]: updatedValue });
  };

  return (
    <form className="settings-form">
      <h3>Display Settings</h3>
      
      <div className="form-group">
        <label>
          Process Count: {config.gpuProcessCount}
        </label>
        <input
          type="range"
          name="gpuProcessCount"
          min="1"
          max="20"
          value={config.gpuProcessCount}
          onChange={handleConfigChange}
        />
        <div className="range-labels">
          <span>1</span>
          <span>20</span>
        </div>
      </div>

      <div className="form-group">
        <label>Sort By:</label>
        <select
          name="gpuSortBy"
          value={config.gpuSortBy}
          onChange={handleConfigChange}
        >
          <option value="gpu_usage_percent">GPU Usage (%)</option>
          <option value="gpu_memory_mb">GPU Memory (MB)</option>
          <option value="pid">PID</option>
          <option value="name">Process Name</option>
        </select>
      </div>

      <div className="form-group">
        <label>Sort Order:</label>
        <select
          name="gpuSortOrder"
          value={config.gpuSortOrder}
          onChange={handleConfigChange}
        >
          <option value="desc">Descending (High to Low)</option>
          <option value="asc">Ascending (Low to High)</option>
        </select>
      </div>

      <h3>Filter Settings</h3>
      
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="gpuFilterEnabled"
            checked={config.gpuFilterEnabled}
            onChange={handleConfigChange}
          />
          Enable Filtering
        </label>
      </div>

      {config.gpuFilterEnabled && (
        <>
          <div className="form-group">
            <label>
              GPU Usage Threshold: {config.gpuUsageThreshold}%
            </label>
            <input
              type="range"
              name="gpuUsageThreshold"
              min="0"
              max="100"
              value={config.gpuUsageThreshold}
              onChange={handleConfigChange}
            />
            <div className="range-labels">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="form-group">
            <label>
              Memory Threshold: {config.gpuMemoryThreshold}MB
            </label>
            <input
              type="range"
              name="gpuMemoryThreshold"
              min="0"
              max="1000"
              step="10"
              value={config.gpuMemoryThreshold}
              onChange={handleConfigChange}
            />
            <div className="range-labels">
              <span>0MB</span>
              <span>1000MB</span>
            </div>
          </div>

          <div className="form-group">
            <label>Filter Condition:</label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="gpuFilterType"
                  value="or"
                  checked={config.gpuFilterType === 'or'}
                  onChange={handleConfigChange}
                />
                <span>OR (Either condition)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="gpuFilterType"
                  value="and"
                  checked={config.gpuFilterType === 'and'}
                  onChange={handleConfigChange}
                />
                <span>AND (Both conditions)</span>
              </label>
            </div>
          </div>
        </>
      )}

      <h3>Display Options</h3>
      
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="gpuShowTerminateButton"
            checked={config.gpuShowTerminateButton}
            onChange={handleConfigChange}
          />
          Show Terminate Button
        </label>
      </div>

      <div className="form-group">
        <label>
          Refresh Interval: {config.gpuRefreshInterval}s
        </label>
        <input
          type="range"
          name="gpuRefreshInterval"
          min="1"
          max="10"
          value={config.gpuRefreshInterval}
          onChange={handleConfigChange}
        />
        <div className="range-labels">
          <span>1s</span>
          <span>10s</span>
        </div>
      </div>
    </form>
  );
};