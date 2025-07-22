import { useEffect, useCallback } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: (event: KeyboardEvent) => void;
  description: string;
  preventDefault?: boolean;
}

interface UseGlobalKeyboardOptions {
  enabled?: boolean;
  ignoreInputs?: boolean;
}

export const useGlobalKeyboard = (
  shortcuts: KeyboardShortcut[],
  options: UseGlobalKeyboardOptions = {}
) => {
  const { enabled = true, ignoreInputs = true } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // 입력 필드에서는 단축키 무시 (옵션)
    if (ignoreInputs) {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        return;
      }
    }

    // 기존 키보드 이벤트와 충돌 방지
    // ESC 키는 기존 시스템에서 처리하도록 허용
    if (event.key === 'Escape') {
      return;
    }

    shortcuts.forEach((shortcut) => {
      const isCtrlPressed = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
      const isShiftPressed = shortcut.shift ? event.shiftKey : !event.shiftKey;
      const isAltPressed = shortcut.alt ? event.altKey : !event.altKey;
      
      if (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        isCtrlPressed &&
        isShiftPressed &&
        isAltPressed
      ) {
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }
        shortcut.action(event);
      }
    });
  }, [shortcuts, enabled, ignoreInputs]);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, enabled]);

  return shortcuts;
};

// 숫자 키 헬퍼 함수
export const createNumberShortcuts = (
  startNum: number,
  endNum: number,
  action: (num: number) => void,
  ctrl = false,
  shift = false
): KeyboardShortcut[] => {
  const shortcuts: KeyboardShortcut[] = [];
  
  for (let i = startNum; i <= endNum; i++) {
    shortcuts.push({
      key: i.toString(),
      ctrl,
      shift,
      action: () => action(i),
      description: `${ctrl ? 'Ctrl+' : ''}${shift ? 'Shift+' : ''}${i}`,
      preventDefault: true,
    });
  }
  
  return shortcuts;
};