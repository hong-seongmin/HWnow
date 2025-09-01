import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ToastType } from '../components/common/Toast';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, duration?: number) => string;
  showSuccess: (message: string, duration?: number) => string;
  showError: (message: string, duration?: number) => string;
  showWarning: (message: string, duration?: number) => string;
  showInfo: (message: string, duration?: number) => string;
  removeToast: (id: string) => void;
  // GPU 프로세스 전용 토스트 메서드들
  showProcessSuccess: (processName: string, action: string, pid?: number, duration?: number) => string;
  showProcessError: (processName: string, action: string, error: string, pid?: number, duration?: number) => string;
  showBulkProcessResult: (successCount: number, failureCount: number, action: string, errors?: string[], duration?: number) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = Date.now().toString();
    const newToast: ToastItem = { id, message, type, duration };
    
    setToasts((prevToasts) => [...prevToasts, newToast]);
    
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback((message: string, duration?: number) => {
    return showToast(message, 'success', duration);
  }, [showToast]);

  const showError = useCallback((message: string, duration?: number) => {
    return showToast(message, 'error', duration);
  }, [showToast]);

  const showWarning = useCallback((message: string, duration?: number) => {
    return showToast(message, 'warning', duration);
  }, [showToast]);

  const showInfo = useCallback((message: string, duration?: number) => {
    return showToast(message, 'info', duration);
  }, [showToast]);

  // GPU 프로세스 전용 토스트 메서드들
  const showProcessSuccess = useCallback((processName: string, action: string, pid?: number, duration: number = 4000) => {
    const pidText = pid ? ` (PID: ${pid})` : '';
    const actionText = getActionText(action);
    const message = `프로세스 "${processName}"${pidText}이(가) 성공적으로 ${actionText}되었습니다.`;
    return showToast(message, 'success', duration);
  }, [showToast]);

  const showProcessError = useCallback((processName: string, action: string, error: string, pid?: number, duration: number = 5000) => {
    const pidText = pid ? ` (PID: ${pid})` : '';
    const actionText = getActionText(action);
    const message = `프로세스 "${processName}"${pidText} ${actionText} 실패: ${error}`;
    return showToast(message, 'error', duration);
  }, [showToast]);

  const showBulkProcessResult = useCallback((successCount: number, failureCount: number, action: string, errors?: string[], duration: number = 6000) => {
    const actionText = getActionText(action);
    
    if (successCount > 0 && failureCount === 0) {
      // 모든 프로세스 성공
      const message = `${successCount}개 프로세스가 성공적으로 ${actionText}되었습니다.`;
      return showToast(message, 'success', duration);
    } else if (successCount === 0 && failureCount > 0) {
      // 모든 프로세스 실패
      const errorDetails = errors && errors.length > 0 ? `\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n...외 ${errors.length - 3}개` : ''}` : '';
      const message = `프로세스 ${actionText}에 실패했습니다 (${failureCount}개):${errorDetails}`;
      return showToast(message, 'error', duration);
    } else {
      // 일부 성공, 일부 실패
      const errorDetails = errors && errors.length > 0 ? `\n실패: ${errors.slice(0, 2).join(', ')}${errors.length > 2 ? `...외 ${errors.length - 2}개` : ''}` : '';
      const message = `프로세스 ${actionText}: ${successCount}개 성공, ${failureCount}개 실패${errorDetails}`;
      return showToast(message, 'warning', duration);
    }
  }, [showToast]);

  // 액션 텍스트 변환 함수
  const getActionText = (action: string): string => {
    switch (action) {
      case 'kill': return '종료';
      case 'suspend': return '일시정지';
      case 'resume': return '재개';
      case 'priority': return '우선순위 변경';
      default: return action;
    }
  };

  const value: ToastContextType = {
    toasts,
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    removeToast,
    showProcessSuccess,
    showProcessError,
    showBulkProcessResult,
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}; 