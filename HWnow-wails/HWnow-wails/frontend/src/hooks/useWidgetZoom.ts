import { useState, useEffect } from 'react';

export const useWidgetZoom = () => {
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);

  const expandWidget = (widgetId: string) => {
    setExpandedWidget(widgetId);
  };

  const collapseWidget = () => {
    setExpandedWidget(null);
  };

  // ESC 키로 위젯 닫기
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && expandedWidget) {
        collapseWidget();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedWidget]);

  // 확대 모드일 때 body 스크롤 방지
  useEffect(() => {
    if (expandedWidget) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [expandedWidget]);

  return {
    expandedWidget,
    expandWidget,
    collapseWidget,
    isExpanded: (widgetId: string) => expandedWidget === widgetId
  };
};