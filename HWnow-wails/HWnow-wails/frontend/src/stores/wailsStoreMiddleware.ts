// Wails Store Middleware - Simplified for Production Build
// Provides basic Wails environment detection for Zustand stores

import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

// Middleware configuration
interface WailsMiddlewareConfig {
  enableOfflineSupport?: boolean;
  autoSaveInterval?: number;
  performanceMonitoring?: boolean;
  maxRetries?: number;
  storeName: string;
}

// Store state interface for Wails integration - using runtime object
export const WailsStoreState = {
  // This is a runtime object that can be imported
  // Used for type checking in TypeScript
  _metadata: {
    isWailsEnvironment: false,
    isOnline: true,
    lastSyncTime: 0
  }
};

// Type definition for stores
export type WailsStoreStateType = {
  _wailsMetadata?: {
    isWailsEnvironment: boolean;
    isOnline: boolean;
    lastSyncTime: number;
  };
}

// Type identifier for the middleware
type WailsMiddleware = [
  'wails-middleware',
  unknown
];

// Wails environment detection
const detectWailsEnvironment = (): boolean => {
  return typeof window !== 'undefined' && 
         typeof (window as any).go !== 'undefined' && 
         typeof (window as any).go.main !== 'undefined';
};

// Online status detection
const detectOnlineStatus = (): boolean => {
  if (typeof navigator !== 'undefined') {
    return navigator.onLine;
  }
  return true; // Assume online by default
};

// Main middleware function
export const wailsMiddleware = <T extends WailsStoreStateType>(
  f: StateCreator<T, [], [], T>,
  config: WailsMiddlewareConfig
): StateCreator<T, [], WailsMiddleware, T> => {
  
  const { storeName = 'default' } = config;
  const isWailsEnvironment = detectWailsEnvironment();
  
  return (set, get, store) => {
    
    // Enhanced set function with basic Wails integration
    const enhancedSet = (updater: any, replace?: any) => {
      if (typeof updater === 'function') {
        const currentState = get();
        const newState = updater(currentState);
        
        // Add basic Wails metadata
        const stateWithMetadata = {
          ...newState,
          _wailsMetadata: {
            isWailsEnvironment,
            isOnline: detectOnlineStatus(),
            lastSyncTime: Date.now(),
          }
        } as T;
        
        set(stateWithMetadata, replace);
      } else {
        // Add Wails metadata to direct state updates
        const stateWithMetadata = {
          ...updater,
          _wailsMetadata: {
            isWailsEnvironment,
            isOnline: detectOnlineStatus(),
            lastSyncTime: Date.now(),
          }
        } as T;
        
        set(stateWithMetadata, replace);
      }
    };
    
    // Create the initial state
    const initialState = f(enhancedSet as any, get, store);
    
    // Add metadata to initial state
    const stateWithMetadata = {
      ...initialState,
      _wailsMetadata: {
        isWailsEnvironment,
        isOnline: detectOnlineStatus(),
        lastSyncTime: Date.now(),
      }
    } as T;
    
    return stateWithMetadata;
  };
};

// Default configuration
export const createWailsMiddleware = (config: Partial<WailsMiddlewareConfig> = {}) => {
  const defaultConfig: WailsMiddlewareConfig = {
    enableOfflineSupport: true,
    autoSaveInterval: 30000,
    performanceMonitoring: false,
    maxRetries: 3,
    storeName: 'default',
    ...config
  };
  
  return <T extends WailsStoreStateType>(f: StateCreator<T, [], [], T>) => 
    wailsMiddleware(f, defaultConfig);
};

// Export default middleware with sensible defaults
export default createWailsMiddleware();