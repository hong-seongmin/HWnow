import React from 'react';
import { useWidgetFocus } from '../../hooks/useWidgetFocus';
import './WidgetWrapper.css';

interface WidgetWrapperProps {
  widgetId: string;
  children: React.ReactNode;
  className?: string;
  onDoubleClick?: () => void;
}

export const WidgetWrapper: React.FC<WidgetWrapperProps> = ({
  widgetId,
  children,
  className = '',
  onDoubleClick,
}) => {
  const { 
    isWidgetFocused, 
    isWidgetSelected, 
    focusWidget, 
    toggleWidgetSelection 
  } = useWidgetFocus();

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd 클릭: 다중 선택
      toggleWidgetSelection(widgetId, true);
    } else {
      // 일반 클릭: 단일 선택
      toggleWidgetSelection(widgetId, false);
    }
    
    focusWidget(widgetId);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // 위젯 레벨에서 처리할 키보드 이벤트가 있다면 여기에 추가
    event.stopPropagation();
  };

  const isFocused = isWidgetFocused(widgetId);
  const isSelected = isWidgetSelected(widgetId);

  return (
    <div
      data-widget-id={widgetId}
      className={`
        widget-wrapper 
        ${className}
        ${isFocused ? 'widget-focused' : ''}
        ${isSelected ? 'widget-selected' : ''}
      `.trim()}
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      role="button"
      aria-label={`Widget ${widgetId}`}
      aria-selected={isSelected}
    >
      {children}
    </div>
  );
};