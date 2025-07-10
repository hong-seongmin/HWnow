import { useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import { useDashboardStore } from '../../stores/dashboardStore';
import CpuWidget from '../widgets/CpuWidget';
import MemoryWidget from '../widgets/MemoryWidget';
import DiskWidget from '../widgets/DiskWidget';
import NetworkWidget from '../widgets/NetworkWidget';
import { useToast } from '../../contexts/ToastContext';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './Dashboard.css';
import type { WidgetType } from '../../stores/types';

const ResponsiveGridLayout = WidthProvider(Responsive);

const widgetMap: { [key in WidgetType]: React.ComponentType<{ widgetId: string; onRemove: () => void }> } = {
  cpu: CpuWidget,
  ram: MemoryWidget,
  disk_read: DiskWidget,
  disk_write: DiskWidget, // Both disk metrics use the same component
  net_sent: NetworkWidget,
  net_recv: NetworkWidget, // Both net metrics use the same component
};

const Dashboard = () => {
  const { layouts, widgets, isInitialized, actions } = useDashboardStore();
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    if (!isInitialized) {
      actions.initialize();
    }
  }, [isInitialized, actions]);

  const handleLayoutChange = (newLayout: Layout[]) => {
    actions.updateLayout(newLayout);
    // This action will be debounced in a real-world scenario
    actions.saveLayouts();
  };

  const handleRemoveWidget = (widgetId: string) => {
    const widget = widgets.find((w) => w.i === widgetId);
    const widgetName = widget ? widget.type.replace(/_/g, ' ').toUpperCase() : 'Widget';
    try {
      actions.removeWidget(widgetId);
      actions.saveLayouts();
      showSuccess(`${widgetName} widget removed`);
    } catch (error) {
      showError(`Failed to remove ${widgetName} widget`);
    }
  };

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
  
  if (widgets.length === 0) {
    return (
      <div className="empty-dashboard">
        <h3>Dashboard is empty</h3>
        <p>Add some widgets to get started!</p>
      </div>
    );
  }

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={{ lg: layoutsWithConstraints }}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
      rowHeight={100}
      onLayoutChange={handleLayoutChange}
      draggableHandle=".widget-header"
      draggableCancel=".widget-action-button, .remove-widget-button"
      compactType="vertical"
      preventCollision={false}
      resizeHandles={['se', 'sw', 'ne', 'nw']}
      isResizable={true}
      isDraggable={true}
    >
      {widgets.map((widget) => {
        const WidgetComponent = widgetMap[widget.type];
        return (
          <div key={widget.i} className="widget-wrapper">
            {WidgetComponent ? (
              <WidgetComponent widgetId={widget.i} onRemove={() => handleRemoveWidget(widget.i)} />
            ) : (
              <div>Unknown Widget</div>
            )}
          </div>
        );
      })}
    </ResponsiveGridLayout>
  );
};

export default Dashboard; 