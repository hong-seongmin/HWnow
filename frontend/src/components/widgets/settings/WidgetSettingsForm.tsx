import React from 'react';
import type { Widget, WidgetConfig } from '../../../stores/types';
import { useDashboardStore } from '../../../stores/dashboardStore';
import './SettingsForm.css';

interface CpuRamSettingsProps {
  widget: Widget;
}

const defaultConfig: WidgetConfig = {
  chartType: 'line',
  color: '#8884d8',
  dataPoints: 50,
};

export const CpuRamSettings: React.FC<CpuRamSettingsProps> = ({ widget }) => {
  const { updateWidgetConfig } = useDashboardStore((state) => state.actions);
  
  const config = { ...defaultConfig, ...widget.config };

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    updateWidgetConfig(widget.i, { [name]: value });
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWidgetConfig(widget.i, { color: e.target.value });
  };

  return (
    <form className="settings-form">
      <div className="form-group">
        <label htmlFor="chartType">Chart Type</label>
        <select 
          id="chartType" 
          name="chartType"
          value={config.chartType}
          onChange={handleConfigChange}
        >
          <option value="line">Line</option>
          <option value="bar">Bar</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="color">Chart Color</label>
        <div className="color-input-wrapper">
              <input 
                type="color"
            id="color" 
            name="color"
            value={config.color}
            onChange={handleColorChange}
              />
          <span>{config.color}</span>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="dataPoints">Data Points</label>
        <div className="range-slider-wrapper">
          <input 
            type="range"
            id="dataPoints"
            name="dataPoints"
            min="10"
            max="200"
            step="10"
            value={config.dataPoints || 50}
            onChange={handleConfigChange}
          />
          <span>{config.dataPoints || 50}</span>
        </div>
        <small>Number of data points to show in the chart.</small>
      </div>
    </form>
  );
}; 