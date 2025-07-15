import { useDashboardStore } from '../stores/dashboardStore';
import { useToast } from '../contexts/ToastContext';
import './PageControls.css';

interface WidgetOption {
  type: 'cpu' | 'ram' | 'disk_read' | 'net_sent' | 'gpu' | 'system_uptime' | 'process_monitor' | 'battery' | 'disk_space' | 'network_status' | 'memory_detail' | 'system_log';
  label: string;
  icon: React.ReactElement;
  description: string;
  category: string;
}

const widgetOptions: WidgetOption[] = [
  // System Resources
  {
    type: 'cpu',
    label: 'CPU Monitor',
    description: 'Track CPU usage and performance',
    category: 'System Resources',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="15" x2="23" y2="15" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="15" x2="4" y2="15" />
      </svg>
    ),
  },
  {
    type: 'ram',
    label: 'Memory Monitor',
    description: 'Monitor RAM usage and availability',
    category: 'System Resources',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="8" width="18" height="8" rx="1" />
        <rect x="7" y="12" width="2" height="2" />
        <rect x="11" y="12" width="2" height="2" />
        <rect x="15" y="12" width="2" height="2" />
        <path d="M7 8V6a1 1 0 011-1h2m4 0h2a1 1 0 011 1v2M7 16v2a1 1 0 001 1h2m4 0h2a1 1 0 001-1v-2" />
      </svg>
    ),
  },
  {
    type: 'memory_detail',
    label: 'Memory Detail',
    description: 'Detailed memory usage (Physical, Virtual, Swap)',
    category: 'System Resources',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12h18m-9 4.5V7.5m-4.5 4.5L10 9l-2.5 3 2.5 3m5-6l2.5 3L15 15" />
      </svg>
    ),
  },
  {
    type: 'gpu',
    label: 'GPU Monitor',
    description: 'Monitor GPU usage, memory and temperature',
    category: 'System Resources',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    ),
  },
  // Storage & Network
  {
    type: 'disk_read',
    label: 'Disk I/O Monitor',
    description: 'Track disk read/write speeds',
    category: 'Storage & Network',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 12H2M22 12a10 10 0 11-20 0 10 10 0 0120 0z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    type: 'disk_space',
    label: 'Disk Space',
    description: 'Monitor disk usage and available space',
    category: 'Storage & Network',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
  {
    type: 'net_sent',
    label: 'Network I/O',
    description: 'Monitor network upload/download speeds',
    category: 'Storage & Network',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    type: 'network_status',
    label: 'Network Status',
    description: 'Monitor network interfaces and connections',
    category: 'Storage & Network',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
  },
  // System Info
  {
    type: 'system_uptime',
    label: 'System Uptime',
    description: 'Display system uptime and boot time',
    category: 'System Info',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    ),
  },
  {
    type: 'process_monitor',
    label: 'Top Processes',
    description: 'Monitor running processes and resource usage',
    category: 'System Info',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L13 14l-3.086-3.086a2 2 0 0 0-2.828 0L3 15" />
      </svg>
    ),
  },
  {
    type: 'battery',
    label: 'Battery Status',
    description: 'Monitor battery level and charging status',
    category: 'System Info',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
        <line x1="23" y1="13" x2="23" y2="11" />
        <rect x="3" y="8" width="14" height="8" rx="1" />
      </svg>
    ),
  },
  {
    type: 'system_log',
    label: 'System Logs',
    description: 'View recent system events and logs',
    category: 'System Info',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10,9 9,9 8,9" />
      </svg>
    ),
  },
];

export const PageControls = () => {
  const { addWidget } = useDashboardStore((state) => state.actions);
  const { showSuccess, showError } = useToast();

  const handleAddWidget = (type: WidgetOption['type'], label: string) => {
    try {
      addWidget(type);
      showSuccess(`${label} added to dashboard`);
    } catch (error) {
      showError(`Failed to add ${label}`);
    }
  };

  // Group widgets by category
  const widgetsByCategory = widgetOptions.reduce((acc, widget) => {
    if (!acc[widget.category]) {
      acc[widget.category] = [];
    }
    acc[widget.category].push(widget);
    return acc;
  }, {} as Record<string, WidgetOption[]>);

  return (
    <div className="page-controls">
      <div className="page-controls-header">
        <h2>Add Widgets</h2>
        <p>Choose widgets to monitor your system resources</p>
      </div>
      
      {Object.entries(widgetsByCategory).map(([category, widgets]) => (
        <div key={category} className="widget-category-section">
          <h3 className="widget-category-title">{category}</h3>
          <div className="widget-options">
            {widgets.map((option) => (
              <button
                key={option.type}
                className="widget-option-button"
                onClick={() => handleAddWidget(option.type, option.label)}
                title={option.description}
              >
                <div className="widget-option-icon">{option.icon}</div>
                <div className="widget-option-content">
                  <span className="widget-option-label">{option.label}</span>
                  <span className="widget-option-description">{option.description}</span>
                </div>
                <div className="widget-option-add">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}; 