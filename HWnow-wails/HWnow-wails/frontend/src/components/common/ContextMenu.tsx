import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useHistoryStore } from '../../stores/historyStore';
import { AddWidgetCommand } from '../../stores/commands';
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
    type: 'gpu_process',
    label: 'GPU Processes',
    description: 'Monitor and control GPU processes',
    category: 'System Info',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <rect x="5" y="6" width="3" height="2" rx="1" />
        <rect x="10" y="6" width="3" height="2" rx="1" />
        <rect x="15" y="6" width="3" height="2" rx="1" />
        <rect x="5" y="10" width="3" height="2" rx="1" />
        <rect x="10" y="10" width="3" height="2" rx="1" />
        <rect x="15" y="10" width="3" height="2" rx="1" />
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
  const [submenuPosition, setSubmenuPosition] = useState<{[key: string]: {left: number, top: number, direction: 'left' | 'right'}}>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  const timeoutRef = useRef<number | null>(null);
  const { actions: historyActions } = useHistoryStore();
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
  
  // Debug logging
  console.log('ContextMenu Debug - widgetOptions length:', widgetOptions.length);
  console.log('ContextMenu Debug - widgetsByCategory:', widgetsByCategory);
  console.log('ContextMenu Debug - System Info widgets:', widgetsByCategory['System Info']);
  console.log('ContextMenu Debug - System Info widget details:', 
    widgetsByCategory['System Info']?.map(w => ({ type: w.type, label: w.label })));
  console.log('ContextMenu Debug - GPU Process widget found:', widgetOptions.find(w => w.type === 'gpu_process'));
  

  useEffect(() => {
    if (!isOpen) {
      console.log('🔄 [ContextMenu] Menu closed - resetting all state');
      setActiveCategory(null);
      setSubmenuPosition({}); // 메뉴가 닫힐 때 모든 위치 상태 초기화
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

  const handleAddWidget = async (type: WidgetType, label: string) => {
    const command = new AddWidgetCommand(type);
    
    try {
      await historyActions.executeCommand(command);
      showSuccess(`${label} added to dashboard`);
      onClose();
    } catch (error) {
      showError(`Failed to add ${label}`);
    }
  };

  const handleCategoryEnter = (category: string, event: React.MouseEvent<HTMLDivElement>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    console.log('🖱️ [ContextMenu] Category hover:', category);
    setActiveCategory(category);

    // 타이밍 문제 해결: DOM 업데이트 후 위치 계산
    // setTimeout을 사용하여 다음 이벤트 루프에서 계산
    setTimeout(() => {
      // DOM이 완전히 업데이트되었는지 확인
      if (!menuRef.current) {
        console.warn('⚠️ [ContextMenu] menuRef not ready, retrying...');
        setTimeout(() => {
          if (menuRef.current) {
            const categoryElement = event.currentTarget;
            const position = getSubmenuPosition(category, categoryElement);
            setSubmenuPosition(prev => ({
              ...prev,
              [category]: position
            }));
          }
        }, 10);
        return;
      }

      const categoryElement = event.currentTarget;
      const position = getSubmenuPosition(category, categoryElement);

      console.log('💾 [ContextMenu] Setting submenu position for', category, ':', position);
      setSubmenuPosition(prev => {
        const newState = {
          ...prev,
          [category]: position
        };
        console.log('💾 [ContextMenu] New submenu position state:', newState);
        return newState;
      });
    }, 0);
  };

  const handleCategoryLeave = () => {
    timeoutRef.current = setTimeout(() => {
      console.log('🔄 [ContextMenu] Clearing active category and submenu positions');
      setActiveCategory(null);
      // 상태 초기화: 이전 계산 결과가 새로운 계산을 방해하지 않도록
      setSubmenuPosition({});
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

  const getSubmenuPosition = (category: string, categoryElement: HTMLElement): {left: number, top: number, direction: 'left' | 'right'} => {
    if (!menuRef.current) return { left: 0, top: 0, direction: 'right' };

    const categoryRect = categoryElement.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 서브메뉴 예상 크기 (실제 렌더링 전이므로 추정값 사용)
    const submenuWidth = 280; // CSS의 min-width와 동일
    const submenuHeight = Math.min(widgetsByCategory[category]?.length * 60 || 200, 400); // 항목당 대략 60px

    let left = 0;
    let top = 0;
    let direction: 'left' | 'right' = 'right';

    // 1. 오른쪽에 공간이 있는지 확인 (우선순위)
    const rightSpace = viewportWidth - categoryRect.right;
    const leftSpace = categoryRect.left;

    console.log('🔍 [ContextMenu] Submenu position calculation for category:', category);
    console.log('📏 Viewport width:', viewportWidth);
    console.log('📏 Category rect:', { left: categoryRect.left, right: categoryRect.right, top: categoryRect.top, bottom: categoryRect.bottom });
    console.log('📏 Right space:', rightSpace, 'Left space:', leftSpace);
    console.log('📏 Required submenu width:', submenuWidth);

    if (rightSpace >= submenuWidth) {
      // 오른쪽으로 펼침
      direction = 'right';
      console.log('✅ Direction: RIGHT (sufficient right space)');
    } else if (leftSpace >= submenuWidth) {
      // 왼쪽으로 펼침
      direction = 'left';
      console.log('✅ Direction: LEFT (insufficient right space, sufficient left space)');
    } else {
      // 공간이 부족한 경우, 더 넓은 쪽으로
      if (rightSpace > leftSpace) {
        direction = 'right';
        console.log('✅ Direction: RIGHT (both insufficient, but right space is larger)');
      } else {
        direction = 'left';
        console.log('✅ Direction: LEFT (both insufficient, but left space is larger)');
      }
    }

    // CSS에서 처리하므로 left는 상대적 위치만 필요
    left = 0;

    // 세로 위치 조정
    top = 0; // 기본적으로 카테고리와 같은 높이에서 시작

    // 서브메뉴가 화면 아래로 벗어나는 경우 위로 조정
    const submenuBottom = categoryRect.top + submenuHeight;
    if (submenuBottom > viewportHeight) {
      const overflow = submenuBottom - viewportHeight;
      top = Math.max(-categoryRect.top, -overflow);
      console.log('📏 Vertical adjustment: top =', top);
    }

    console.log('🎯 Final position:', { left, top, direction });
    return { left, top, direction };
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
            onMouseEnter={(e) => handleCategoryEnter(category, e)}
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
            
{useMemo(() => {
              if (activeCategory !== category || !widgetsByCategory[category]) return null;

              const direction = submenuPosition[category]?.direction || 'right';
              const cssClass = `context-menu-submenu ${direction === 'left' ? 'submenu-left' : 'submenu-right'}`;
              const topPosition = submenuPosition[category]?.top || 0;

              console.log('🎨 [ContextMenu] Rendering submenu for', category);
              console.log('🎨 Direction:', direction, 'CSS class:', cssClass);
              console.log('🎨 Top position:', topPosition);
              console.log('🎨 Submenu position state:', submenuPosition[category]);

              return (
                <div
                  ref={el => submenuRefs.current[category] = el}
                  className={cssClass}
                  style={{
                    top: topPosition,
                  }}
                  onMouseEnter={handleSubmenuEnter}
                  onMouseLeave={handleSubmenuLeave}
                >
                  {widgetsByCategory[category].map((widget) => {
                    if (category === 'System Info') {
                      console.log(`Rendering ${category} widget:`, widget.type, widget.label);
                    }
                    return (
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
                    );
                  })}
                </div>
              );
            }, [activeCategory, category, widgetsByCategory, submenuPosition, handleSubmenuEnter, handleSubmenuLeave])}
          </div>
        ))}
      </div>
    </div>
  );
};