import { useSystemResourceStore } from '../stores/systemResourceStore';
import type { WidgetType } from '../stores/types';

let socket: WebSocket | null = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectDelay = 1000; // 시작 지연시간 (ms)
let heartbeatInterval: number | null = null;
let connectionTimeoutId: number | null = null;

// GPU process batching
let gpuProcessBatch: Array<{
  pid: number;
  name: string;
  gpu_usage: number;
  gpu_memory: number;
  type: string;
  command: string;
  status: string;
  priority?: string;
}> = [];
let gpuProcessBatchTimeout: number | null = null;

// 메시지 큐 (연결이 끊어진 동안 메시지 저장)
let messageQueue: string[] = [];
let isConnected = false;

// 연결 상태 변경 콜백들
type ConnectionStatusCallback = (connected: boolean) => void;
const connectionStatusCallbacks = new Set<ConnectionStatusCallback>();

const ALL_WIDGET_TYPES: WidgetType[] = ['cpu', 'ram', 'disk_read', 'disk_write', 'net_sent', 'net_recv', 'gpu', 'gpu_process', 'system_uptime', 'process_monitor', 'battery', 'disk_space', 'network_status', 'memory_detail', 'system_log'];

// Additional metric types that need special handling
const ADDITIONAL_METRIC_TYPES = [
  'system_uptime', 'disk_total', 'disk_used', 'disk_free', 'disk_usage_percent',
  'memory_physical', 'memory_virtual', 'memory_swap',
  'battery_percent', 'battery_plugged',
  'gpu_usage', 'gpu_memory_used', 'gpu_memory_total', 'gpu_temperature', 'gpu_power'
];

const isValidWidgetType = (type: any): type is WidgetType => {
  return ALL_WIDGET_TYPES.includes(type);
}

// 연결 상태 변경 알림
const notifyConnectionStatus = (connected: boolean) => {
  isConnected = connected;
  connectionStatusCallbacks.forEach(callback => callback(connected));
};

// GPU 프로세스 배치 처리 (개선된 버전)
const processGPUProcessBatch = () => {
  const { setGPUProcesses } = useSystemResourceStore.getState();
  
  // 빈 슬롯 제거 및 유효성 검사
  const validProcesses = gpuProcessBatch.filter(process => 
    process && 
    typeof process.pid === 'number' && 
    process.name && 
    typeof process.gpu_usage === 'number' &&
    typeof process.gpu_memory === 'number'
  );
  
  if (validProcesses.length > 0) {
    setGPUProcesses([...validProcesses]);
  }
  
  // 배치 초기화
  gpuProcessBatch = [];
  if (gpuProcessBatchTimeout) {
    clearTimeout(gpuProcessBatchTimeout);
    gpuProcessBatchTimeout = null;
  }
};

// 하트비트 전송
const sendHeartbeat = () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
  }
};

// 메시지 큐 처리
const processMessageQueue = () => {
  if (!isConnected || messageQueue.length === 0) return;
  
  while (messageQueue.length > 0 && socket?.readyState === WebSocket.OPEN) {
    const message = messageQueue.shift();
    if (message) {
      socket.send(message);
    }
  }
};

// 메시지 검증
const validateMessage = (message: any): boolean => {
  return message && 
         typeof message === 'object' && 
         typeof message.type === 'string' &&
         message.data !== undefined;
};

const connect = () => {
  const wsProtocol = window.location.protocol === 'https' ? 'wss' : 'ws';
  const wsUrl = `${wsProtocol}://${window.location.host}/ws`;

  
  // 이전 타이머들 정리
  if (connectionTimeoutId) {
    clearTimeout(connectionTimeoutId);
    connectionTimeoutId = null;
  }
  
  socket = new WebSocket(wsUrl);

  // 연결 타임아웃 설정
  connectionTimeoutId = setTimeout(() => {
    if (socket && socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }, 10000); // 10초 타임아웃

  socket.onopen = () => {
    reconnectAttempts = 0;
    reconnectDelay = 1000;
    notifyConnectionStatus(true);
    
    if (connectionTimeoutId) {
      clearTimeout(connectionTimeoutId);
      connectionTimeoutId = null;
    }
    
    // 하트비트 시작
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    heartbeatInterval = setInterval(sendHeartbeat, 30000); // 30초마다 핑
    
    // 대기중인 메시지 처리
    processMessageQueue();
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      // 메시지 유효성 검사
      if (!validateMessage(message)) {
        console.warn('Invalid WebSocket message received:', message);
        return;
      }
      
      // 하트비트 응답 처리
      if (message.type === 'pong') {
        return;
      }
      
      const { setData } = useSystemResourceStore.getState();

      // Debug logging for GPU data specifically
      if (message.type.startsWith('gpu_')) {
        console.log(`[WebSocket GPU Debug] Received ${message.type}:`, message.data?.value, message.data?.info);
      }

      // Debug logging for new metrics (필터링된 로깅)
      if (message.type === 'system_uptime' || message.type.startsWith('disk_') || 
          message.type.startsWith('memory_') || message.type.startsWith('network_') || 
          message.type.startsWith('process_') || message.type.startsWith('battery_') ||
          message.type.startsWith('gpu_')) {
        // GPU 프로세스 메시지는 너무 많으므로 별도 처리
        if (!message.type.startsWith('gpu_process_')) {
          console.log(`[WebSocket Metric Debug] ${message.type}:`, {
            value: message.data?.value,
            info: message.data?.info,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      // Handle CPU info
      if (message.type === 'cpu_info' && typeof message.data?.value === 'number' && message.data?.info) {
        setData(message.type, message.data.value, message.data.info);
      }
      
      // Handle GPU info
      else if (message.type === 'gpu_info' && message.data?.info) {
        setData(message.type, message.data.value || 1.0, message.data.info);
      }
      
      // Handle CPU core data, additional metrics, network status, or process data
      else if ((isValidWidgetType(message.type) || 
           message.type.startsWith('cpu_core_') ||
           ADDITIONAL_METRIC_TYPES.includes(message.type) ||
           message.type.startsWith('network_') ||
           message.type.startsWith('process_') ||
           message.type.startsWith('gpu_process_')) && 
          typeof message.data?.value === 'number') {
        // Handle network status with IP info
        if (message.type.startsWith('network_') && message.data?.info) {
          setData(message.type, message.data.value, message.data.info);
        }
        // Handle process data with process info
        else if (message.type.startsWith('process_') && message.data?.info) {
          setData(message.type, message.data.value, message.data.info);
        }
        // Handle GPU process data with process info - use enhanced batching
        else if (message.type.startsWith('gpu_process_') && message.data?.info) {
          try {
            const processIndex = parseInt(message.type.replace('gpu_process_', ''));
            
            // 인덱스 유효성 검사
            if (isNaN(processIndex) || processIndex < 0 || processIndex > 100) {
              console.warn(`Invalid GPU process index: ${processIndex}`);
              return;
            }
            
            // 데이터 파싱 (priority 지원 추가)
            const infoParts = message.data.info.split('|');
            if (infoParts.length < 6) {
              console.warn(`Invalid GPU process info format: ${message.data.info}`);
              return;
            }
            
            const [name, pid, gpu_memory, processType, command, status, priority] = infoParts;
            
            // Clear batch if this is the first process (index 0)
            if (processIndex === 0) {
              gpuProcessBatch = [];
              if (gpuProcessBatchTimeout) {
                clearTimeout(gpuProcessBatchTimeout);
                gpuProcessBatchTimeout = null;
              }
            }
            
            // 데이터 검증
            const pidNumber = parseInt(pid);
            const memoryNumber = parseFloat(gpu_memory);
            const usageNumber = message.data.value;
            
            if (isNaN(pidNumber) || isNaN(memoryNumber) || isNaN(usageNumber)) {
              console.warn(`Invalid GPU process data: pid=${pid}, memory=${gpu_memory}, usage=${usageNumber}`);
              return;
            }
            
            // Add process to batch with enhanced data
            gpuProcessBatch[processIndex] = {
              pid: pidNumber,
              name: name?.trim() || 'Unknown',
              gpu_usage: Math.max(0, Math.min(100, usageNumber)), // 0-100 범위로 제한
              gpu_memory: Math.max(0, memoryNumber),
              type: processType?.trim() || 'unknown',
              command: command?.trim() || '',
              status: status?.trim() || 'unknown',
              priority: priority?.trim() || undefined
            };
            
            // Set a timeout to process the batch (adaptive timeout)
            const timeoutDelay = processIndex === 0 ? 200 : 100; // 첫 번째 프로세스는 더 긴 시간 대기
            gpuProcessBatchTimeout = setTimeout(processGPUProcessBatch, timeoutDelay);
            
          } catch (error) {
            console.error('Error processing GPU process data:', error, message);
          }
        }
        // Handle regular metrics
        else {
          setData(message.type, message.data.value);
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error, {
        eventData: event.data,
        messageLength: event.data?.length
      });
    }
  };

  socket.onclose = (_event) => {
    
    notifyConnectionStatus(false);
    
    // 하트비트 정리
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    
    if (connectionTimeoutId) {
      clearTimeout(connectionTimeoutId);
      connectionTimeoutId = null;
    }
    
    // 재연결 로직 (exponential backoff)
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = Math.min(reconnectDelay * Math.pow(2, reconnectAttempts - 1), 30000); // 최대 30초
      
      setTimeout(() => {
        if (!isConnected) { // 다른 곳에서 이미 연결되지 않은 경우에만 재연결
          connect();
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached. WebSocket connection failed.');
    }
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    notifyConnectionStatus(false);
    
    // 소켓이 여전히 열려있으면 닫기
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
  };
};

// 공개 API 함수들

export const initWebSocket = () => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    connect();
  }
};

// 연결 상태 확인
export const isWebSocketConnected = (): boolean => {
  return isConnected && socket?.readyState === WebSocket.OPEN;
};

// 연결 상태 변경 콜백 등록
export const onConnectionStatusChange = (callback: ConnectionStatusCallback) => {
  connectionStatusCallbacks.add(callback);
  
  // 현재 상태를 즉시 전달
  callback(isConnected);
  
  // 콜백 제거 함수 반환
  return () => {
    connectionStatusCallbacks.delete(callback);
  };
};

// 메시지 전송 (큐 지원)
export const sendMessage = (message: object): boolean => {
  const messageString = JSON.stringify(message);
  
  if (isConnected && socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(messageString);
      return true;
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
      messageQueue.push(messageString);
      return false;
    }
  } else {
    // 연결되지 않은 경우 큐에 추가
    messageQueue.push(messageString);
    return false;
  }
};

// 연결 강제 재시작
export const reconnectWebSocket = () => {
  reconnectAttempts = 0;
  
  if (socket) {
    socket.close();
  }
  
  setTimeout(connect, 1000);
};

// GPU 프로세스 배치 강제 처리
export const flushGPUProcessBatch = () => {
  if (gpuProcessBatch.length > 0) {
    processGPUProcessBatch();
  }
};

// WebSocket 상태 정보 조회
export const getWebSocketStatus = () => {
  return {
    connected: isConnected,
    readyState: socket?.readyState,
    reconnectAttempts,
    maxReconnectAttempts,
    queuedMessages: messageQueue.length,
    batchedProcesses: gpuProcessBatch.length
  };
};

// 정리 함수 (컴포넌트 언마운트 시 호출)
export const cleanup = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  
  if (connectionTimeoutId) {
    clearTimeout(connectionTimeoutId);
    connectionTimeoutId = null;
  }
  
  if (gpuProcessBatchTimeout) {
    clearTimeout(gpuProcessBatchTimeout);
    gpuProcessBatchTimeout = null;
  }
  
  connectionStatusCallbacks.clear();
  messageQueue = [];
  gpuProcessBatch = [];
  
  if (socket) {
    socket.close();
    socket = null;
  }
}; 