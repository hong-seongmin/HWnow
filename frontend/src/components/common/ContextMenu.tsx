import React, { useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useToast } from '../../contexts/ToastContext';
import type { WidgetType } from '../../stores/types';
import './ContextMenu.css';

interface WidgetOption {
  type: WidgetType;
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
    description: 'Physical, Virtual, Swap memory',
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
    description: 'GPU usage, memory and temperature',
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
    label: 'Disk I/O',
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
    description: 'Monitor disk usage and space',
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
    description: 'Monitor network speeds',
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
    description: 'Monitor network interfaces',
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
    description: 'System uptime and boot time',
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
    description: 'Monitor running processes',
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
    description: 'Monitor battery level',
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
    description: 'View system events and logs',
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

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ isOpen, position, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const { addWidget } = useDashboardStore((state) => state.actions);
  const { showSuccess, showError } = useToast();

  // Group widgets by category
  const widgetsByCategory = widgetOptions.reduce((acc, widget) => {
    if (!acc[widget.category]) {
      acc[widget.category] = [];
    }
    acc[widget.category].push(widget);
    return acc;
  }, {} as Record<string, WidgetOption[]>);

  const categories = Object.keys(widgetsByCategory);
  

  useEffect(() => {
    if (!isOpen) {
      setActiveCategory(null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isOpen, onClose]);

  const handleAddWidget = (type: WidgetType, label: string) => {
    try {
      addWidget(type);
      showSuccess(`${label} added to dashboard`);
      onClose();
    } catch (error) {
      showError(`Failed to add ${label}`);
    }
  };

  const handleCategoryEnter = (category: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setActiveCategory(category);
  };

  const handleCategoryLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveCategory(null);
    }, 200);
  };

  const handleSubmenuEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handleSubmenuLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveCategory(null);
    }, 200);
  };

  const getMenuPosition = () => {
    if (!menuRef.current) return { top: position.y, left: position.x };

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = position.y;
    let left = position.x;

    // Adjust if menu would go off-screen
    if (left + menuRect.width > viewportWidth) {
      left = position.x - menuRect.width;
    }
    if (top + menuRect.height > viewportHeight) {
      top = position.y - menuRect.height;
    }

    // Ensure menu stays within viewport
    top = Math.max(0, Math.min(top, viewportHeight - menuRect.height));
    left = Math.max(0, Math.min(left, viewportWidth - menuRect.width));

    return { top, left };
  };

  if (!isOpen) return null;

  const menuPosition = getMenuPosition();

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        top: menuPosition.top,
        left: menuPosition.left,
        zIndex: 1000,
      }}
    >
      <div className="context-menu-header">
        <span className="context-menu-title">Add Widget</span>
      </div>
      
      <div className="context-menu-content">
        {categories.map((category) => (
          <div
            key={category}
            className="context-menu-category"
            onMouseEnter={() => handleCategoryEnter(category)}
            onMouseLeave={handleCategoryLeave}
          >
            <div className="context-menu-category-header">
              <span className="context-menu-category-title">{category}</span>
              <svg 
                className="context-menu-arrow" 
                width="12" 
                height="12" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </div>
            
            {activeCategory === category && widgetsByCategory[category] && (
              <div 
                className="context-menu-submenu"
                onMouseEnter={handleSubmenuEnter}
                onMouseLeave={handleSubmenuLeave}
              >
                {widgetsByCategory[category].map((widget) => (
                  <button
                    key={widget.type}
                    className="context-menu-item"
                    onClick={() => handleAddWidget(widget.type, widget.label)}
                    title={widget.description}
                  >
                    <div className="context-menu-item-icon">
                      {widget.icon}
                    </div>
                    <div className="context-menu-item-content">
                      <span className="context-menu-item-label">{widget.label}</span>
                      <span className="context-menu-item-description">{widget.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};