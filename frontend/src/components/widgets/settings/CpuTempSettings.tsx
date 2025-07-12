import React from 'react';
import { useDashboardStore } from '../../../stores/dashboardStore';
import type { Widget } from '../../../stores/types';
import './SettingsForm.css';

interface CpuTempSettingsProps {
  widget: Widget;
}

export const CpuTempSettings: React.FC<CpuTempSettingsProps> = ({ widget }) => {
  const updateWidgetConfig = useDashboardStore((state) => state.actions.updateWidgetConfig);
  
  const config = widget.config || {};

  const handleConfigChange = (key: string, value: any) => {
    updateWidgetConfig(widget.i, { [key]: value });
  };

  return (
    <div className="settings-form">
      <h3>데이터 표시 옵션</h3>
      
      <div className="form-group">
        <label>
          차트 타입
        </label>
        <select
          value={config.chartType || 'area'}
          onChange={(e) => handleConfigChange('chartType', e.target.value)}
        >
          <option value="area">영역 차트</option>
          <option value="line">선 차트</option>
          <option value="bar">막대 차트</option>
        </select>
      </div>

      <div className="form-group">
        <label>
          차트 색상
        </label>
        <div className="color-input-wrapper">
          <input
            type="color"
            value={config.color || '#4CAF50'}
            onChange={(e) => handleConfigChange('color', e.target.value)}
          />
          <span>{config.color || '#4CAF50'}</span>
        </div>
      </div>

      <h3>온도 임계값</h3>
      
      <div className="form-group">
        <label>
          경고 온도 (°C)
        </label>
        <div className="range-slider-wrapper">
          <input
            type="range"
            min="50"
            max="90"
            value={config.warningThreshold || 70}
            onChange={(e) => handleConfigChange('warningThreshold', parseInt(e.target.value))}
          />
          <span>{config.warningThreshold || 70}°C</span>
        </div>
        <small>이 온도를 초과하면 경고 색상으로 표시됩니다</small>
      </div>

      <div className="form-group">
        <label>
          위험 온도 (°C)
        </label>
        <div className="range-slider-wrapper">
          <input
            type="range"
            min="70"
            max="100"
            value={config.criticalThreshold || 85}
            onChange={(e) => handleConfigChange('criticalThreshold', parseInt(e.target.value))}
          />
          <span>{config.criticalThreshold || 85}°C</span>
        </div>
        <small>이 온도를 초과하면 위험 색상으로 표시됩니다</small>
      </div>

      <h3>시간 범위 설정</h3>
      
      <div className="form-group">
        <label>
          데이터 포인트 수
        </label>
        <div className="range-slider-wrapper">
          <input
            type="range"
            min="10"
            max="200"
            value={config.dataPoints || 50}
            onChange={(e) => handleConfigChange('dataPoints', parseInt(e.target.value))}
          />
          <span>{config.dataPoints || 50}</span>
        </div>
        <small>차트에 표시할 데이터 포인트의 개수</small>
      </div>
    </div>
  );
}; 