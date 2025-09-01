import React from 'react';
// import type { Widget } from '../../../stores/types';
import './SettingsForm.css';

export interface Threshold {
  value: number;
  color: string;
}

export interface CpuRamConfig {
  title: string;
  thresholds: Threshold[];
}

interface CpuRamSettingsProps {
  config: Partial<CpuRamConfig>;
  onConfigChange: (newConfig: Partial<CpuRamConfig>) => void;
}

export const CpuRamSettings: React.FC<CpuRamSettingsProps> = ({ config, onConfigChange }) => {
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...config, title: e.target.value });
  };

  const handleThresholdChange = (index: number, field: keyof Threshold, value: string | number) => {
    const newThresholds = [...(config.thresholds || [])];
    (newThresholds[index] as any)[field] = value;
    onConfigChange({ ...config, thresholds: newThresholds });
  };

  return (
    <div className="settings-form">
      <div className="form-group">
        <label>Widget Title</label>
        <input 
          type="text" 
          value={config.title || ''}
          onChange={handleTitleChange} 
        />
      </div>
      <div className="form-group">
        <label>Color Thresholds</label>
        <div className="thresholds-list">
          {(config.thresholds || []).map((t, index) => (
            <div key={index} className="threshold-item">
              <span>When usage is over</span>
              <input 
                type="number"
                value={t.value}
                onChange={(e) => handleThresholdChange(index, 'value', parseInt(e.target.value))}
              />
              <span>% use color</span>
              <input 
                type="color"
                value={t.color}
                onChange={(e) => handleThresholdChange(index, 'color', e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 