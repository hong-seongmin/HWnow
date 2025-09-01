// Wails Store Middleware Tests
// TDD implementation for Zustand store Wails integration

import { create } from 'zustand';
import {
  wailsMiddleware,
  detectWailsEnvironment,
  detectOnlineStatus,
  createWailsOperation,
  getStorePerformanceMetrics,
  resetStorePerformanceMetrics,
  getPendingOperations,
  clearPendingOperations,
  defaultWailsMiddlewareConfig,
  WailsMiddlewareConfig,
  StorePerformanceMetrics,
  WailsStoreState
} from './wailsStoreMiddleware';

// Mock dependencies
const mockWindow = {
  go: {
    main: {
      App: {
        GetSystemInfo: jest.fn()
      }
    }
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

const mockNavigator = {
  onLine: true
};

const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
};

// Test store interface
interface TestStore extends WailsStoreState {
  count: number;
  message: string;
  increment: () => void;
  setMessage: (message: string) => void;
  asyncOperation: () => Promise<void>;
  failingOperation: () => Promise<void>;
}

describe('Wails Store Middleware', () => {
  let originalWindow: any;
  let originalNavigator: any;
  let originalLocalStorage: any;
  
  beforeEach(() => {
    // Setup mocks
    originalWindow = global.window;
    originalNavigator = global.navigator;
    originalLocalStorage = global.localStorage;
    
    (global as any).window = mockWindow;
    (global as any).navigator = mockNavigator;
    (global as any).localStorage = mockLocalStorage;
    
    jest.clearAllMocks();
    
    // Reset performance metrics
    resetStorePerformanceMetrics('test-store');
    clearPendingOperations('test-store');
  });
  
  afterEach(() => {
    // Restore original objects
    global.window = originalWindow;
    global.navigator = originalNavigator;
    global.localStorage = originalLocalStorage;
  });
  
  describe('Environment Detection', () => {
    it('should detect Wails environment when window.go is available', () => {
      expect(detectWailsEnvironment()).toBe(true);
    });
    
    it('should not detect Wails environment when window.go is missing', () => {
      (global as any).window = {};
      expect(detectWailsEnvironment()).toBe(false);
    });
    
    it('should detect online status from navigator', () => {
      expect(detectOnlineStatus()).toBe(true);
      
      mockNavigator.onLine = false;
      expect(detectOnlineStatus()).toBe(false);
    });
    
    it('should always return true for online status in Wails environment', () => {
      mockNavigator.onLine = false;
      expect(detectOnlineStatus()).toBe(true); // Wails environment overrides
    });
  });
  
  describe('Store Creation with Middleware', () => {
    it('should create store with Wails metadata', () => {
      const useTestStore = create<TestStore>()(
        wailsMiddleware(
          (set, get) => ({
            count: 0,
            message: '',
            _wailsMetadata: {
              isWailsEnvironment: false,
              isOnline: true,
              lastSyncTime: 0,
              pendingOperations: [],
              performanceMetrics: {
                operationCount: 0,
                averageResponseTime: 0,
                errorCount: 0,
                lastOperation: '',
                lastOperationTime: 0
              }
            },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setMessage: (message) => set({ message }),
            asyncOperation: async () => {
              await new Promise(resolve => setTimeout(resolve, 10));
              set((state) => ({ count: state.count + 10 }));
            },
            failingOperation: async () => {
              throw new Error('Test error');
            }
          }),
          { ...defaultWailsMiddlewareConfig, storeName: 'test-store' }
        )
      );
      
      const store = useTestStore.getState();
      
      expect(store._wailsMetadata).toBeDefined();
      expect(store._wailsMetadata.isWailsEnvironment).toBe(true);
      expect(store._wailsMetadata.isOnline).toBe(true);
      expect(store._wailsMetadata.lastSyncTime).toBeGreaterThan(0);
    });
    
    it('should update Wails metadata on state changes', () => {
      const useTestStore = create<TestStore>()(
        wailsMiddleware(
          (set, get) => ({
            count: 0,
            message: '',
            _wailsMetadata: {
              isWailsEnvironment: false,
              isOnline: true,
              lastSyncTime: 0,
              pendingOperations: [],
              performanceMetrics: {
                operationCount: 0,
                averageResponseTime: 0,
                errorCount: 0,
                lastOperation: '',
                lastOperationTime: 0
              }
            },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setMessage: (message) => set({ message }),
            asyncOperation: async () => {},
            failingOperation: async () => {}
          }),
          { ...defaultWailsMiddlewareConfig, storeName: 'test-store' }
        )
      );
      
      const initialState = useTestStore.getState();
      const initialSyncTime = initialState._wailsMetadata.lastSyncTime;
      
      // Wait a bit to ensure time difference
      setTimeout(() => {
        useTestStore.getState().increment();
        
        const updatedState = useTestStore.getState();
        expect(updatedState.count).toBe(1);
        expect(updatedState._wailsMetadata.lastSyncTime).toBeGreaterThan(initialSyncTime);
      }, 1);
    });
  });
  
  describe('Wails Operations', () => {
    it('should execute operation successfully and track performance', async () => {
      const testOperation = jest.fn().mockResolvedValue('success');
      const config: WailsMiddlewareConfig = {
        ...defaultWailsMiddlewareConfig,
        storeName: 'test-store'
      };
      
      const wailsOperation = createWailsOperation(
        'testOp',
        testOperation,
        'test-store',
        config
      );
      
      const result = await wailsOperation();
      
      expect(result).toBe('success');
      expect(testOperation).toHaveBeenCalled();
      
      const metrics = getStorePerformanceMetrics('test-store');
      expect(metrics).toBeDefined();
      expect(metrics!.operationCount).toBe(1);
      expect(metrics!.lastOperation).toBe('testOp');
    });
    
    it('should retry failed operations', async () => {
      const testOperation = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success after retries');
      
      const config: WailsMiddlewareConfig = {
        ...defaultWailsMiddlewareConfig,
        storeName: 'test-store',
        maxRetries: 3
      };
      
      const wailsOperation = createWailsOperation(
        'retryOp',
        testOperation,
        'test-store',
        config
      );
      
      const result = await wailsOperation();
      
      expect(result).toBe('success after retries');
      expect(testOperation).toHaveBeenCalledTimes(3);
    });
    
    it('should fail after max retries and track error metrics', async () => {
      const testOperation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      const config: WailsMiddlewareConfig = {
        ...defaultWailsMiddlewareConfig,
        storeName: 'test-store',
        maxRetries: 2
      };
      
      const wailsOperation = createWailsOperation(
        'failOp',
        testOperation,
        'test-store',
        config
      );
      
      await expect(wailsOperation()).rejects.toThrow('Persistent failure');
      expect(testOperation).toHaveBeenCalledTimes(2);
      
      const metrics = getStorePerformanceMetrics('test-store');
      expect(metrics!.errorCount).toBe(1);
    });
  });
  
  describe('Offline Support', () => {
    beforeEach(() => {
      mockNavigator.onLine = false;
      (global as any).window = { addEventListener: jest.fn() }; // Remove go object
    });
    
    it('should queue operations when offline', async () => {
      const testOperation = jest.fn().mockResolvedValue('success');
      const config: WailsMiddlewareConfig = {
        ...defaultWailsMiddlewareConfig,
        storeName: 'test-store',
        enableOfflineSupport: true
      };
      
      const wailsOperation = createWailsOperation(
        'offlineOp',
        testOperation,
        'test-store',
        config
      );
      
      await expect(wailsOperation()).rejects.toThrow('queued for offline execution');
      expect(testOperation).not.toHaveBeenCalled();
      
      const pendingOps = getPendingOperations('test-store');
      expect(pendingOps.length).toBe(1);
      expect(pendingOps[0].operation).toBe('offlineOp');
    });
    
    it('should persist pending operations to localStorage', async () => {
      const testOperation = jest.fn().mockResolvedValue('success');
      const config: WailsMiddlewareConfig = {
        ...defaultWailsMiddlewareConfig,
        storeName: 'test-store',
        enableOfflineSupport: true
      };
      
      const wailsOperation = createWailsOperation(
        'persistOp',
        testOperation,
        'test-store',
        config
      );
      
      await expect(wailsOperation()).rejects.toThrow('queued for offline execution');
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'wails_pending_test-store',
        expect.stringContaining('persistOp')
      );
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should track operation performance metrics', async () => {
      const fastOperation = jest.fn().mockResolvedValue('fast');
      const config: WailsMiddlewareConfig = {
        ...defaultWailsMiddlewareConfig,
        storeName: 'perf-test',
        performanceMonitoring: true
      };
      
      const wailsOperation = createWailsOperation(
        'perfOp',
        fastOperation,
        'perf-test',
        config
      );
      
      await wailsOperation();
      await wailsOperation();
      
      const metrics = getStorePerformanceMetrics('perf-test');
      expect(metrics).toBeDefined();
      expect(metrics!.operationCount).toBe(2);
      expect(metrics!.averageResponseTime).toBeGreaterThan(0);
      expect(metrics!.lastOperation).toBe('perfOp');
    });
    
    it('should reset performance metrics', () => {
      // First set some metrics
      const metrics: StorePerformanceMetrics = {
        operationCount: 5,
        averageResponseTime: 100,
        errorCount: 1,
        lastOperation: 'test',
        lastOperationTime: Date.now()
      };
      
      resetStorePerformanceMetrics('reset-test');
      
      const retrievedMetrics = getStorePerformanceMetrics('reset-test');
      expect(retrievedMetrics).toBeNull();
    });
  });
  
  describe('Pending Operations Management', () => {
    it('should manage pending operations queue', () => {
      // Initially empty
      expect(getPendingOperations('queue-test')).toEqual([]);
      
      // Add some operations (simulated)
      const config: WailsMiddlewareConfig = {
        ...defaultWailsMiddlewareConfig,
        storeName: 'queue-test',
        enableOfflineSupport: true
      };
      
      // Clear operations
      clearPendingOperations('queue-test');
      expect(getPendingOperations('queue-test')).toEqual([]);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('wails_pending_queue-test');
    });
  });
  
  describe('Event Listeners', () => {
    it('should set up online/offline event listeners', () => {
      create<TestStore>()(
        wailsMiddleware(
          (set, get) => ({
            count: 0,
            message: '',
            _wailsMetadata: {
              isWailsEnvironment: false,
              isOnline: true,
              lastSyncTime: 0,
              pendingOperations: [],
              performanceMetrics: {
                operationCount: 0,
                averageResponseTime: 0,
                errorCount: 0,
                lastOperation: '',
                lastOperationTime: 0
              }
            },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setMessage: (message) => set({ message }),
            asyncOperation: async () => {},
            failingOperation: async () => {}
          }),
          { ...defaultWailsMiddlewareConfig, storeName: 'event-test' }
        )
      );
      
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    });
  });
  
  describe('Integration with Zustand', () => {
    it('should work seamlessly with Zustand store operations', () => {
      const useTestStore = create<TestStore>()(
        wailsMiddleware(
          (set, get) => ({
            count: 0,
            message: 'initial',
            _wailsMetadata: {
              isWailsEnvironment: false,
              isOnline: true,
              lastSyncTime: 0,
              pendingOperations: [],
              performanceMetrics: {
                operationCount: 0,
                averageResponseTime: 0,
                errorCount: 0,
                lastOperation: '',
                lastOperationTime: 0
              }
            },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setMessage: (message) => set({ message }),
            asyncOperation: async () => {
              await new Promise(resolve => setTimeout(resolve, 1));
              set((state) => ({ count: state.count + 5 }));
            },
            failingOperation: async () => {
              throw new Error('Test error');
            }
          }),
          { ...defaultWailsMiddlewareConfig, storeName: 'integration-test' }
        )
      );
      
      // Test synchronous operations
      const initialState = useTestStore.getState();
      expect(initialState.count).toBe(0);
      expect(initialState.message).toBe('initial');
      expect(initialState._wailsMetadata.isWailsEnvironment).toBe(true);
      
      // Test state mutations
      useTestStore.getState().increment();
      expect(useTestStore.getState().count).toBe(1);
      
      useTestStore.getState().setMessage('updated');
      expect(useTestStore.getState().message).toBe('updated');
      
      // Wails metadata should be updated
      expect(useTestStore.getState()._wailsMetadata.lastSyncTime).toBeGreaterThan(0);
    });
  });
});