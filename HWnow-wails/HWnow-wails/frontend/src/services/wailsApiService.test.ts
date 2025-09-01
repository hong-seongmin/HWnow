/**
 * @jest-environment jsdom
 */

import { WailsApiService, wailsApiService } from './wailsApiService';
import type { WidgetState, PageState } from '../stores/types';

describe('WailsApiService', () => {
  let mockWailsRuntime: any;
  
  beforeEach(() => {
    // Mock Wails runtime
    mockWailsRuntime = {
      main: {
        App: {
          // System monitoring methods
          GetSystemInfo: jest.fn(),
          GetRealTimeMetrics: jest.fn(),
          GetGPUInfo: jest.fn(),
          GetGPUProcesses: jest.fn(),
          GetTopProcesses: jest.fn(),
          StartMonitoring: jest.fn(),
          StopMonitoring: jest.fn(),
          IsMonitoringRunning: jest.fn(),
          
          // GPU process control methods
          KillGPUProcess: jest.fn(),
          SuspendGPUProcess: jest.fn(),
          ResumeGPUProcess: jest.fn(),
          SetGPUProcessPriority: jest.fn(),
          ValidateGPUProcess: jest.fn(),
          
          // Database methods
          GetWidgets: jest.fn(),
          SaveWidgets: jest.fn(),
          DeleteWidget: jest.fn(),
          GetPages: jest.fn(),
          CreatePage: jest.fn(),
          DeletePage: jest.fn(),
          UpdatePageName: jest.fn(),
        }
      }
    };
    
    // Set up window.go mock
    Object.defineProperty(window, 'go', {
      value: mockWailsRuntime,
      writable: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create singleton instance', () => {
      const instance1 = WailsApiService.getInstance();
      const instance2 = WailsApiService.getInstance();
      expect(instance1).toBe(instance2);
      expect(instance1).toBe(wailsApiService);
    });

    it('should detect Wails availability', () => {
      expect(() => wailsApiService.getSystemInfo()).not.toThrow();
    });

    it('should throw error when Wails is not available', () => {
      // Remove Wails runtime
      delete (window as any).go;
      
      const newService = WailsApiService.getInstance();
      
      expect(async () => {
        await newService.getSystemInfo();
      }).rejects.toThrow('Wails runtime is not available');
    });
  });

  describe('System Monitoring Methods', () => {
    it('should call GetSystemInfo successfully', async () => {
      const mockResponse = {
        platform: 'windows',
        cpu_cores: 8,
        total_memory: 16384,
        boot_time: '2025-01-01T00:00:00Z'
      };
      
      mockWailsRuntime.main.App.GetSystemInfo.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.getSystemInfo();
      
      expect(mockWailsRuntime.main.App.GetSystemInfo).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should call GetRealTimeMetrics successfully', async () => {
      const mockResponse = {
        cpu_usage: 25.5,
        memory_usage: 60.2,
        disk_usage: {
          total: 1000000000,
          used: 600000000,
          free: 400000000,
          usedPercent: 60.0
        },
        network_io: [],
        timestamp: '2025-01-01T12:00:00Z'
      };
      
      mockWailsRuntime.main.App.GetRealTimeMetrics.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.getRealTimeMetrics();
      
      expect(mockWailsRuntime.main.App.GetRealTimeMetrics).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should call GetGPUInfo successfully', async () => {
      const mockResponse = {
        gpus: [{
          name: 'NVIDIA GeForce RTX 3080',
          usage: 45.2,
          memory_used: 4096,
          memory_total: 10240,
          temperature: 65.0,
          power_usage: 220.5
        }]
      };
      
      mockWailsRuntime.main.App.GetGPUInfo.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.getGPUInfo();
      
      expect(mockWailsRuntime.main.App.GetGPUInfo).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should call GetTopProcesses with default count', async () => {
      const mockResponse = {
        processes: [{
          pid: 1234,
          name: 'chrome.exe',
          cpu_usage: 25.5,
          memory_usage: 15.2,
          memory_mb: 512
        }]
      };
      
      mockWailsRuntime.main.App.GetTopProcesses.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.getTopProcesses();
      
      expect(mockWailsRuntime.main.App.GetTopProcesses).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockResponse);
    });

    it('should call GetTopProcesses with custom count', async () => {
      const mockResponse = { processes: [] };
      
      mockWailsRuntime.main.App.GetTopProcesses.mockResolvedValue(mockResponse);
      
      await wailsApiService.getTopProcesses(5);
      
      expect(mockWailsRuntime.main.App.GetTopProcesses).toHaveBeenCalledWith(5);
    });
  });

  describe('GPU Process Control Methods', () => {
    it('should kill GPU process successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Process killed successfully',
        pid: 1234,
        operation: 'kill'
      };
      
      mockWailsRuntime.main.App.KillGPUProcess.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.killGPUProcess(1234);
      
      expect(mockWailsRuntime.main.App.KillGPUProcess).toHaveBeenCalledWith(1234);
      expect(result).toEqual(mockResponse);
    });

    it('should suspend GPU process successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Process suspended successfully',
        pid: 1234,
        operation: 'suspend'
      };
      
      mockWailsRuntime.main.App.SuspendGPUProcess.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.suspendGPUProcess(1234);
      
      expect(mockWailsRuntime.main.App.SuspendGPUProcess).toHaveBeenCalledWith(1234);
      expect(result).toEqual(mockResponse);
    });

    it('should resume GPU process successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Process resumed successfully',
        pid: 1234,
        operation: 'resume'
      };
      
      mockWailsRuntime.main.App.ResumeGPUProcess.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.resumeGPUProcess(1234);
      
      expect(mockWailsRuntime.main.App.ResumeGPUProcess).toHaveBeenCalledWith(1234);
      expect(result).toEqual(mockResponse);
    });

    it('should set GPU process priority successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Priority set successfully',
        pid: 1234,
        operation: 'set_priority',
        priority: 'high'
      };
      
      mockWailsRuntime.main.App.SetGPUProcessPriority.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.setGPUProcessPriority(1234, 'high');
      
      expect(mockWailsRuntime.main.App.SetGPUProcessPriority).toHaveBeenCalledWith(1234, 'high');
      expect(result).toEqual(mockResponse);
    });

    it('should validate GPU process successfully', async () => {
      const mockResponse = {
        isValid: true,
        message: 'Process is valid',
        pid: 1234,
        processName: 'chrome.exe'
      };
      
      mockWailsRuntime.main.App.ValidateGPUProcess.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.validateGPUProcess(1234);
      
      expect(mockWailsRuntime.main.App.ValidateGPUProcess).toHaveBeenCalledWith(1234);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('Database Methods - Widgets', () => {
    it('should get widgets successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Widgets retrieved successfully',
        userID: 'user123',
        pageID: 'main-page',
        widgets: [{
          widgetId: 'widget1',
          widgetType: 'cpu',
          config: '{"refreshRate": 1000}',
          layout: '{"x": 0, "y": 0, "w": 2, "h": 2}'
        }]
      };
      
      mockWailsRuntime.main.App.GetWidgets.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.getWidgets('user123', 'main-page');
      
      expect(mockWailsRuntime.main.App.GetWidgets).toHaveBeenCalledWith('user123', 'main-page');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        userId: 'user123',
        pageId: 'main-page',
        widgetId: 'widget1',
        widgetType: 'cpu',
        config: { refreshRate: 1000 },
        layout: { x: 0, y: 0, w: 2, h: 2 }
      });
    });

    it('should handle get widgets failure gracefully', async () => {
      mockWailsRuntime.main.App.GetWidgets.mockRejectedValue(new Error('Database error'));
      
      const result = await wailsApiService.getWidgets('user123', 'main-page');
      
      expect(result).toEqual([]);
    });

    it('should save widgets successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Widgets saved successfully',
        userID: 'user123',
        pageID: 'main-page',
        widgets: [],
        count: 1
      };
      
      mockWailsRuntime.main.App.SaveWidgets.mockResolvedValue(mockResponse);
      
      const widgets: WidgetState[] = [{
        userId: 'user123',
        pageId: 'main-page',
        widgetId: 'widget1',
        widgetType: 'cpu',
        config: { refreshRate: 1000 },
        layout: { x: 0, y: 0, w: 2, h: 2 }
      }];
      
      await wailsApiService.saveWidgets(widgets);
      
      expect(mockWailsRuntime.main.App.SaveWidgets).toHaveBeenCalledWith(
        'user123',
        'main-page',
        [{
          widgetId: 'widget1',
          widgetType: 'cpu',
          config: '{"refreshRate":1000}',
          layout: '{"x":0,"y":0,"w":2,"h":2}'
        }]
      );
    });

    it('should delete widget successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Widget deleted successfully',
        userID: 'user123',
        pageID: 'main-page',
        widgets: [],
        widgetID: 'widget1'
      };
      
      mockWailsRuntime.main.App.DeleteWidget.mockResolvedValue(mockResponse);
      
      await wailsApiService.deleteWidget('user123', 'widget1', 'main-page');
      
      expect(mockWailsRuntime.main.App.DeleteWidget).toHaveBeenCalledWith('user123', 'main-page', 'widget1');
    });
  });

  describe('Database Methods - Pages', () => {
    it('should get pages successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Pages retrieved successfully',
        userID: 'user123',
        pages: [{
          pageId: 'main-page',
          pageName: 'Main Dashboard',
          pageOrder: 0
        }]
      };
      
      mockWailsRuntime.main.App.GetPages.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.getPages('user123');
      
      expect(mockWailsRuntime.main.App.GetPages).toHaveBeenCalledWith('user123');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        userId: 'user123',
        pageId: 'main-page',
        pageName: 'Main Dashboard',
        pageOrder: 0
      });
    });

    it('should create page successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Page created successfully',
        userID: 'user123',
        pageID: 'new-page',
        pageName: 'New Page',
        pages: []
      };
      
      mockWailsRuntime.main.App.CreatePage.mockResolvedValue(mockResponse);
      
      await wailsApiService.createPage('user123', 'new-page', 'New Page');
      
      expect(mockWailsRuntime.main.App.CreatePage).toHaveBeenCalledWith('user123', 'new-page', 'New Page');
    });

    it('should delete page successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Page deleted successfully',
        userID: 'user123',
        pageID: 'old-page',
        pages: []
      };
      
      mockWailsRuntime.main.App.DeletePage.mockResolvedValue(mockResponse);
      
      await wailsApiService.deletePage('user123', 'old-page');
      
      expect(mockWailsRuntime.main.App.DeletePage).toHaveBeenCalledWith('user123', 'old-page');
    });

    it('should update page name successfully', async () => {
      const mockResponse = {
        success: true,
        message: 'Page name updated successfully',
        userID: 'user123',
        pageID: 'page1',
        pageName: 'Updated Page',
        pages: []
      };
      
      mockWailsRuntime.main.App.UpdatePageName.mockResolvedValue(mockResponse);
      
      await wailsApiService.updatePageName('user123', 'page1', 'Updated Page');
      
      expect(mockWailsRuntime.main.App.UpdatePageName).toHaveBeenCalledWith('user123', 'page1', 'Updated Page');
    });
  });

  describe('Error Handling', () => {
    it('should handle system info API errors', async () => {
      const error = new Error('Backend error');
      mockWailsRuntime.main.App.GetSystemInfo.mockRejectedValue(error);
      
      await expect(wailsApiService.getSystemInfo()).rejects.toThrow('GetSystemInfo failed: Backend error');
    });

    it('should handle GPU process control errors', async () => {
      const error = new Error('Process not found');
      mockWailsRuntime.main.App.KillGPUProcess.mockRejectedValue(error);
      
      await expect(wailsApiService.killGPUProcess(1234)).rejects.toThrow('KillGPUProcess(1234) failed: Process not found');
    });

    it('should handle unsuccessful widget operations', async () => {
      const mockResponse = {
        success: false,
        message: 'Widget not found',
        userID: 'user123',
        pageID: 'main-page',
        widgets: []
      };
      
      mockWailsRuntime.main.App.GetWidgets.mockResolvedValue(mockResponse);
      
      const result = await wailsApiService.getWidgets('user123', 'main-page');
      expect(result).toEqual([]);
    });

    it('should handle unsuccessful page operations', async () => {
      const mockResponse = {
        success: false,
        message: 'Page creation failed',
        userID: 'user123',
        pageID: 'new-page',
        pageName: 'New Page',
        pages: []
      };
      
      mockWailsRuntime.main.App.CreatePage.mockResolvedValue(mockResponse);
      
      await expect(wailsApiService.createPage('user123', 'new-page', 'New Page'))
        .rejects.toThrow('Page creation failed');
    });
  });

  describe('Legacy Function Exports', () => {
    it('should export legacy functions correctly', () => {
      // Test that legacy function exports exist
      const { 
        getSystemInfo, getRealTimeMetrics, getGPUInfo, getGPUProcesses, getTopProcesses,
        killGPUProcess, suspendGPUProcess, resumeGPUProcess, setGPUProcessPriority,
        getWidgets, saveWidgets, deleteWidget, getPages, createPage, deletePage,
        getDashboardLayout, saveDashboardLayout, checkPrivileges
      } = require('./wailsApiService');
      
      expect(typeof getSystemInfo).toBe('function');
      expect(typeof getRealTimeMetrics).toBe('function');
      expect(typeof getGPUInfo).toBe('function');
      expect(typeof getGPUProcesses).toBe('function');
      expect(typeof getTopProcesses).toBe('function');
      expect(typeof killGPUProcess).toBe('function');
      expect(typeof suspendGPUProcess).toBe('function');
      expect(typeof resumeGPUProcess).toBe('function');
      expect(typeof setGPUProcessPriority).toBe('function');
      expect(typeof getWidgets).toBe('function');
      expect(typeof saveWidgets).toBe('function');
      expect(typeof deleteWidget).toBe('function');
      expect(typeof getPages).toBe('function');
      expect(typeof createPage).toBe('function');
      expect(typeof deletePage).toBe('function');
      expect(typeof getDashboardLayout).toBe('function');
      expect(typeof saveDashboardLayout).toBe('function');
      expect(typeof checkPrivileges).toBe('function');
    });
  });

  describe('Dashboard Layout Methods', () => {
    it('should get dashboard layout from widgets', async () => {
      const mockWidgetsResponse = {
        success: true,
        message: 'Widgets retrieved successfully',
        userID: 'user123',
        pageID: 'main-page',
        widgets: [{
          widgetId: 'widget1',
          widgetType: 'cpu',
          config: '{"refreshRate": 1000}',
          layout: '{"i": "widget1", "x": 0, "y": 0, "w": 2, "h": 2}'
        }]
      };
      
      mockWailsRuntime.main.App.GetWidgets.mockResolvedValue(mockWidgetsResponse);
      
      const result = await wailsApiService.getDashboardLayout('user123');
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ i: 'widget1', x: 0, y: 0, w: 2, h: 2 });
    });

    it('should check privileges using system info', async () => {
      const mockSystemInfo = {
        platform: 'windows',
        cpu_cores: 8,
        total_memory: 16384,
        boot_time: '2025-01-01T00:00:00Z'
      };
      
      mockWailsRuntime.main.App.GetSystemInfo.mockResolvedValue(mockSystemInfo);
      
      const result = await wailsApiService.checkPrivileges();
      
      expect(result).toEqual({
        hasAdminPrivileges: true,
        platform: 'windows',
        message: 'Privileges checked successfully'
      });
    });
  });
});