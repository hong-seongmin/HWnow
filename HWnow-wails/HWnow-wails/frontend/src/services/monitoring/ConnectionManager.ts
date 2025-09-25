// Connection Management Service
import type { WidgetType } from '../../stores/types';

export type ConnectionStatusCallback = (connected: boolean) => void;

export interface ConnectionStatus {
  isConnected: boolean;
  lastConnected: number;
  reconnectAttempts: number;
  error?: string;
}

export class ConnectionManager {
  private static instance: ConnectionManager;
  private connectionStatusCallbacks = new Set<ConnectionStatusCallback>();
  private connectionStatus: ConnectionStatus;

  // Widget tracking for optimization
  private activeWidgets: Set<WidgetType> = new Set();
  private lastWidgetUpdate: number = 0;
  private widgetUpdateDebounceMs: number = 1000; // Debounce widget changes by 1 second

  // Message queue for when service is not available
  private messageQueue: Array<() => Promise<void>> = [];

  private constructor() {
    this.connectionStatus = {
      isConnected: false,
      lastConnected: 0,
      reconnectAttempts: 0
    };
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  public setConnected(connected: boolean, error?: string): void {
    const wasConnected = this.connectionStatus.isConnected;
    this.connectionStatus.isConnected = connected;

    if (connected) {
      this.connectionStatus.lastConnected = Date.now();
      this.connectionStatus.reconnectAttempts = 0;
      this.connectionStatus.error = undefined;

      // Process any queued messages
      this.processMessageQueue();
    } else {
      this.connectionStatus.error = error;
      this.connectionStatus.reconnectAttempts++;
    }

    // Notify callbacks only if status changed
    if (wasConnected !== connected) {
      this.notifyConnectionStatusChange(connected);
    }
  }

  public isConnected(): boolean {
    return this.connectionStatus.isConnected;
  }

  public getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  public onConnectionStatusChange(callback: ConnectionStatusCallback): () => void {
    this.connectionStatusCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.connectionStatusCallbacks.delete(callback);
    };
  }

  private notifyConnectionStatusChange(connected: boolean): void {
    this.connectionStatusCallbacks.forEach(callback => {
      try {
        callback(connected);
      } catch (error) {
        console.error('[Connection] Error in connection status callback:', error);
      }
    });
  }

  public updateActiveWidgets(widgets: Set<WidgetType>): void {
    const now = Date.now();

    // Debounce widget updates to prevent excessive polling changes
    if (now - this.lastWidgetUpdate < this.widgetUpdateDebounceMs) {
      return;
    }

    this.activeWidgets = new Set(widgets);
    this.lastWidgetUpdate = now;

    console.log(`[Connection] Updated active widgets: [${Array.from(widgets).join(', ')}]`);
  }

  public getActiveWidgets(): Set<WidgetType> {
    return new Set(this.activeWidgets);
  }

  public hasActiveWidget(widgetType: WidgetType): boolean {
    return this.activeWidgets.has(widgetType);
  }

  public getActiveWidgetCount(): number {
    return this.activeWidgets.size;
  }

  public addToMessageQueue(message: () => Promise<void>): void {
    this.messageQueue.push(message);

    // Limit queue size to prevent memory issues
    const maxQueueSize = 100;
    if (this.messageQueue.length > maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest message
    }
  }

  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    console.log(`[Connection] Processing ${this.messageQueue.length} queued messages`);

    // Process messages sequentially to avoid overwhelming the system
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        try {
          await message();
        } catch (error) {
          console.error('[Connection] Error processing queued message:', error);
        }
      }
    }
  }

  public clearMessageQueue(): void {
    this.messageQueue = [];
    console.log('[Connection] Message queue cleared');
  }

  public getQueueSize(): number {
    return this.messageQueue.length;
  }

  public getStatus(): any {
    return {
      connection: this.getConnectionStatus(),
      activeWidgets: Array.from(this.activeWidgets),
      queueSize: this.getQueueSize(),
      callbackCount: this.connectionStatusCallbacks.size
    };
  }

  public reset(): void {
    this.connectionStatus = {
      isConnected: false,
      lastConnected: 0,
      reconnectAttempts: 0
    };
    this.activeWidgets.clear();
    this.clearMessageQueue();
    this.connectionStatusCallbacks.clear();
    console.log('[Connection] Connection manager reset');
  }

  public async testConnection(): Promise<boolean> {
    try {
      // This would implement a connection test
      // For now, assume we're always connected in Wails context
      const isConnected = true; // await wailsApiService.ping();
      this.setConnected(isConnected);
      return isConnected;
    } catch (error) {
      console.error('[Connection] Connection test failed:', error);
      this.setConnected(false, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  public destroy(): void {
    this.reset();
    console.log('[Connection] Connection manager destroyed');
  }
}