import { useDashboardStore } from '../stores/dashboardStore';
import { useToast } from '../contexts/ToastContext';
import './PageControls.css';

interface WidgetOption {
  type: 'cpu' | 'ram' | 'disk_read' | 'net_sent' | 'cpu_temp';
  label: string;
  icon: React.ReactElement;
  description: string;
}

const widgetOptions: WidgetOption[] = [
  {
    type: 'cpu',
    label: 'CPU Monitor',
    description: 'Track CPU usage and performance',
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
    type: 'cpu_temp',
    label: 'CPU Temperature',
    description: 'Monitor CPU temperature in real-time',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    ),
  },
  {
    type: 'ram',
    label: 'Memory Monitor',
    description: 'Monitor RAM usage and availability',
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
    type: 'disk_read',
    label: 'Disk Monitor',
    description: 'Track disk read/write speeds',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 12H2M22 12a10 10 0 11-20 0 10 10 0 0120 0z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    type: 'net_sent',
    label: 'Network Monitor',
    description: 'Monitor network activity',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
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

  return (
    <div className="page-controls">
      <div className="page-controls-header">
        <h2>Add Widgets</h2>
        <p>Choose widgets to monitor your system resources</p>
      </div>
      <div className="widget-options">
        {widgetOptions.map((option) => (
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
  );
}; 