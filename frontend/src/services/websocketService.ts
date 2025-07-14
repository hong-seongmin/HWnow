import { useSystemResourceStore } from '../stores/systemResourceStore';
import type { WidgetType } from '../stores/types';

let socket: WebSocket | null = null;

const ALL_WIDGET_TYPES: WidgetType[] = ['cpu', 'ram', 'disk_read', 'disk_write', 'net_sent', 'net_recv'];

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

      // Debug logging for all messages temporarily
      if (message.type === 'cpu_info' || message.type.startsWith('cpu_core_')) {
        console.log('WebSocket message:', message);
      }

      // Handle CPU info
      if (message.type === 'cpu_info' && typeof message.data?.value === 'number' && message.data?.info) {
        setData(message.type, message.data.value, message.data.info);
        console.log('Received CPU info:', message.data.info, 'Cores:', message.data.value);
      }
      
      // Handle CPU core data or regular widget types
      else if ((isValidWidgetType(message.type) || 
           message.type.startsWith('cpu_core_')) && 
          typeof message.data?.value === 'number') {
        setData(message.type, message.data.value);
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