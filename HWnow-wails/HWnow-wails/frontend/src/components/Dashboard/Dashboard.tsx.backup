import { useEffect, useState, useCallback } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useHistoryStore } from '../../stores/historyStore';
import { RemoveWidgetCommand, UpdateLayoutCommand } from '../../stores/commands';
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
import { ContextMenu } from '../common/ContextMenu';
import { WidgetFullscreen } from '../common/WidgetModal';
import { useWidgetZoom } from '../../hooks/useWidgetZoom';
import { useToast } from '../../contexts/ToastContext';
import { WailsEventService } from '../../services/wailsEventService';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './Dashboard.css';
import type { WidgetType } from '../../stores/types';

const ResponsiveGridLayout = WidthProvider(Responsive);

// 쓰로틀링 함수 (컴포넌트 외부로 이동)
const throttle = (func: Function, limit: number) => {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

const widgetMap: { [key in WidgetType]: React.ComponentType<{ widgetId: string; onRemove: () => void; isExpanded?: boolean; onExpand?: () => void }> } = {
  cpu: CpuWidget,
  ram: MemoryWidget,
  disk_read: DiskWidget,
  disk_write: DiskWidget, // Both disk metrics use the same component
  net_sent: NetworkWidget,
  net_recv: NetworkWidget, // Both net metrics use the same component
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

const Dashboard = () => {
  const { pages, activePageIndex, isInitialized, actions } = useDashboardStore();
  const { actions: historyActions } = useHistoryStore();
  const { showSuccess, showError } = useToast();
  
  const activePage = pages[activePageIndex];
  const layouts = activePage?.layouts || [];
  const widgets = activePage?.widgets || [];
  

  // Context menu state
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  // Widget zoom state
  const { expandedWidget, expandWidget, collapseWidget } = useWidgetZoom();
  
  // Widget focus state - Dashboard에서 직접 관리
  const [focusedWidgetId, setFocusedWidgetId] = useState<string | null>(null);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<Set<string>>(new Set());
  
  
  // 위젯 포커스 함수들
  const focusWidget = useCallback((widgetId: string | null) => {
    setFocusedWidgetId(widgetId);
  }, []);
  
  const toggleWidgetSelection = useCallback((widgetId: string, multiSelect = false) => {
    setSelectedWidgetIds(prev => {
      const newSelected = new Set(prev);
      
      if (!multiSelect) {
        newSelected.clear();
      }
      
      if (newSelected.has(widgetId)) {
        newSelected.delete(widgetId);
      } else {
        newSelected.add(widgetId);
      }
      
      return newSelected;
    });
  }, []);
  
  const selectAllWidgets = useCallback(() => {
    const allWidgetIds = new Set(widgets.map(w => w.i));
    setSelectedWidgetIds(allWidgetIds);
  }, [widgets]);
  
  const isWidgetFocused = useCallback((widgetId: string) => {
    return focusedWidgetId === widgetId;
  }, [focusedWidgetId]);
  
  const isWidgetSelected = useCallback((widgetId: string) => {
    return selectedWidgetIds.has(widgetId);
  }, [selectedWidgetIds]);

  // Dynamic bottom padding state
  const [bottomPadding, setBottomPadding] = useState(500); // 기본 500px

  useEffect(() => {
    if (!isInitialized) {
      actions.initialize();
    }
  }, [isInitialized, actions]);

  // Track active widgets and optimize polling
  useEffect(() => {
    const eventService = WailsEventService.getInstance();
    
    if (widgets && widgets.length > 0) {
      const activeWidgetTypes: WidgetType[] = widgets.map(w => w.type);
      console.log('[Dashboard] Active widgets changed:', activeWidgetTypes);
      eventService.updateActiveWidgets(activeWidgetTypes);
    } else {
      // No widgets - stop all unnecessary polling
      console.log('[Dashboard] No widgets active, optimizing polling');
      eventService.updateActiveWidgets([]);
    }
  }, [widgets]);

  // 스크롤 끝 감지 및 동적 여백 추가
  const handleScroll = useCallback(() => {
    const scrollTop = window.pageYOffset;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // 하단 20% 지점에 도달하면 여백 추가 (최대 3000px까지)
    if (scrollTop + windowHeight >= documentHeight * 0.8 && bottomPadding < 3000) {
      const additionalPadding = Math.max(300, windowHeight * 0.4);
      setBottomPadding(prev => Math.min(prev + additionalPadding, 3000));
    }
    
    // 스크롤이 상단 10% 이내로 돌아가면 패딩 초기화
    if (scrollTop < documentHeight * 0.1 && bottomPadding > 500) {
      setBottomPadding(500);
    }
  }, [bottomPadding]);

  // 스크롤 이벤트 리스너 등록
  useEffect(() => {
    const throttledHandleScroll = throttle(handleScroll, 100);
    window.addEventListener('scroll', throttledHandleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', throttledHandleScroll);
    };
  }, [handleScroll]);

  // 스크롤 위치 복원 (페이지 로드 시)
  useEffect(() => {
    const savedScrollY = sessionStorage.getItem('dashboard-scroll-y');
    const savedPadding = sessionStorage.getItem('dashboard-bottom-padding');
    
    if (savedScrollY) {
      window.scrollTo(0, parseInt(savedScrollY));
    }
    
    if (savedPadding) {
      setBottomPadding(parseInt(savedPadding));
    }
  }, []);

  // 스크롤 위치 저장 (페이지 언로드 시)
  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.setItem('dashboard-scroll-y', window.pageYOffset.toString());
      sessionStorage.setItem('dashboard-bottom-padding', bottomPadding.toString());
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [bottomPadding]);

  const handleLayoutChange = async (newLayout: Layout[]) => {
    const oldLayout = layouts;
    
    // 즉시 UI 업데이트 및 서버 저장 (기존 방식 유지)
    try {
      await actions.updateLayout(newLayout);
    } catch (error) {
      console.error('Failed to update layout:', error);
      return; // 서버 저장 실패 시 히스토리 추가 중단
    }
    
    // 히스토리에 Command 추가 (Undo/Redo용)
    const hasChanges = JSON.stringify(oldLayout) !== JSON.stringify(newLayout);
    if (hasChanges) {
      const command = new UpdateLayoutCommand(oldLayout, newLayout);
      // 히스토리는 비블로킹으로 처리
      historyActions.executeCommand(command).catch(error => {
        console.error('Failed to add layout change to history:', error);
      });
    }
  };

  const handleRemoveWidget = async (widgetId: string) => {
    const widget = widgets.find((w) => w.i === widgetId);
    const widgetName = widget ? widget.type.replace(/_/g, ' ').toUpperCase() : 'Widget';
    
    const command = new RemoveWidgetCommand(widgetId);
    
    try {
      await historyActions.executeCommand(command);
      showSuccess(`${widgetName} widget removed`);
    } catch (error) {
      showError(`Failed to remove ${widgetName} widget`);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setIsContextMenuOpen(true);
  };

  const handleContextMenuClose = () => {
    setIsContextMenuOpen(false);
  };

  // 전역 단축키에서 오는 이벤트들 리스닝
  useEffect(() => {
    const handleOpenContextMenu = (event: CustomEvent) => {
      const { position } = event.detail;
      setContextMenuPosition(position);
      setIsContextMenuOpen(true);
    };

    const handleSelectAllWidgets = () => {
      selectAllWidgets();
    };

    const handleDeleteSelectedWidgets = () => {
      if (selectedWidgetIds.size > 0) {
        Array.from(selectedWidgetIds).forEach(widgetId => {
          handleRemoveWidget(widgetId);
        });
        setSelectedWidgetIds(new Set());
      } else if (focusedWidgetId) {
        handleRemoveWidget(focusedWidgetId);
      }
    };

    const handleShowToast = (event: CustomEvent) => {
      const { message, type } = event.detail;
      if (type === 'info') {
        showSuccess(message);
      } else if (type === 'error') {
        showError(message);
      }
    };

    window.addEventListener('openContextMenu', handleOpenContextMenu as EventListener);
    window.addEventListener('selectAllWidgets', handleSelectAllWidgets as EventListener);
    window.addEventListener('deleteSelectedWidgets', handleDeleteSelectedWidgets as EventListener);
    window.addEventListener('showToast', handleShowToast as EventListener);
    
    return () => {
      window.removeEventListener('openContextMenu', handleOpenContextMenu as EventListener);
      window.removeEventListener('selectAllWidgets', handleSelectAllWidgets as EventListener);
      window.removeEventListener('deleteSelectedWidgets', handleDeleteSelectedWidgets as EventListener);
      window.removeEventListener('showToast', handleShowToast as EventListener);
    };
  }, [selectAllWidgets, selectedWidgetIds, focusedWidgetId, showSuccess, showError]);

  // 레이아웃에 크기 제한 추가
  const layoutsWithConstraints = layouts.map(layout => ({
    ...layout,
    minW: 3,
    maxW: 12,
    minH: 2,
    maxH: 6,
  }));

  if (!isInitialized) {
    return <div className="dashboard-loading">Loading Dashboard...</div>;
  }
  
  if (!activePage || widgets.length === 0) {
    return (
      <div 
        className="dashboard-container" 
        onContextMenu={handleContextMenu}
        style={{ paddingBottom: `${bottomPadding}px` }}
      >
        <div className="empty-dashboard">
          <h3>Dashboard is empty</h3>
          <p>Right-click to add widgets to get started!</p>
        </div>
        
        <ContextMenu
          isOpen={isContextMenuOpen}
          position={contextMenuPosition}
          onClose={handleContextMenuClose}
        />
      </div>
    );
  }

  return (
    <div 
      className="dashboard-container" 
      onContextMenu={handleContextMenu}
      style={{ paddingBottom: `${bottomPadding}px` }}
    >
      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: layoutsWithConstraints }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={100}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".widget-header"
        draggableCancel=".widget-action-button, .remove-widget-button"
        compactType={null}
        preventCollision={true}
        resizeHandles={['se', 'sw', 'ne', 'nw']}
        isResizable={true}
        isDraggable={true}
      >
        {widgets.map((widget) => {
          const WidgetComponent = widgetMap[widget.type];
          const isFocused = isWidgetFocused(widget.i);
          const isSelected = isWidgetSelected(widget.i);
          
          
          return (
            <div 
              key={widget.i} 
              className={[
                'widget-wrapper',
                isFocused ? 'widget-focused' : '',
                isSelected ? 'widget-selected' : ''
              ].filter(Boolean).join(' ')}
              data-widget-id={widget.i}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (e.ctrlKey || e.metaKey) {
                  toggleWidgetSelection(widget.i, true);
                } else {
                  toggleWidgetSelection(widget.i, false);
                }
                focusWidget(widget.i);
              }}
              onDoubleClick={() => expandWidget(widget.i)}
              role="button"
              aria-label={`Widget ${widget.i}`}
              aria-selected={isSelected}
            >
              {WidgetComponent ? (
                <WidgetComponent 
                  widgetId={widget.i} 
                  onRemove={() => handleRemoveWidget(widget.i)}
                  onExpand={() => expandWidget(widget.i)}
                />
              ) : (
                <div>Unknown Widget</div>
              )}
            </div>
          );
        })}
      </ResponsiveGridLayout>
      
      <ContextMenu
        isOpen={isContextMenuOpen}
        position={contextMenuPosition}
        onClose={handleContextMenuClose}
      />
      
      {/* Widget Fullscreen */}
      {expandedWidget && (
        <WidgetFullscreen
          widgetId={expandedWidget}
          widgetType={widgets.find(w => w.i === expandedWidget)?.type!}
          isOpen={!!expandedWidget}
          onClose={collapseWidget}
        />
      )}
    </div>
  );
};

export default Dashboard; 