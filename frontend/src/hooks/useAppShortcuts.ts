import { useCallback } from 'react';
import { useGlobalKeyboard, createNumberShortcuts } from './useGlobalKeyboard';
import { useDashboardStore } from '../stores/dashboardStore';

interface UseAppShortcutsOptions {
  onOpenContextMenu?: (position: { x: number; y: number }) => void;
  onOpenWidgetSettings?: (widgetId: string) => void;
}

export const useAppShortcuts = (options: UseAppShortcutsOptions = {}) => {
  const { onOpenContextMenu } = options;
  
  const { 
    pages, 
    activePageIndex,
    actions: { 
      setActivePageIndex,
    } 
  } = useDashboardStore();

  // 페이지 이동 (Ctrl+1-9)
  const handlePageNavigation = useCallback((pageNum: number) => {
    if (pageNum >= 1 && pageNum <= pages.length) {
      setActivePageIndex(pageNum - 1);
    }
  }, [pages.length, setActivePageIndex]);

  // 다음/이전 페이지 (Tab/Shift+Tab)
  const handleNextPage = useCallback(() => {
    const nextIndex = activePageIndex < pages.length - 1 ? activePageIndex + 1 : 0;
    setActivePageIndex(nextIndex);
  }, [activePageIndex, pages.length, setActivePageIndex]);

  const handlePrevPage = useCallback(() => {
    const prevIndex = activePageIndex > 0 ? activePageIndex - 1 : pages.length - 1;
    setActivePageIndex(prevIndex);
  }, [activePageIndex, pages.length, setActivePageIndex]);

  // 위젯 추가 메뉴 열기 (W)
  const handleOpenWidgetMenu = useCallback(() => {
    if (onOpenContextMenu) {
      // 화면 중앙에 컨텍스트 메뉴 열기
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      onOpenContextMenu({ x: centerX, y: centerY });
    }
  }, [onOpenContextMenu]);

  // 선택된 위젯 삭제 (Delete)
  const handleDeleteWidgets = useCallback(() => {
    window.dispatchEvent(new CustomEvent('deleteSelectedWidgets'));
  }, []);

  // 위젯 설정 열기 (S)
  const handleOpenWidgetSettings = useCallback(() => {
    // TODO: 포커스된 위젯의 설정 열기 구현
    console.log('Widget settings shortcut triggered');
  }, []);

  // 위젯 선택/활성화 (Enter)
  const handleSelectWidget = useCallback(() => {
    // TODO: 포커스된 위젯 선택 구현
    console.log('Widget select shortcut triggered');
  }, []);

  // 위젯 전체화면 (Space)
  const handleToggleFullscreen = useCallback(() => {
    // TODO: 포커스된 위젯 전체화면 구현
    console.log('Widget fullscreen shortcut triggered');
  }, []);

  // 방향키 네비게이션
  const handleArrowNavigation = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    // TODO: 방향키 네비게이션 구현
    console.log('Arrow navigation:', direction);
  }, []);

  // 단축키 정의
  const shortcuts = [
    // 위젯 메뉴 열기
    {
      key: 'w',
      action: handleOpenWidgetMenu,
      description: 'Open widget menu (W)',
    },
    
    // 위젯 삭제
    {
      key: 'Delete',
      action: handleDeleteWidgets,
      description: 'Delete selected widgets (Delete)',
    },
    
    // 위젯 설정
    {
      key: 's',
      action: handleOpenWidgetSettings,
      description: 'Open widget settings (S)',
    },
    
    // 페이지 네비게이션
    {
      key: 'Tab',
      action: handleNextPage,
      description: 'Next page (Tab)',
    },
    {
      key: 'Tab',
      shift: true,
      action: handlePrevPage,
      description: 'Previous page (Shift+Tab)',
    },
    
    // 방향키 네비게이션
    {
      key: 'ArrowUp',
      action: () => handleArrowNavigation('up'),
      description: 'Move focus up (↑)',
    },
    {
      key: 'ArrowDown',
      action: () => handleArrowNavigation('down'),
      description: 'Move focus down (↓)',
    },
    {
      key: 'ArrowLeft',
      action: () => handleArrowNavigation('left'),
      description: 'Move focus left (←)',
    },
    {
      key: 'ArrowRight',
      action: () => handleArrowNavigation('right'),
      description: 'Move focus right (→)',
    },
    
    // 위젯 선택/활성화
    {
      key: 'Enter',
      action: handleSelectWidget,
      description: 'Select/activate widget (Enter)',
    },
    
    // 위젯 전체화면
    {
      key: ' ',
      action: handleToggleFullscreen,
      description: 'Toggle widget fullscreen (Space)',
    },
    
    // 모든 위젯 선택
    {
      key: 'a',
      ctrl: true,
      action: () => {
        console.log('Ctrl+A shortcut triggered!');
        window.dispatchEvent(new CustomEvent('selectAllWidgets'));
      },
      description: 'Select all widgets (Ctrl+A)',
    },
    
    // 페이지 빠른 이동 (Ctrl+1-9)
    ...createNumberShortcuts(1, 9, handlePageNavigation, true),
  ];

  // 전역 키보드 이벤트 등록
  useGlobalKeyboard(shortcuts, {
    enabled: true,
    ignoreInputs: true,
  });

  return {
    shortcuts: shortcuts.map(s => ({
      key: s.key,
      ctrl: s.ctrl,
      shift: s.shift,
      alt: s.alt,
      description: s.description,
    })),
  };
};