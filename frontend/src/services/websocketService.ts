import { useSystemResourceStore } from '../stores/systemResourceStore';
import type { WidgetType } from '../stores/types';

let socket: WebSocket | null = null;

const ALL_WIDGET_TYPES: WidgetType[] = ['cpu', 'ram', 'disk_read', 'disk_write', 'net_sent', 'net_recv', 'gpu', 'system_uptime', 'process_monitor', 'battery', 'disk_space', 'network_status', 'memory_detail', 'system_log'];

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

const connect = () => {
  const wsProtocol = window.location.protocol === 'https' ? 'wss' : 'ws';
  const wsUrl = `${wsProtocol}://${window.location.host}/ws`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WebSocket connected');
  };

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      const { setData } = useSystemResourceStore.getState();

      // Debug logging for new metrics
      if (message.type === 'system_uptime' || message.type.startsWith('disk_') || 
          message.type.startsWith('memory_') || message.type.startsWith('network_') || 
          message.type.startsWith('process_') || message.type.startsWith('battery_') ||
          message.type.startsWith('gpu_')) {
        console.log('WebSocket message:', message.type, message.data);
      }

      // Handle CPU info
      if (message.type === 'cpu_info' && typeof message.data?.value === 'number' && message.data?.info) {
        setData(message.type, message.data.value, message.data.info);
        console.log('Received CPU info:', message.data.info, 'Cores:', message.data.value);
      }
      
      // Handle GPU info
      else if (message.type === 'gpu_info' && message.data?.info) {
        setData(message.type, message.data.value || 1.0, message.data.info);
        console.log('Received GPU info:', message.data.info);
      }
      
      // Handle CPU core data, additional metrics, network status, or process data
      else if ((isValidWidgetType(message.type) || 
           message.type.startsWith('cpu_core_') ||
           ADDITIONAL_METRIC_TYPES.includes(message.type) ||
           message.type.startsWith('network_') ||
           message.type.startsWith('process_')) && 
          typeof message.data?.value === 'number') {
        // Handle network status with IP info
        if (message.type.startsWith('network_') && message.data?.info) {
          setData(message.type, message.data.value, message.data.info);
        }
        // Handle process data with process info
        else if (message.type.startsWith('process_') && message.data?.info) {
          setData(message.type, message.data.value, message.data.info);
        }
        // Handle regular metrics
        else {
          setData(message.type, message.data.value);
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  socket.onclose = () => {
    console.log('WebSocket disconnected. Reconnecting...');
    setTimeout(connect, 3000); // 3초 후 재연결 시도
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    socket?.close();
  };
};

export const initWebSocket = () => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    connect();
  }
}; 