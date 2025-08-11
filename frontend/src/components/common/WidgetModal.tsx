import React, { useEffect, useRef } from 'react';
import type { WidgetType } from '../../stores/types';
import CpuWidget from '../widgets/CpuWidget';
import MemoryWidget from '../widgets/MemoryWidget';
import DiskWidget from '../widgets/DiskWidget';
import NetworkWidget from '../widgets/NetworkWidget';
import SystemUptimeWidget from '../widgets/SystemUptimeWidget';
import DiskSpaceWidget from '../widgets/DiskSpaceWidget';
import MemoryDetailWidget from '../widgets/MemoryDetailWidget';
import BatteryWidget from '../widgets/BatteryWidget';
import NetworkStatusWidget from '../widgets/NetworkStatusWidget';
import ProcessMonitorWidget from '../widgets/ProcessMonitorWidget';
import SystemLogWidget from '../widgets/SystemLogWidget';
import GpuWidget from '../widgets/GpuWidget';
import GpuProcessWidget from '../widgets/GpuProcessWidget';
import './WidgetFullscreen.css';

const widgetMap: { [key in WidgetType]: React.ComponentType<{ widgetId: string; onRemove: () => void; isExpanded?: boolean }> } = {
  cpu: CpuWidget,
  ram: MemoryWidget,
  disk_read: DiskWidget,
  disk_write: DiskWidget,
  net_sent: NetworkWidget,
  net_recv: NetworkWidget,
  gpu: GpuWidget,
  gpu_process: GpuProcessWidget,
  system_uptime: SystemUptimeWidget,
  process_monitor: ProcessMonitorWidget,
  battery: BatteryWidget,
  disk_space: DiskSpaceWidget,
  network_status: NetworkStatusWidget,
  memory_detail: MemoryDetailWidget,
  system_log: SystemLogWidget,
};

interface WidgetFullscreenProps {
  widgetId: string;
  widgetType: WidgetType;
  isOpen: boolean;
  onClose: () => void;
}


export const WidgetFullscreen: React.FC<WidgetFullscreenProps> = ({
  widgetId,
  widgetType,
  isOpen,
  onClose
}) => {
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const WidgetComponent = widgetMap[widgetType];

  useEffect(() => {
    if (isOpen) {
      // 전체화면 진입 시 body 스크롤 방지
      document.body.style.overflow = 'hidden';
      document.body.classList.add('widget-fullscreen-active');
      
      if (fullscreenRef.current) {
        fullscreenRef.current.focus();
      }
    } else {
      // 전체화면 종료 시 body 스크롤 복원
      document.body.style.overflow = 'auto';
      document.body.classList.remove('widget-fullscreen-active');
    }

    return () => {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('widget-fullscreen-active');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="widget-fullscreen"
      ref={fullscreenRef}
      tabIndex={-1}
    >
      {/* 종료 버튼 - 우상단 고정 */}
      <button 
        className="widget-fullscreen-close"
        onClick={onClose}
        title="Exit Fullscreen (ESC)"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </button>

      {/* ESC 힌트 - 좌상단 고정 */}
      <div className="widget-fullscreen-hint">
        Press <kbd>ESC</kbd> to exit fullscreen
      </div>
      
      <div className="widget-fullscreen-content">
        {WidgetComponent && (
          <div className="widget-fullscreen-scaled">
            <WidgetComponent 
              widgetId={widgetId}
              onRemove={() => {}} // 전체화면에서는 제거 버튼 비활성화
              isExpanded={false} // 일반 모드로 렌더링한 후 스케일링
            />
          </div>
        )}
      </div>
    </div>
  );
};