import { useSystemResourceStore } from '../stores/systemResourceStore';
import type { WidgetType } from '../stores/types';

let socket: WebSocket | null = null;

const ALL_WIDGET_TYPES: WidgetType[] = ['cpu', 'cpu_temp', 'ram', 'disk_read', 'disk_write', 'net_sent', 'net_recv'];

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

      if ((isValidWidgetType(message.type) || message.type === 'cpu_temp') && typeof message.data?.value === 'number') {
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