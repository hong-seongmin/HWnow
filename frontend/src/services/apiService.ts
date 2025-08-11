import axios, { AxiosError } from 'axios';
import type { Layout } from 'react-grid-layout';
import type { WidgetState, PageState } from '../stores/types';

// API 클라이언트 설정
const apiClient = axios.create({
  baseURL: '/api', // Vite 프록시 설정을 통해 /api 요청을 백엔드로 전달
  timeout: 10000, // 10초 타임아웃
});

// 재시도 설정
interface RetryConfig {
  retries: number;
  retryDelay: number;
  retryCondition?: (error: AxiosError) => boolean;
}

const defaultRetryConfig: RetryConfig = {
  retries: 3,
  retryDelay: 1000,
  retryCondition: (error: AxiosError) => {
    // 네트워크 에러 또는 5xx 서버 에러만 재시도
    return !error.response || (error.response.status >= 500);
  }
};

// 재시도 로직이 포함된 API 요청 함수
async function apiRequestWithRetry<T>(
  requestFn: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: AxiosError | Error;
  
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error as AxiosError | Error;
      
      // 마지막 시도인 경우 에러 발생
      if (attempt === config.retries) {
        throw lastError;
      }
      
      // 재시도 조건 확인
      if (lastError instanceof AxiosError && config.retryCondition) {
        if (!config.retryCondition(lastError)) {
          throw lastError;
        }
      }
      
      // 재시도 전 지연
      if (config.retryDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, config.retryDelay * (attempt + 1)));
      }
    }
  }
  
  throw lastError!;
}

// API 에러 처리 함수
export function handleApiError(error: unknown, operation: string): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status || 0;
    const message = error.response?.data?.message || error.message;
    
    console.error(`API Error [${operation}]:`, {
      status,
      message,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase()
    });
    
    // 사용자 친화적 에러 메시지
    if (status === 0) {
      throw new Error('네트워크 연결을 확인해주세요.');
    } else if (status === 401) {
      throw new Error('인증이 필요합니다.');
    } else if (status === 403) {
      throw new Error('권한이 없습니다.');
    } else if (status === 404) {
      throw new Error('요청한 리소스를 찾을 수 없습니다.');
    } else if (status === 429) {
      throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
    } else if (status >= 500) {
      throw new Error('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } else {
      throw new Error(message || '알 수 없는 오류가 발생했습니다.');
    }
  } else {
    console.error(`Unexpected Error [${operation}]:`, error);
    throw new Error('예상치 못한 오류가 발생했습니다.');
  }
}

// 대시보드 레이아웃
export const getDashboardLayout = async (userId: string): Promise<Layout[]> => {
  try {
    return await apiRequestWithRetry(async () => {
      const response = await apiClient.get<Layout[]>(`/dashboard/layout?userId=${userId}`);
      return Array.isArray(response.data) ? response.data : [];
    });
  } catch (error) {
    console.error('Failed to get dashboard layout:', error);
    return [];
  }
};

export const saveDashboardLayout = async (userId: string, layout: Layout[]): Promise<void> => {
  try {
    await apiClient.post('/dashboard/layout', { userId, layout });
  } catch (error) {
    console.error('Failed to save dashboard layout:', error);
  }
};

// 위젯 상태
export const getWidgets = async (userId: string, pageId: string = 'main-page'): Promise<WidgetState[]> => {
  try {
    const response = await apiClient.get<WidgetState[]>(`/widgets?userId=${userId}&pageId=${pageId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to get widgets:', error);
    return [];
  }
};

export const saveWidgets = async (widgets: WidgetState[]): Promise<void> => {
  try {
    await apiClient.post('/widgets', widgets);
  } catch (error) {
    console.error('Failed to save widgets:', error);
  }
};

export const deleteWidget = async (userId: string, widgetId: string, pageId: string = 'main-page'): Promise<void> => {
  try {
    await apiClient.delete(`/widgets?userId=${userId}&widgetId=${widgetId}&pageId=${pageId}`);
  } catch (error) {
    console.error('Failed to delete widget:', error);
  }
};

// 페이지 관리
export const getPages = async (userId: string): Promise<PageState[]> => {
  try {
    const response = await apiClient.get<PageState[]>(`/pages?userId=${userId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to get pages:', error);
    return [];
  }
};

export const createPage = async (userId: string, pageId: string, pageName: string): Promise<void> => {
  try {
    await apiClient.post('/pages', { userId, pageId, pageName });
  } catch (error) {
    console.error('Failed to create page:', error);
    throw error;
  }
};

export const deletePage = async (userId: string, pageId: string): Promise<void> => {
  try {
    await apiClient.delete(`/pages?userId=${userId}&pageId=${pageId}`);
  } catch (error) {
    console.error('Failed to delete page:', error);
    throw error;
  }
};

export const updatePageName = async (userId: string, pageId: string, pageName: string): Promise<void> => {
  try {
    await apiClient.put('/pages/name', { userId, pageId, pageName });
  } catch (error) {
    console.error('Failed to update page name:', error);
    throw error;
  }
};

// GPU 프로세스 제어 API

export interface GPUProcessControlResponse {
  success: boolean;
  message: string;
  pid: number;
}

export interface GPUProcessControlError {
  error: string;
  status: number;
  pid: number;
}

/**
 * GPU 프로세스를 종료합니다
 * @param pid 종료할 프로세스의 PID
 * @returns 성공시 성공 메시지, 실패시 에러 발생
 */
export const killGPUProcess = async (pid: number): Promise<GPUProcessControlResponse> => {
  try {
    return await apiRequestWithRetry(async () => {
      const response = await apiClient.post<GPUProcessControlResponse>(`/gpu/process/${pid}/kill`);
      return response.data;
    }, {
      retries: 2, // GPU 프로세스 제어는 재시도 횟수를 줄임
      retryDelay: 500,
      retryCondition: (error) => {
        // 권한 에러나 프로세스 없음 에러는 재시도하지 않음
        const status = error.response?.status;
        return !status || (status >= 500 && status !== 503);
      }
    });
  } catch (error) {
    handleApiError(error, `Kill GPU Process ${pid}`);
  }
};

/**
 * GPU 프로세스를 일시정지합니다
 * @param pid 일시정지할 프로세스의 PID
 * @returns 성공시 성공 메시지, 실패시 에러 발생
 */
export const suspendGPUProcess = async (pid: number): Promise<GPUProcessControlResponse> => {
  try {
    return await apiRequestWithRetry(async () => {
      const response = await apiClient.post<GPUProcessControlResponse>(`/gpu/process/${pid}/suspend`);
      return response.data;
    }, {
      retries: 2,
      retryDelay: 500,
      retryCondition: (error) => {
        const status = error.response?.status;
        return !status || (status >= 500 && status !== 503);
      }
    });
  } catch (error) {
    handleApiError(error, `Suspend GPU Process ${pid}`);
  }
};

/**
 * 일시정지된 GPU 프로세스를 재개합니다
 * @param pid 재개할 프로세스의 PID
 * @returns 성공시 성공 메시지, 실패시 에러 발생
 */
export const resumeGPUProcess = async (pid: number): Promise<GPUProcessControlResponse> => {
  try {
    return await apiRequestWithRetry(async () => {
      const response = await apiClient.post<GPUProcessControlResponse>(`/gpu/process/${pid}/resume`);
      return response.data;
    }, {
      retries: 2,
      retryDelay: 500,
      retryCondition: (error) => {
        const status = error.response?.status;
        return !status || (status >= 500 && status !== 503);
      }
    });
  } catch (error) {
    handleApiError(error, `Resume GPU Process ${pid}`);
  }
};

/**
 * GPU 프로세스의 우선순위를 변경합니다
 * @param pid 대상 프로세스의 PID
 * @param priority 새로운 우선순위 (realtime, high, above_normal, normal, below_normal, low)
 * @returns 성공시 성공 메시지, 실패시 에러 발생
 */
export const setGPUProcessPriority = async (pid: number, priority: string): Promise<GPUProcessControlResponse> => {
  try {
    return await apiRequestWithRetry(async () => {
      const response = await apiClient.post<GPUProcessControlResponse>(`/gpu/process/${pid}/priority`, {
        priority
      });
      return response.data;
    }, {
      retries: 2,
      retryDelay: 500,
      retryCondition: (error) => {
        const status = error.response?.status;
        return !status || (status >= 500 && status !== 503);
      }
    });
  } catch (error) {
    handleApiError(error, `Set Priority for GPU Process ${pid}`);
  }
};

/**
 * 현재 시스템의 관리자 권한을 확인합니다
 * @returns 권한 정보
 */
export const checkPrivileges = async (): Promise<{ hasAdminPrivileges: boolean; platform: string; message: string }> => {
  try {
    return await apiRequestWithRetry(async () => {
      const response = await apiClient.get('/gpu/processes/privileges');
      return response.data;
    });
  } catch (error) {
    console.warn('Failed to check privileges:', error);
    return {
      hasAdminPrivileges: false,
      platform: 'unknown',
      message: '권한 확인에 실패했습니다.'
    };
  }
}; 