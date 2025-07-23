import { create } from 'zustand';
import type { Widget } from './types';
import type { Layout } from 'react-grid-layout';

// Command 인터페이스 정의
export interface Command {
  execute(): void | Promise<void>;
  undo(): void;
  description: string;
  timestamp: number;
}

// Widget 관련 상태를 저장하는 인터페이스
export interface WidgetSnapshot {
  widgets: Widget[];
  layouts: Layout[];
}

// History Store 상태 인터페이스
interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  isUndoing: boolean;
  isRedoing: boolean;
  maxHistorySize: number;
  actions: {
    executeCommand: (command: Command) => Promise<void>;
    undo: () => boolean;
    redo: () => Promise<boolean>;
    clear: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    getUndoDescription: () => string | null;
    getRedoDescription: () => string | null;
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  isUndoing: false,
  isRedoing: false,
  maxHistorySize: 50,

  actions: {
    executeCommand: async (command: Command) => {
      const { undoStack, isUndoing, isRedoing, maxHistorySize } = get();
      
      try {
        // 명령 실행 (async 지원)
        await command.execute();
        
        // Undo나 Redo 중이 아닐 때만 히스토리 업데이트
        if (!isUndoing && !isRedoing) {
          // Undo 스택에 추가
          const newUndoStack = [...undoStack, command];
          
          // 최대 크기 제한
          if (newUndoStack.length > maxHistorySize) {
            newUndoStack.shift();
          }
          
          set({
            undoStack: newUndoStack,
            redoStack: [], // 새로운 명령 실행 시에만 Redo 스택 클리어
          });
        }
      } catch (error) {
        console.error('Command execution failed:', error);
        throw error;
      }
    },

    undo: () => {
      const { undoStack, redoStack } = get();
      
      if (undoStack.length === 0) {
        return false;
      }
      
      const command = undoStack[undoStack.length - 1];
      
      set({ isUndoing: true });
      
      try {
        // Undo 실행
        command.undo();
        
        // 스택 업데이트
        set({
          undoStack: undoStack.slice(0, -1),
          redoStack: [...redoStack, command],
          isUndoing: false,
        });
        
        return true;
      } catch (error) {
        console.error('Undo failed:', error);
        set({ isUndoing: false });
        return false;
      }
    },

    redo: async () => {
      const { undoStack, redoStack } = get();
      
      if (redoStack.length === 0) {
        return false;
      }
      
      const command = redoStack[redoStack.length - 1];
      
      set({ isRedoing: true });
      
      try {
        // Redo 실행 (async 지원)
        await command.execute();
        
        // 스택 업데이트
        set({
          undoStack: [...undoStack, command],
          redoStack: redoStack.slice(0, -1),
          isRedoing: false,
        });
        
        return true;
      } catch (error) {
        console.error('Redo failed:', error);
        set({ isRedoing: false });
        return false;
      }
    },

    clear: () => {
      set({
        undoStack: [],
        redoStack: [],
        isUndoing: false,
        isRedoing: false,
      });
    },

    canUndo: () => {
      return get().undoStack.length > 0;
    },

    canRedo: () => {
      return get().redoStack.length > 0;
    },

    getUndoDescription: () => {
      const { undoStack } = get();
      if (undoStack.length === 0) return null;
      return undoStack[undoStack.length - 1].description;
    },

    getRedoDescription: () => {
      const { redoStack } = get();
      if (redoStack.length === 0) return null;
      return redoStack[redoStack.length - 1].description;
    },
  },
}));

// 유틸리티 함수: 위젯 상태 스냅샷 생성
export const createWidgetSnapshot = (widgets: Widget[], layouts: Layout[]): WidgetSnapshot => ({
  widgets: JSON.parse(JSON.stringify(widgets)),
  layouts: JSON.parse(JSON.stringify(layouts)),
});