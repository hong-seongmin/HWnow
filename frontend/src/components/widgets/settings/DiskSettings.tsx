import React from 'react';
import type { Widget, WidgetConfig } from '../../../stores/types';
import { useDashboardStore } from '../../../stores/dashboardStore';
import './SettingsForm.css';

interface DiskSettingsProps {
  widget: Widget;
}

const defaultConfig: WidgetConfig = {
  chartType: 'area',
  color: 'var(--color-warning)',
  dataPoints: 50,
  unit: 'MB/s',
  showGraph: true, // 기본적으로 그래프 표시
  showReadSpeed: true,
  showWriteSpeed: true,
  showTotalSpace: false,
  showFreeSpace: false,
  updateInterval: 1,
  warningThreshold: 80,
  criticalThreshold: 100,
};

export const DiskSettings: React.FC<DiskSettingsProps> = ({ widget }) => {
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
      <h3>데이터 표시 옵션</h3>
      
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="showGraph"
            checked={config.showGraph}
            onChange={handleConfigChange}
          />
          그래프 표시
        </label>
      </div>

      <div className="form-group">
        <label htmlFor="unit">단위 설정</label>
        <select 
          id="unit" 
          name="unit"
          value={config.unit}
          onChange={handleConfigChange}
        >
          <option value="MB/s">MB/s</option>
          <option value="KB/s">KB/s</option>
          <option value="GB/s">GB/s</option>
        </select>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="showReadSpeed"
            checked={config.showReadSpeed}
            onChange={handleConfigChange}
          />
          읽기 속도 표시
        </label>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="showWriteSpeed"
            checked={config.showWriteSpeed}
            onChange={handleConfigChange}
          />
          쓰기 속도 표시
        </label>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="showTotalSpace"
            checked={config.showTotalSpace}
            onChange={handleConfigChange}
          />
          전체 용량 표시
        </label>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            name="showFreeSpace"
            checked={config.showFreeSpace}
            onChange={handleConfigChange}
          />
          여유 공간 표시
        </label>
      </div>

      <h3>시간 범위 설정</h3>
      
      <div className="form-group">
        <label htmlFor="updateInterval">업데이트 주기 (초)</label>
        <div className="range-slider-wrapper">
          <input 
            type="range"
            id="updateInterval"
            name="updateInterval"
            min="0.5"
            max="10"
            step="0.5"
            value={config.updateInterval}
            onChange={handleConfigChange}
          />
          <span>{config.updateInterval}초</span>
        </div>
      </div>

      <h3>시각화 설정</h3>
      
      <div className="form-group">
        <label htmlFor="chartType">차트 유형</label>
        <select 
          id="chartType" 
          name="chartType"
          value={config.chartType}
          onChange={handleConfigChange}
        >
          <option value="area">Area Chart</option>
          <option value="line">Line Chart</option>
          <option value="bar">Bar Chart</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="color">차트 색상</label>
        <div className="color-input-wrapper">
          <input 
            type="color"
            id="color" 
            name="color"
            value={config.color || 'var(--color-warning)'}
            onChange={handleConfigChange}
          />
          <span>{config.color || 'var(--color-warning)'}</span>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="dataPoints">데이터 포인트 수</label>
        <div className="range-slider-wrapper">
          <input 
            type="range"
            id="dataPoints"
            name="dataPoints"
            min="10"
            max="200"
            step="10"
            value={config.dataPoints}
            onChange={handleConfigChange}
          />
          <span>{config.dataPoints}</span>
        </div>
        <small>차트에 표시할 데이터 포인트 수입니다.</small>
      </div>

      <h3>임계값 설정</h3>
      
      <div className="form-group">
        <label htmlFor="warningThreshold">경고 임계값 (MB/s)</label>
        <div className="range-slider-wrapper">
          <input 
            type="range"
            id="warningThreshold"
            name="warningThreshold"
            min="50"
            max="200"
            step="10"
            value={config.warningThreshold}
            onChange={handleConfigChange}
          />
          <span>{config.warningThreshold} MB/s</span>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="criticalThreshold">위험 임계값 (MB/s)</label>
        <div className="range-slider-wrapper">
          <input 
            type="range"
            id="criticalThreshold"
            name="criticalThreshold"
            min="100"
            max="500"
            step="10"
            value={config.criticalThreshold}
            onChange={handleConfigChange}
          />
          <span>{config.criticalThreshold} MB/s</span>
        </div>
      </div>
    </form>
  );
}; 