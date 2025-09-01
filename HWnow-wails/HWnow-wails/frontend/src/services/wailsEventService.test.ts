// Wails Event Service Tests
// TDD implementation for real-time monitoring event system

import { WailsEventService, wailsEventService } from './wailsEventService';
import { wailsApiService } from './wailsApiService';
import { useSystemResourceStore } from '../stores/systemResourceStore';

// Mock dependencies
jest.mock('./wailsApiService');
jest.mock('../stores/systemResourceStore');

// Mock implementations
const mockWailsApiService = wailsApiService as jest.Mocked<typeof wailsApiService>;
const mockUseSystemResourceStore = useSystemResourceStore as jest.MockedFunction<typeof useSystemResourceStore>;

// Mock store state
const mockStoreState = {
  data: {
    cpu: [],
    ram: [],
    gpu_processes: [],
    // ... other properties
  },
  setData: jest.fn(),
  setGPUProcesses: jest.fn(),
  clearGPUProcesses: jest.fn(),
  maxDataPoints: 200,
};

describe('WailsEventService', () => {
  let eventService: WailsEventService;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    // Setup mock store
    mockUseSystemResourceStore.mockReturnValue({
      ...mockStoreState,
      getState: () => mockStoreState,
    } as any);
    
    // Setup default API responses
    mockWailsApiService.startMonitoring.mockResolvedValue({ 
      success: true, 
      message: 'Monitoring started' 
    });
    mockWailsApiService.stopMonitoring.mockResolvedValue({ 
      success: true, 
      message: 'Monitoring stopped' 
    });
    mockWailsApiService.getSystemInfo.mockResolvedValue({
      platform: 'windows',
      cpu_cores: 8,
      total_memory: 16384,
      boot_time: '2025-01-01T00:00:00Z'
    });
    mockWailsApiService.getRealTimeMetrics.mockResolvedValue({
      cpu_usage: 45.5,
      memory_usage: 60.2,
      disk_usage: {
        total: 1000000,
        used: 500000,
        free: 500000,
        usedPercent: 50.0
      },
      network_io: [{
        name: 'Ethernet',
        status: 1,
        ipAddress: '192.168.1.100',
        bytesRecv: 1024,
        bytesSent: 2048
      }],
      timestamp: '2025-01-01T12:00:00Z'
    });
    mockWailsApiService.getGPUInfo.mockResolvedValue({
      name: 'NVIDIA RTX 4080',
      usage: 75.3,
      memory_used: 8192,
      memory_total: 12288,
      temperature: 68
    });
    mockWailsApiService.getGPUProcesses.mockResolvedValue([
      {
        pid: 1234,
        name: 'chrome.exe',
        memory_usage: 512,
        gpu_usage: 15.5
      },
      {
        pid: 5678,
        name: 'game.exe',
        memory_usage: 2048,
        gpu_usage: 45.2
      }
    ]);
    mockWailsApiService.getTopProcesses.mockResolvedValue([
      {
        pid: 1111,
        name: 'chrome.exe',
        cpu_usage: 25.5,
        memory_usage: 45.2,
        memory_mb: 1024
      },
      {
        pid: 2222,
        name: 'vscode.exe',
        cpu_usage: 15.3,
        memory_usage: 30.1,
        memory_mb: 512
      }
    ]);
    
    // Get fresh instance for each test
    eventService = WailsEventService.getInstance();
  });
  
  afterEach(() => {
    // Cleanup after each test
    eventService.cleanup();
    jest.useRealTimers();
  });
  
  describe('Service Initialization', () => {
    it('should create singleton instance', () => {
      const instance1 = WailsEventService.getInstance();
      const instance2 = WailsEventService.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(WailsEventService);
    });
    
    it('should initialize with default configuration', () => {
      expect(eventService.isConnected()).toBe(false);
      
      const status = eventService.getStatus();
      expect(status.connected).toBe(false);
      expect(status.activePollingJobs).toBe(0);
      expect(status.queuedMessages).toBe(0);
    });
  });
  
  describe('Monitoring Lifecycle', () => {
    it('should start monitoring successfully', async () => {
      const connectionCallback = jest.fn();
      eventService.onConnectionStatusChange(connectionCallback);
      
      await eventService.startMonitoring();
      
      expect(mockWailsApiService.startMonitoring).toHaveBeenCalled();
      expect(eventService.isConnected()).toBe(true);
      expect(connectionCallback).toHaveBeenCalledWith(true);
    });
    
    it('should stop monitoring successfully', async () => {
      const connectionCallback = jest.fn();
      eventService.onConnectionStatusChange(connectionCallback);
      
      // Start first
      await eventService.startMonitoring();
      expect(eventService.isConnected()).toBe(true);
      
      // Then stop
      await eventService.stopMonitoring();
      
      expect(mockWailsApiService.stopMonitoring).toHaveBeenCalled();
      expect(eventService.isConnected()).toBe(false);
      expect(connectionCallback).toHaveBeenCalledWith(false);
    });
    
    it('should handle start monitoring failure', async () => {
      mockWailsApiService.startMonitoring.mockResolvedValue({
        success: false,
        message: 'Failed to start monitoring'
      });
      
      await expect(eventService.startMonitoring()).rejects.toThrow('Failed to start monitoring');
      expect(eventService.isConnected()).toBe(false);
    });
    
    it('should not start monitoring twice', async () => {
      await eventService.startMonitoring();
      await eventService.startMonitoring(); // Second call
      
      expect(mockWailsApiService.startMonitoring).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('System Info Polling', () => {
    it('should poll system info and update store', async () => {
      await eventService.startMonitoring();
      
      // Fast-forward to trigger initial polling
      jest.advanceTimersByTime(100);
      await Promise.resolve(); // Allow promises to resolve
      
      expect(mockWailsApiService.getSystemInfo).toHaveBeenCalled();
      expect(mockStoreState.setData).toHaveBeenCalledWith(
        'cpu_info', 
        8, 
        'windows - 16384MB'
      );
    });
    
    it('should handle system info polling errors gracefully', async () => {
      mockWailsApiService.getSystemInfo.mockRejectedValue(new Error('System info failed'));
      
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      // Should not crash and continue running
      expect(eventService.isConnected()).toBe(true);
    });
  });
  
  describe('Real-Time Metrics Polling', () => {
    it('should poll real-time metrics and update store', async () => {
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      expect(mockWailsApiService.getRealTimeMetrics).toHaveBeenCalled();
      expect(mockStoreState.setData).toHaveBeenCalledWith('cpu', 45.5);
      expect(mockStoreState.setData).toHaveBeenCalledWith('ram', 60.2);
      expect(mockStoreState.setData).toHaveBeenCalledWith('disk_total', 1000000);
      expect(mockStoreState.setData).toHaveBeenCalledWith('disk_used', 500000);
      expect(mockStoreState.setData).toHaveBeenCalledWith('disk_free', 500000);
      expect(mockStoreState.setData).toHaveBeenCalledWith('disk_usage_percent', 50.0);
    });
    
    it('should update network interface data', async () => {
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      expect(mockStoreState.setData).toHaveBeenCalledWith('network_Ethernet_sent', 2048);
      expect(mockStoreState.setData).toHaveBeenCalledWith('network_Ethernet_recv', 1024);
      expect(mockStoreState.setData).toHaveBeenCalledWith('network_Ethernet_status', 1, '192.168.1.100');
    });
    
    it('should handle polling intervals correctly', async () => {
      await eventService.startMonitoring();
      
      // Should poll immediately
      expect(mockWailsApiService.getRealTimeMetrics).toHaveBeenCalledTimes(1);
      
      // Should poll again after interval
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      
      expect(mockWailsApiService.getRealTimeMetrics).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('GPU Info Polling', () => {
    it('should poll GPU info and update store', async () => {
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      expect(mockWailsApiService.getGPUInfo).toHaveBeenCalled();
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_usage', 75.3);
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_memory_used', 8192);
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_memory_total', 12288);
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_temperature', 68);
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_info', 1, 'NVIDIA RTX 4080');
    });
    
    it('should handle GPU not available gracefully', async () => {
      mockWailsApiService.getGPUInfo.mockRejectedValue(new Error('GPU not available'));
      
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      // Should set default values
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_usage', 0);
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_memory_used', 0);
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_memory_total', 0);
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_temperature', 0);
      expect(mockStoreState.setData).toHaveBeenCalledWith('gpu_info', 0, 'N/A');
    });
  });
  
  describe('GPU Process Polling', () => {
    it('should poll GPU processes and update store', async () => {
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      expect(mockWailsApiService.getGPUProcesses).toHaveBeenCalled();
      expect(mockStoreState.setGPUProcesses).toHaveBeenCalledWith([
        {
          pid: 1234,
          name: 'chrome.exe',
          gpu_usage: 15.5,
          gpu_memory: 512,
          type: 'gpu',
          command: 'chrome.exe',
          status: 'running'
        },
        {
          pid: 5678,
          name: 'game.exe',
          gpu_usage: 45.2,
          gpu_memory: 2048,
          type: 'gpu',
          command: 'game.exe',
          status: 'running'
        }
      ]);
    });
    
    it('should clear GPU processes on error', async () => {
      mockWailsApiService.getGPUProcesses.mockRejectedValue(new Error('GPU processes failed'));
      
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      expect(mockStoreState.clearGPUProcesses).toHaveBeenCalled();
    });
  });
  
  describe('Top Process Polling', () => {
    it('should poll top processes and update store', async () => {
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      expect(mockWailsApiService.getTopProcesses).toHaveBeenCalledWith(10);
      expect(mockStoreState.setData).toHaveBeenCalledWith('process_0', 25.5, 'chrome.exe|1111|1024');
      expect(mockStoreState.setData).toHaveBeenCalledWith('process_1', 15.3, 'vscode.exe|2222|512');
    });
  });
  
  describe('Connection Status Management', () => {
    it('should notify connection status callbacks', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      const unsubscribe1 = eventService.onConnectionStatusChange(callback1);
      const unsubscribe2 = eventService.onConnectionStatusChange(callback2);
      
      // Should immediately call with current status
      expect(callback1).toHaveBeenCalledWith(false);
      expect(callback2).toHaveBeenCalledWith(false);
      
      // Start monitoring
      await eventService.startMonitoring();
      
      expect(callback1).toHaveBeenCalledWith(true);
      expect(callback2).toHaveBeenCalledWith(true);
      
      // Unsubscribe one callback
      unsubscribe1();
      
      // Stop monitoring
      await eventService.stopMonitoring();
      
      expect(callback2).toHaveBeenCalledWith(false);
      expect(callback1).toHaveBeenCalledTimes(2); // Should not be called after unsubscribe
    });
  });
  
  describe('Performance Tracking', () => {
    it('should track performance metrics', async () => {
      await eventService.startMonitoring();
      
      // Execute some polling
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      const status = eventService.getStatus();
      expect(status.performanceMetrics.successCount).toBeGreaterThan(0);
      expect(status.performanceMetrics.averageResponseTime).toBeGreaterThanOrEqual(0);
    });
    
    it('should track error metrics', async () => {
      // Make some API calls fail
      mockWailsApiService.getRealTimeMetrics.mockRejectedValue(new Error('API Error'));
      
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      const status = eventService.getStatus();
      expect(status.performanceMetrics.errorCount).toBeGreaterThan(0);
    });
  });
  
  describe('Configuration Management', () => {
    it('should update configuration and restart polling', async () => {
      await eventService.startMonitoring();
      
      // Update configuration
      eventService.updateConfig({
        pollingInterval: 5000,
        adaptivePolling: false
      });
      
      // Should restart polling with new interval
      jest.advanceTimersByTime(5100);
      await Promise.resolve();
      
      expect(mockWailsApiService.getRealTimeMetrics).toHaveBeenCalled();
    });
  });
  
  describe('Cleanup', () => {
    it('should cleanup all resources', async () => {
      const callback = jest.fn();
      eventService.onConnectionStatusChange(callback);
      
      await eventService.startMonitoring();
      
      eventService.cleanup();
      
      expect(eventService.isConnected()).toBe(false);
      
      const status = eventService.getStatus();
      expect(status.activePollingJobs).toBe(0);
    });
  });
  
  describe('Error Handling and Retry Logic', () => {
    it('should retry failed operations', async () => {
      // Make first call fail, second succeed
      mockWailsApiService.getRealTimeMetrics
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          cpu_usage: 50,
          memory_usage: 60,
          disk_usage: {
            total: 1000,
            used: 500,
            free: 500,
            usedPercent: 50
          },
          network_io: [],
          timestamp: '2025-01-01T12:00:00Z'
        });
      
      await eventService.startMonitoring();
      
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      // Should eventually succeed after retry
      expect(mockStoreState.setData).toHaveBeenCalledWith('cpu', 50);
    });
  });
  
  describe('Legacy API Compatibility', () => {
    it('should provide legacy WebSocket API compatibility', () => {
      // These should exist for backward compatibility
      expect(typeof require('./wailsEventService').initWebSocket).toBe('function');
      expect(typeof require('./wailsEventService').isWebSocketConnected).toBe('function');
      expect(typeof require('./wailsEventService').onConnectionStatusChange).toBe('function');
      expect(typeof require('./wailsEventService').reconnectWebSocket).toBe('function');
      expect(typeof require('./wailsEventService').getWebSocketStatus).toBe('function');
      expect(typeof require('./wailsEventService').cleanup).toBe('function');
    });
  });
});