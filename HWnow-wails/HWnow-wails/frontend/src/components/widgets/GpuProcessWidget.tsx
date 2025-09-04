import React, { memo, useState, useRef, useEffect } from 'react';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { useConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import { ButtonSpinner, InlineLoader } from '../common/LoadingSpinner';
import { killGPUProcess, suspendGPUProcess, resumeGPUProcess, setGPUProcessPriority } from '../../services/wailsApiService';
import { onConnectionStatusChange, getWebSocketStatus, flushGPUProcessBatch } from '../../services/wailsEventService';
import { getGPUProcessConfigWithDefaults, GPU_PROCESS_PRESETS, type GPUProcessPresetType } from '../../utils/gpuProcessWidgetDefaults';
import './widget.css';

// Error Boundary Component for GPUProcessWidget
class GPUProcessErrorBoundary extends React.Component<
  { children: React.ReactNode; widgetId: string },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; widgetId: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[GPUProcessWidget] Rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="widget widget-gpu-process" role="region" aria-label="GPU Process Monitor - Error">
          <div className="widget-header">
            <div className="widget-title">
              <div className="widget-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              </div>
              <span>GPU Processes</span>
            </div>
          </div>
          <div className="widget-content">
            <div className="widget-error">
              <div className="widget-error-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <div className="widget-error-message">Widget Error</div>
              <div className="widget-error-subtitle">Failed to display GPU process data</div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Data validation utility functions
interface GPUProcessData {
  pid: number;
  name: string;
  gpu_usage: number;
  gpu_memory: number;
  type: string;
  command: string;
  status: string;
}

const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
};

const isValidGPUProcess = (process: unknown): process is GPUProcessData => {
  if (!process || typeof process !== 'object') return false;
  
  const p = process as any;
  return (
    isValidNumber(p.pid) && p.pid > 0 &&
    typeof p.name === 'string' && p.name.length > 0 &&
    isValidNumber(p.gpu_usage) && p.gpu_usage >= 0 &&
    isValidNumber(p.gpu_memory) && p.gpu_memory >= 0 &&
    typeof p.type === 'string' &&
    typeof p.command === 'string' &&
    typeof p.status === 'string'
  );
};

const getSafeGPUProcesses = (processes: unknown[]): GPUProcessData[] => {
  if (!Array.isArray(processes)) return [];
  
  return processes
    .filter(isValidGPUProcess)
    .map(process => ({
      ...process,
      gpu_usage: Math.min(Math.max(process.gpu_usage, 0), 999), // Cap GPU usage at 999%
      gpu_memory: Math.min(Math.max(process.gpu_memory, 0), 999999) // Cap memory at reasonable limit
    }));
};

const safeToFixed = (value: number, digits: number = 1): string => {
  try {
    if (!isValidNumber(value)) return '0.0';
    return value.toFixed(digits);
  } catch (error) {
    console.warn('[GPUProcessWidget] toFixed error:', error, 'value:', value);
    return '0.0';
  }
};

// Enhanced GPU usage display with adaptive precision for small values
const safeToFixedGPU = (value: number): string => {
  try {
    if (!isValidNumber(value)) return '0.0';
    // For values less than 1%, show 2 decimal places to reveal small usage
    // For values >= 1%, show 1 decimal place as usual
    if (value < 1.0 && value > 0) {
      return value.toFixed(2);
    }
    return value.toFixed(1);
  } catch (error) {
    console.warn('[GPUProcessWidget] GPU usage toFixed error:', error, 'value:', value);
    return '0.0';
  }
};

// Safe key generation for React
const getSafeKey = (process: GPUProcessData, index: number): string => {
  try {
    const pid = isValidNumber(process.pid) ? process.pid : index;
    return `gpu-process-${pid}-${index}`;
  } catch (error) {
    return `gpu-process-fallback-${index}`;
  }
};

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const GpuProcessWidgetContent: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedProcesses, setSelectedProcesses] = useState<Set<number>>(new Set());
  const [isControlInProgress, setIsControlInProgress] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    pid: number;
    processName: string;
  }>({ visible: false, x: 0, y: 0, pid: 0, processName: '' });
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [updateIndicatorVisible, setUpdateIndicatorVisible] = useState<boolean>(false);
  const [processUpdates, setProcessUpdates] = useState<Map<number, { timestamp: number; changed: boolean }>>(new Map());
  
  // Keyboard navigation state
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  const [isKeyboardNavigation, setIsKeyboardNavigation] = useState<boolean>(false);
  
  // Widget sizing for dynamic item scaling
  const widgetRef = useRef<HTMLDivElement>(null);
  const [widgetSizeCategory, setWidgetSizeCategory] = useState<string>('medium');
  
  const { showConfirm, ConfirmComponent } = useConfirmDialog();
  const { showProcessSuccess, showProcessError, showBulkProcessResult } = useToast();
  
  const rawGpuProcesses = useSystemResourceStore((state) => state.data.gpu_processes);
  const [componentMountTime] = useState(Date.now());
  const [previousProcesses, setPreviousProcesses] = useState<GPUProcessData[]>([]);
  
  // Safe GPU process data extraction
  const gpuProcesses = getSafeGPUProcesses(rawGpuProcesses);

  // 초기 로드 상태 관리
  React.useEffect(() => {
    if (gpuProcesses.length > 0 || Date.now() - componentMountTime > 5000) {
      setIsInitialLoad(false);
    }
  }, [gpuProcesses]);

  // 키보드 네비게이션 핸들링
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 입력 필드나 다른 요소에 포커스가 있을 때는 무시
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // 설정 모달이 열려있으면 무시
      if (isSettingsOpen) {
        return;
      }

      const processes = getSortedProcesses();
      if (processes.length === 0) return;

      let handled = false;
      setIsKeyboardNavigation(true);

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setFocusedRowIndex(prev => {
            const newIndex = Math.min(prev + 1, processes.length - 1);
            return newIndex;
          });
          handled = true;
          break;
          
        case 'ArrowUp':
          event.preventDefault();
          setFocusedRowIndex(prev => {
            const newIndex = Math.max(prev - 1, 0);
            return newIndex;
          });
          handled = true;
          break;
          
        case 'Home':
          event.preventDefault();
          setFocusedRowIndex(0);
          handled = true;
          break;
          
        case 'End':
          event.preventDefault();
          setFocusedRowIndex(processes.length - 1);
          handled = true;
          break;
          
        case ' ':
        case 'Enter':
          event.preventDefault();
          if (focusedRowIndex >= 0 && focusedRowIndex < processes.length) {
            const process = processes[focusedRowIndex];
            toggleProcessSelection(process.pid);
          }
          handled = true;
          break;
          
        case 'a':
        case 'A':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            // Select all processes
            const allPids = new Set(processes.map(p => p.pid));
            setSelectedProcesses(allPids);
            handled = true;
          }
          break;
          
        case 'Escape':
          event.preventDefault();
          // Clear selection and context menu
          setSelectedProcesses(new Set());
          setContextMenu(prev => ({ ...prev, visible: false }));
          setFocusedRowIndex(-1);
          setIsKeyboardNavigation(false);
          handled = true;
          break;
          
        case 'Delete':
          if (focusedRowIndex >= 0 && focusedRowIndex < processes.length) {
            event.preventDefault();
            const process = processes[focusedRowIndex];
            handleProcessAction('kill', [process.pid], [process.name]);
            handled = true;
          }
          break;
          
        case 'p':
        case 'P':
          if (focusedRowIndex >= 0 && focusedRowIndex < processes.length) {
            event.preventDefault();
            const process = processes[focusedRowIndex];
            handleProcessAction('suspend', [process.pid], [process.name]);
            handled = true;
          }
          break;
          
        case 'r':
        case 'R':
          if (focusedRowIndex >= 0 && focusedRowIndex < processes.length) {
            event.preventDefault();
            const process = processes[focusedRowIndex];
            handleProcessAction('resume', [process.pid], [process.name]);
            handled = true;
          }
          break;

        case 's':
        case 'S':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            handleSettingsClick(event as any);
            handled = true;
          }
          break;

        case '?':
          event.preventDefault();
          showKeyboardShortcutsHelp();
          handled = true;
          break;
      }

      if (handled) {
        // 포커스가 위젯에 있는지 확인
        const widgetElement = document.getElementById(`gpu-process-widget-${widgetId}`);
        if (widgetElement && !widgetElement.contains(document.activeElement)) {
          widgetElement.focus();
        }
      }
    };

    // 마우스 클릭 시 키보드 네비게이션 모드 해제
    const handleMouseDown = () => {
      setIsKeyboardNavigation(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [focusedRowIndex, selectedProcesses, isSettingsOpen, widgetId]);

  // 포커스된 행이 변경될 때 해당 프로세스를 선택 (선택적)
  React.useEffect(() => {
    if (isKeyboardNavigation && focusedRowIndex >= 0) {
      const processes = getSortedProcesses();
      if (focusedRowIndex < processes.length) {
        // 스크린 리더를 위한 aria-live 업데이트는 여기서 처리
      }
    }
  }, [focusedRowIndex, isKeyboardNavigation]);

  // Widget size detection for dynamic item sizing
  useEffect(() => {
    const detectWidgetSize = () => {
      if (widgetRef.current) {
        const rect = widgetRef.current.getBoundingClientRect();
        const height = rect.height;
        
        // Determine size category based on height
        let category: string;
        if (height < 300) {
          category = 'small';
        } else if (height < 500) {
          category = 'medium';
        } else if (height < 700) {
          category = 'large';
        } else if (height < 1000) {
          category = 'extra-large';
        } else {
          category = 'ultra-large';
        }
        
        if (category !== widgetSizeCategory) {
          setWidgetSizeCategory(category);
        }
      }
    };
    
    // Initial detection
    detectWidgetSize();
    
    // Set up resize observer for dynamic detection
    const resizeObserver = new ResizeObserver(detectWidgetSize);
    if (widgetRef.current) {
      resizeObserver.observe(widgetRef.current);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [widgetSizeCategory]);

  // 키보드 단축키 도움말 표시
  const showKeyboardShortcutsHelp = () => {
    const shortcuts = [
      '↑/↓: Navigate rows',
      'Home/End: First/Last row',
      'Space/Enter: Select/Deselect process',
      'Ctrl+A: Select all processes',
      'Delete: Kill focused process',
      'P: Suspend focused process',
      'R: Resume focused process',
      'Ctrl+S: Open settings',
      'Escape: Clear selection',
      '?: Show this help'
    ];
    
    showBulkProcessResult(0, 0, 'help', shortcuts, 8000);
  };

  // 키보드 네비게이션을 위한 프로세스 선택 토글 함수
  const toggleProcessSelection = (pid: number) => {
    const newSelected = new Set(selectedProcesses);
    if (newSelected.has(pid)) {
      newSelected.delete(pid);
    } else {
      newSelected.add(pid);
    }
    setSelectedProcesses(newSelected);
  };

  // 키보드 네비게이션을 위한 프로세스 액션 핸들러
  const handleProcessAction = async (action: 'kill' | 'suspend' | 'resume' | 'priority', pids: number[], processNames: string[], priority?: string) => {
    if (isControlInProgress) return;

    const executeAction = async () => {
      setIsControlInProgress(true);
      
      try {
        const results = await Promise.allSettled(
          pids.map(async (pid, index) => {
            const processName = processNames[index];
            switch (action) {
              case 'kill':
                await killGPUProcess(pid);
                return { pid, processName, success: true };
              case 'suspend':
                await suspendGPUProcess(pid);
                return { pid, processName, success: true };
              case 'resume':
                await resumeGPUProcess(pid);
                return { pid, processName, success: true };
              case 'priority':
                await setGPUProcessPriority(pid, priority!);
                return { pid, processName, success: true };
              default:
                throw new Error(`Unknown action: ${action}`);
            }
          })
        );

        const successes = results.filter(result => result.status === 'fulfilled').length;
        const failures = results.filter(result => result.status === 'rejected').length;
        const errors = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map(result => result.reason.message);

        if (pids.length === 1) {
          // Single process
          if (successes > 0) {
            showProcessSuccess(processNames[0], action, pids[0]);
          } else {
            showProcessError(processNames[0], action, errors[0] || 'Unknown error', pids[0]);
          }
        } else {
          // Multiple processes
          showBulkProcessResult(successes, failures, action, errors);
        }
        
      } catch (error: any) {
        showProcessError(processNames[0] || 'Unknown', action, error.message, pids[0]);
      } finally {
        setIsControlInProgress(false);
      }
    };

    // Show confirmation dialog if required
    if (config.gpuRequireConfirmation !== false && pids.length === 1) {
      const processName = processNames[0];
      const pid = pids[0];
      
      switch (action) {
        case 'kill':
          showConfirm({
            title: 'Process Termination',
            message: `프로세스 "${processName}" (PID: ${pid})을(를) 종료하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`,
            type: 'danger',
            icon: '🛑',
            onConfirm: executeAction
          });
          break;
        case 'suspend':
          showConfirm({
            title: 'Process Suspension',
            message: `프로세스 "${processName}" (PID: ${pid})을(를) 일시정지하시겠습니까?`,
            type: 'warning',
            icon: '⏸️',
            onConfirm: executeAction
          });
          break;
        case 'resume':
          showConfirm({
            title: 'Process Resume',
            message: `프로세스 "${processName}" (PID: ${pid})을(를) 재개하시겠습니까?`,
            type: 'default',
            icon: '▶️',
            onConfirm: executeAction
          });
          break;
        case 'priority':
          showConfirm({
            title: 'Process Priority Change',
            message: `프로세스 "${processName}" (PID: ${pid})의 우선순위를 ${priority}로 변경하시겠습니까?`,
            type: 'warning',
            icon: '⚡',
            onConfirm: executeAction
          });
          break;
      }
    } else {
      // No confirmation needed or multiple processes
      executeAction();
    }
  };

  const widget = useDashboardStore((state) => {
    const page = state.pages[state.activePageIndex];
    return page?.widgets.find((w) => w.i === widgetId);
  });
  
  // 기본값과 함께 병합된 설정 사용
  const config = getGPUProcessConfigWithDefaults(widget?.config);
  const processCount = config.gpuProcessCount || 5;
  const sortBy = config.gpuSortBy || 'gpu_usage';
  const sortOrder = config.gpuSortOrder || 'desc'; // 'asc' or 'desc'
  const filterEnabled = config.gpuFilterEnabled || false;
  const usageThreshold = config.gpuUsageThreshold || 25;
  const memoryThreshold = config.gpuMemoryThreshold || 100; // MB
  const filterType = config.gpuFilterType || 'or';
  const showUpdateIndicators = config.gpuShowUpdateIndicators !== false; // default true
  const enableUpdateAnimations = config.gpuEnableUpdateAnimations !== false; // default true

  // 프로세스 필터링 - Safe version
  const getFilteredProcesses = (): GPUProcessData[] => {
    if (!Array.isArray(gpuProcesses) || gpuProcesses.length === 0) return [];
    if (!filterEnabled) return gpuProcesses;

    try {
      return gpuProcesses.filter(process => {
        const meetsUsageThreshold = isValidNumber(process.gpu_usage) ? process.gpu_usage >= usageThreshold : false;
        const meetsMemoryThreshold = isValidNumber(process.gpu_memory) ? process.gpu_memory >= memoryThreshold : false;

        if (filterType === 'and') {
          return meetsUsageThreshold && meetsMemoryThreshold;
        } else {
          return meetsUsageThreshold || meetsMemoryThreshold;
        }
      });
    } catch (error) {
      console.warn('[GPUProcessWidget] Filter error:', error);
      return gpuProcesses; // Fallback without filtering
    }
  };

  // 프로세스 정렬 및 제한 - Safe version
  const getSortedProcesses = (): GPUProcessData[] => {
    const filtered = getFilteredProcesses();
    if (!Array.isArray(filtered) || filtered.length === 0) return [];
    
    try {
      const sorted = [...filtered].sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
          case 'gpu_usage':
            const aUsage = isValidNumber(a.gpu_usage) ? a.gpu_usage : 0;
            const bUsage = isValidNumber(b.gpu_usage) ? b.gpu_usage : 0;
            comparison = aUsage - bUsage;
            break;
          case 'gpu_memory':
            const aMemory = isValidNumber(a.gpu_memory) ? a.gpu_memory : 0;
            const bMemory = isValidNumber(b.gpu_memory) ? b.gpu_memory : 0;
            comparison = aMemory - bMemory;
            break;
          case 'name':
            const aName = typeof a.name === 'string' ? a.name : '';
            const bName = typeof b.name === 'string' ? b.name : '';
            comparison = aName.localeCompare(bName);
            break;
          case 'pid':
            const aPid = isValidNumber(a.pid) ? a.pid : 0;
            const bPid = isValidNumber(b.pid) ? b.pid : 0;
            comparison = aPid - bPid;
            break;
          case 'type':
            const aType = typeof a.type === 'string' ? a.type : '';
            const bType = typeof b.type === 'string' ? b.type : '';
            comparison = aType.localeCompare(bType);
            break;
          case 'status':
            const aStatus = typeof a.status === 'string' ? a.status : '';
            const bStatus = typeof b.status === 'string' ? b.status : '';
            comparison = aStatus.localeCompare(bStatus);
            break;
          default:
            comparison = 0;
        }
        
        // 정렬 순서 적용
        return sortOrder === 'asc' ? comparison : -comparison;
      });
      
      const safeProcessCount = Math.min(Math.max(processCount, 1), 100); // Safe range 1-100
      return sorted.slice(0, safeProcessCount);
    } catch (error) {
      console.warn('[GPUProcessWidget] Sort error:', error);
      return filtered.slice(0, Math.min(processCount, 10)); // Fallback without sorting
    }
  };

  const sortedProcesses = getSortedProcesses();
  const filteredCount = getFilteredProcesses().length;
  const totalCount = gpuProcesses.length;

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSettingsOpen(true);
  };

  const handleSettingsSave = () => {
    setIsSettingsOpen(false);
  };

  const applyPreset = (presetName: GPUProcessPresetType) => {
    const { actions } = useDashboardStore.getState();
    const presetConfig = GPU_PROCESS_PRESETS[presetName];
    actions.updateWidgetConfig(widgetId, presetConfig);
  };

  const resetToDefaults = () => {
    const { actions } = useDashboardStore.getState();
    // 현재 설정을 완전히 초기화
    actions.updateWidgetConfig(widgetId, {
      // GPU 프로세스 관련 설정만 초기화하고 다른 설정은 보존
      gpuProcessCount: undefined,
      gpuSortBy: undefined,
      gpuSortOrder: undefined,
      gpuFilterEnabled: undefined,
      gpuUsageThreshold: undefined,
      gpuMemoryThreshold: undefined,
      gpuFilterType: undefined,
      gpuShowUpdateIndicators: undefined,
      gpuEnableUpdateAnimations: undefined,
      gpuUpdateInterval: undefined,
      gpuShowStatusColors: undefined,
      gpuShowUsageGradients: undefined,
      gpuShowProcessIcons: undefined,
      gpuShowStatusAnimations: undefined,
      gpuEnableProcessControl: undefined,
      gpuShowControlButtons: undefined,
      gpuEnableContextMenu: undefined,
      gpuRequireConfirmation: undefined,
      gpuShowProcessPriority: undefined,
      gpuShowProcessCommand: undefined,
      gpuShowLastUpdateTime: undefined,
      gpuCompactView: undefined,
    });
  };

  const handleHeaderClick = (newSortBy: typeof sortBy) => {
    const { actions } = useDashboardStore.getState();
    
    if (sortBy === newSortBy) {
      // 같은 컬럼 클릭시 정렬 순서 변경
      const newSortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
      actions.updateWidgetConfig(widgetId, { gpuSortOrder: newSortOrder });
    } else {
      // 다른 컬럼 클릭시 해당 컬럼으로 정렬 변경
      actions.updateWidgetConfig(widgetId, { 
        gpuSortBy: newSortBy,
        gpuSortOrder: 'desc' // 새 컬럼은 기본적으로 내림차순
      });
    }
  };

  const getSortIcon = (columnKey: typeof sortBy) => {
    if (sortBy !== columnKey) return null;
    return sortOrder === 'desc' ? '↓' : '↑';
  };

  // 프로세스 선택 관련 핸들러들
  const handleProcessSelect = (pid: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + 클릭: 다중 선택
      const newSelected = new Set(selectedProcesses);
      if (newSelected.has(pid)) {
        newSelected.delete(pid);
      } else {
        newSelected.add(pid);
      }
      setSelectedProcesses(newSelected);
    } else {
      // 일반 클릭: 단일 선택
      setSelectedProcesses(new Set([pid]));
    }
  };

  const handleSelectAll = () => {
    if (selectedProcesses.size === sortedProcesses.length) {
      // 모든 프로세스가 선택된 경우 선택 해제
      setSelectedProcesses(new Set());
    } else {
      // 모든 프로세스 선택
      const allPids = new Set(sortedProcesses.map(p => p.pid));
      setSelectedProcesses(allPids);
    }
  };

  const clearSelection = () => {
    setSelectedProcesses(new Set());
  };

  // 컨텍스트 메뉴 핸들러들
  const handleContextMenu = (e: React.MouseEvent, pid: number, processName: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      pid,
      processName
    });
  };

  const hideContextMenu = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleContextAction = async (action: 'kill' | 'suspend' | 'resume' | 'priority', priority?: string) => {
    if (isControlInProgress) return;
    
    const { pid, processName } = contextMenu;
    hideContextMenu();
    
    const executeAction = async () => {
      setIsControlInProgress(true);
      
      try {
        switch (action) {
          case 'kill':
            await killGPUProcess(pid);
            showProcessSuccess(processName, action, pid);
            break;
          case 'suspend':
            await suspendGPUProcess(pid);
            showProcessSuccess(processName, action, pid);
            break;
          case 'resume':
            await resumeGPUProcess(pid);
            showProcessSuccess(processName, action, pid);
            break;
          case 'priority':
            await setGPUProcessPriority(pid, priority!);
            showProcessSuccess(processName, action, pid);
            break;
        }
      } catch (error: any) {
        showProcessError(processName, action, error.message, pid);
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      switch (action) {
        case 'kill':
          showConfirm({
            title: 'Process Termination',
            message: `프로세스 "${processName}" (PID: ${pid})을(를) 종료하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`,
            type: 'danger',
            icon: '🛑',
            onConfirm: executeAction
          });
          break;
        case 'suspend':
          showConfirm({
            title: 'Process Suspension',
            message: `프로세스 "${processName}" (PID: ${pid})을(를) 일시정지하시겠습니까?`,
            type: 'warning',
            icon: '⏸️',
            onConfirm: executeAction
          });
          break;
        case 'resume':
          showConfirm({
            title: 'Process Resume',
            message: `프로세스 "${processName}" (PID: ${pid})을(를) 재개하시겠습니까?`,
            type: 'default',
            icon: '▶️',
            onConfirm: executeAction
          });
          break;
        case 'priority':
          if (!priority) return;
          showConfirm({
            title: 'Change Process Priority',
            message: `프로세스 "${processName}" (PID: ${pid})의 우선순위를 ${priority.toUpperCase()}로 변경하시겠습니까?`,
            type: 'warning',
            icon: '⚡',
            onConfirm: executeAction
          });
          break;
      }
    } else {
      // Execute without confirmation
      executeAction();
    }
  };

  // 전역 클릭 이벤트로 컨텍스트 메뉴 숨기기
  React.useEffect(() => {
    const handleGlobalClick = () => hideContextMenu();
    if (contextMenu.visible) {
      document.addEventListener('click', handleGlobalClick);
      return () => document.removeEventListener('click', handleGlobalClick);
    }
  }, [contextMenu.visible]);

  // 실시간 데이터 변경 감지 및 시각적 피드백
  React.useEffect(() => {
    if (gpuProcesses.length === 0) return;
    
    // 업데이트 시간 및 표시기 설정
    setLastUpdateTime(Date.now());
    setUpdateIndicatorVisible(true);
    
    // 프로세스 변경사항 감지
    const updates = new Map<number, { timestamp: number; changed: boolean }>();
    
    gpuProcesses.forEach(process => {
      const prevProcess = previousProcesses.find(p => p.pid === process.pid);
      let hasChanges = false;
      
      if (!prevProcess) {
        // 새로운 프로세스
        hasChanges = true;
      } else {
        // 기존 프로세스의 변경사항 감지
        hasChanges = 
          prevProcess.gpu_usage !== process.gpu_usage ||
          prevProcess.gpu_memory !== process.gpu_memory ||
          prevProcess.status !== process.status ||
          prevProcess.type !== process.type;
      }
      
      updates.set(process.pid, {
        timestamp: Date.now(),
        changed: hasChanges
      });
    });
    
    setProcessUpdates(updates);
    setPreviousProcesses([...gpuProcesses]);
    
    // 업데이트 표시기 자동 숨김
    const hideTimer = setTimeout(() => {
      setUpdateIndicatorVisible(false);
    }, 1500);
    
    return () => clearTimeout(hideTimer);
  }, [gpuProcesses]);

  // WebSocket 연결 상태 모니터링 (개선된 버전)
  React.useEffect(() => {
    // WebSocket 연결 상태 변경 콜백 등록
    const unsubscribe = onConnectionStatusChange((connected) => {
      setIsConnected(connected);
      if (!connected) {
      }
    });
    
    // 정기적인 상태 확인 (추가적인 안전 장치)
    const statusCheckInterval = setInterval(() => {
      const status = getWebSocketStatus();
      
      // WebSocket 상태와 실제 데이터 수신 상태 비교
      const now = Date.now();
      const timeSinceUpdate = now - lastUpdateTime;
      
      if (status.connected && timeSinceUpdate > 15000) {
        console.warn('WebSocket connected but no data received for 15 seconds');
        // 배치 처리 강제 실행 시도
        flushGPUProcessBatch();
      }
      
      // 디버그 정보 출력 (개발 환경에서만)
      if (import.meta.env.DEV) {
        console.debug('WebSocket Status:', status);
      }
    }, 10000); // 10초마다 확인
    
    return () => {
      unsubscribe();
      clearInterval(statusCheckInterval);
    };
  }, [lastUpdateTime]);

  // 프로세스 변경 하이라이트 자동 제거
  React.useEffect(() => {
    const cleanupTimer = setTimeout(() => {
      const updatedMap = new Map();
      processUpdates.forEach((update, pid) => {
        if (Date.now() - update.timestamp < 3000) {
          updatedMap.set(pid, { ...update, changed: false });
        }
      });
      setProcessUpdates(updatedMap);
    }, 3000);
    
    return () => clearTimeout(cleanupTimer);
  }, [processUpdates]);

  const formatProcessName = (name: string) => {
    if (name.length > 20) {
      return name.substring(0, 17) + '...';
    }
    return name;
  };

  const getRelativeTimeString = (timestamp: number) => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 5) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getProcessTypeIcon = (type: string, processName?: string) => {
    const lowerType = type.toLowerCase();
    const lowerName = processName?.toLowerCase() || '';
    
    // 프로세스 타입별 아이콘
    switch (lowerType) {
      case 'graphics':
      case 'g':
      case 'gfx':
        // 게임/그래픽스 애플리케이션 세부 분류
        if (lowerName.includes('game') || lowerName.includes('unreal') || lowerName.includes('unity') || 
            lowerName.includes('steam') || lowerName.includes('origin') || lowerName.includes('epic') ||
            lowerName.includes('minecraft') || lowerName.includes('wow') || lowerName.includes('csgo') ||
            lowerName.includes('dota') || lowerName.includes('valorant') || lowerName.includes('lol')) {
          return '🎮';
        }
        if (lowerName.includes('blender') || lowerName.includes('maya') || lowerName.includes('3dsmax') ||
            lowerName.includes('cinema4d') || lowerName.includes('houdini')) {
          return '🎨';
        }
        if (lowerName.includes('premiere') || lowerName.includes('aftereffects') || lowerName.includes('davinci') ||
            lowerName.includes('ffmpeg') || lowerName.includes('handbrake') || lowerName.includes('obs')) {
          return '🎬';
        }
        if (lowerName.includes('photoshop') || lowerName.includes('illustrator') || lowerName.includes('gimp') ||
            lowerName.includes('krita') || lowerName.includes('designer')) {
          return '🖼️';
        }
        return '📺'; // 일반 그래픽스
        
      case 'compute':
      case 'c':
      case 'cuda':
        // AI/ML/컴퓨팅 애플리케이션 세부 분류
        if (lowerName.includes('python') || lowerName.includes('jupyter') || lowerName.includes('conda') ||
            lowerName.includes('tensorflow') || lowerName.includes('pytorch') || lowerName.includes('keras') ||
            lowerName.includes('nvidia-ml') || lowerName.includes('triton')) {
          return '🤖';
        }
        if (lowerName.includes('blender') || lowerName.includes('cycles') || lowerName.includes('optix')) {
          return '🎨';
        }
        if (lowerName.includes('mining') || lowerName.includes('miner') || lowerName.includes('eth') ||
            lowerName.includes('bitcoin') || lowerName.includes('crypto')) {
          return '⛏️';
        }
        if (lowerName.includes('folding') || lowerName.includes('boinc') || lowerName.includes('seti')) {
          return '🧬';
        }
        if (lowerName.includes('password') || lowerName.includes('hashcat') || lowerName.includes('john')) {
          return '🔐';
        }
        return '🧮'; // 일반 컴퓨팅
        
      case 'mixed':
      case 'multi':
        return '🔀'; // 혼합 타입
        
      case 'copy':
      case 'dma':
        return '📋'; // 메모리 복사
        
      case 'encode':
      case 'decoder':
      case 'nvenc':
      case 'nvdec':
        return '🎞️'; // 인코딩/디코딩
        
      case 'display':
      case 'overlay':
        return '🖥️'; // 디스플레이
        
      default:
        // 프로세스 이름 기반 추론
        if (lowerName.includes('chrome') || lowerName.includes('firefox') || lowerName.includes('edge') ||
            lowerName.includes('browser') || lowerName.includes('webkit')) {
          return '🌐';
        }
        if (lowerName.includes('discord') || lowerName.includes('teams') || lowerName.includes('zoom') ||
            lowerName.includes('skype') || lowerName.includes('slack')) {
          return '💬';
        }
        if (lowerName.includes('vlc') || lowerName.includes('media') || lowerName.includes('player') ||
            lowerName.includes('spotify') || lowerName.includes('youtube')) {
          return '🎵';
        }
        if (lowerName.includes('nvidia') || lowerName.includes('radeon') || lowerName.includes('intel') ||
            lowerName.includes('driver') || lowerName.includes('service')) {
          return '⚙️';
        }
        if (lowerName.includes('dwm') || lowerName.includes('compositor') || lowerName.includes('x11') ||
            lowerName.includes('wayland')) {
          return '🪟';
        }
        return '🔧'; // 기타/알 수 없음
    }
  };

  const getProcessStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'active':
        return 'gpu-process-running';
      case 'idle':
      case 'waiting':
        return 'gpu-process-idle';
      case 'suspended':
      case 'paused':
        return 'gpu-process-suspended';
      case 'blocked':
      case 'stopped':
        return 'gpu-process-blocked';
      default:
        return 'gpu-process-unknown';
    }
  };

  const getGpuUsageClass = (gpuUsage: number) => {
    if (gpuUsage >= 90) return 'gpu-usage-critical';
    if (gpuUsage >= 70) return 'gpu-usage-high';
    if (gpuUsage >= 30) return 'gpu-usage-medium';
    return 'gpu-usage-low';
  };

  const getMemoryUsageClass = (memoryUsage: number) => {
    if (memoryUsage >= 4096) return 'memory-usage-critical'; // 4GB+
    if (memoryUsage >= 2048) return 'memory-usage-high';     // 2GB+
    if (memoryUsage >= 512) return 'memory-usage-medium';    // 512MB+
    return 'memory-usage-low';
  };

  const getProcessTypeClass = (type: string) => {
    switch (type.toLowerCase()) {
      case 'compute':
      case 'c':
        return 'process-type-compute';
      case 'graphics':
      case 'g':
      case 'gfx':
        return 'process-type-graphics';
      case 'media':
      case 'm':
        return 'process-type-media';
      case 'system':
      case 's':
        return 'process-type-system';
      default:
        return 'process-type-unknown';
    }
  };

  const getConnectionStatusClass = (isConnected: boolean) => {
    return isConnected ? 'connection-status-connected' : 'connection-status-disconnected';
  };

  const getProcessStatusWithPattern = (status: string) => {
    const baseClass = getProcessStatusClass(status);
    switch (status.toLowerCase()) {
      case 'running':
      case 'active':
        return `${baseClass} process-status-running`;
      case 'idle':
      case 'waiting':
        return `${baseClass} process-status-idle`;
      case 'suspended':
      case 'paused':
        return `${baseClass} process-status-suspended`;
      default:
        return baseClass;
    }
  };


  // 프로세스 제어 핸들러들
  const handleKillSelected = async () => {
    if (isControlInProgress) return;
    
    const processesToKill = Array.from(selectedProcesses);
    if (processesToKill.length === 0) return;
    
    const executeKill = async () => {
      setIsControlInProgress(true);
      
      try {
        const results = await Promise.allSettled(
          processesToKill.map(pid => killGPUProcess(pid))
        );
        
        let successCount = 0;
        let failureCount = 0;
        const errors: string[] = [];
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failureCount++;
            errors.push(`PID ${processesToKill[index]}: ${result.reason.message}`);
          }
        });
        
        // 결과 메시지 표시
        showBulkProcessResult(successCount, failureCount, 'kill', errors);
        
        // 선택 해제
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process kill:', error);
        showProcessError('선택된 프로세스들', 'kill', '예상치 못한 오류가 발생했습니다.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToKill.length === 1 
        ? `프로세스 ${processesToKill[0]}을(를) 종료하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`
        : `선택된 ${processesToKill.length}개 프로세스를 모두 종료하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`;
        
      showConfirm({
        title: 'Kill Selected Processes',
        message,
        type: 'danger',
        icon: '🛑',
        onConfirm: executeKill
      });
    } else {
      executeKill();
    }
  };
  
  const handleSuspendSelected = async () => {
    if (isControlInProgress) return;
    
    const processesToSuspend = Array.from(selectedProcesses);
    if (processesToSuspend.length === 0) return;
    
    const executeSuspend = async () => {
      setIsControlInProgress(true);
      
      try {
        const results = await Promise.allSettled(
          processesToSuspend.map(pid => suspendGPUProcess(pid))
        );
        
        let successCount = 0;
        let failureCount = 0;
        const errors: string[] = [];
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failureCount++;
            errors.push(`PID ${processesToSuspend[index]}: ${result.reason.message}`);
          }
        });
        
        // 결과 메시지 표시
        showBulkProcessResult(successCount, failureCount, 'suspend', errors);
        
        // 선택 해제
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process suspend:', error);
        showProcessError('선택된 프로세스들', 'suspend', '예상치 못한 오류가 발생했습니다.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToSuspend.length === 1 
        ? `프로세스 ${processesToSuspend[0]}을(를) 일시정지하시겠습니까?`
        : `선택된 ${processesToSuspend.length}개 프로세스를 모두 일시정지하시겠습니까?`;
        
      showConfirm({
        title: 'Suspend Selected Processes',
        message,
        type: 'warning',
        icon: '⏸️',
        onConfirm: executeSuspend
      });
    } else {
      executeSuspend();
    }
  };
  
  const handleResumeSelected = async () => {
    if (isControlInProgress) return;
    
    const processesToResume = Array.from(selectedProcesses);
    if (processesToResume.length === 0) return;
    
    const executeResume = async () => {
      setIsControlInProgress(true);
      
      try {
        const results = await Promise.allSettled(
          processesToResume.map(pid => resumeGPUProcess(pid))
        );
        
        let successCount = 0;
        let failureCount = 0;
        const errors: string[] = [];
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failureCount++;
            errors.push(`PID ${processesToResume[index]}: ${result.reason.message}`);
          }
        });
        
        // 결과 메시지 표시
        showBulkProcessResult(successCount, failureCount, 'resume', errors);
        
        // 선택 해제
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process resume:', error);
        showProcessError('선택된 프로세스들', 'resume', '예상치 못한 오류가 발생했습니다.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToResume.length === 1 
        ? `프로세스 ${processesToResume[0]}을(를) 재개하시겠습니까?`
        : `선택된 ${processesToResume.length}개 프로세스를 모두 재개하시겠습니까?`;
        
      showConfirm({
        title: 'Resume Selected Processes',
        message,
        type: 'default',
        icon: '▶️',
        onConfirm: executeResume
      });
    } else {
      executeResume();
    }
  };

  return (
    <>
      <div 
        id={`gpu-process-widget-${widgetId}`}
        ref={widgetRef}
        className={`widget widget-gpu-process ${filterEnabled ? 'filtering-enabled' : ''}`} 
        data-widget-height={widgetSizeCategory}
        role="region" 
        aria-label="GPU Process Monitor"
        tabIndex={-1}
      >
        <div className="widget-header">
          <div className="widget-actions left">
            <button 
              className="widget-action-button" 
              title="GPU process monitor widget settings"
              aria-label="Open GPU process monitor widget settings"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleSettingsClick}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6m3.22-10.22l4.24-4.24m-4.24 10.46l4.24 4.24M21 12h-6m-6 0H3m10.22 3.22l-4.24 4.24m4.24-10.46L8.98 4.76" />
              </svg>
            </button>
            {!isExpanded && onExpand && (
              <button
                className="widget-action-button expand-button"
                onClick={onExpand}
                title="Expand GPU Process Monitor widget"
                aria-label="Expand GPU Process Monitor widget"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              </button>
            )}
          </div>
          <div className="widget-title">
            <div className="widget-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" role="img" aria-labelledby="gpu-icon-title">
                <title id="gpu-icon-title">GPU 아이콘</title>
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            </div>
            <h2 id="gpu-process-widget-title">GPU Processes</h2>
            
            {/* 실시간 업데이트 상태 표시기 */}
            {showUpdateIndicators && (
              <div 
                role="status" 
                aria-live="polite"
                aria-label={`연결 상태: ${isConnected ? '연결됨' : '연결 해제됨'}, 마지막 업데이트: ${lastUpdateTime > 0 ? getRelativeTimeString(lastUpdateTime) : '없음'}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  marginLeft: '0.5rem',
                  fontSize: '0.7rem',
                  color: 'var(--color-text-secondary)'
                }}
              >
                {/* 연결 상태 표시기 */}
                <div 
                  role="img"
                  aria-label={isConnected ? '실시간 연결 상태: 연결됨' : '실시간 연결 상태: 연결 해제됨'}
                  className={getConnectionStatusClass(isConnected)}
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: isConnected ? 'var(--color-success)' : 'var(--color-error)',
                    animation: updateIndicatorVisible ? 'pulse 1s ease-in-out' : 'none'
                  }} 
                  title={isConnected ? 'Connected - Real-time updates' : 'Disconnected'} 
                />
                
                {/* 마지막 업데이트 시간 */}
                {lastUpdateTime > 0 && (
                  <span 
                    style={{ 
                      fontFamily: 'var(--font-mono, monospace)',
                      opacity: 0.8
                    }}
                    title={`Last update: ${formatTime(lastUpdateTime)}`}
                    aria-label={`마지막 업데이트 시간: ${formatTime(lastUpdateTime)}`}
                  >
                    {getRelativeTimeString(lastUpdateTime)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="widget-actions">
            <button
              className="remove-widget-button"
              onClick={onRemove}
              title="Remove GPU Process Monitor widget"
              aria-label="Remove GPU Process Monitor widget"
              onMouseDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="widget-content">
          <div 
            className="widget-value" 
            role="status" 
            aria-live="polite" 
            aria-atomic="true"
            aria-label={`Showing top ${processCount} GPU processes sorted by ${sortBy}`}
          >
            <span className="widget-value-text">
              {filterEnabled ? (
                <>
                  {sortedProcesses.length}/{filteredCount} filtered (of {totalCount}) by {sortBy.toUpperCase().replace('_', ' ')} {sortOrder === 'desc' ? '↓' : '↑'}
                </>
              ) : (
                <>
                  Top {processCount} by {sortBy.toUpperCase().replace('_', ' ')} {sortOrder === 'desc' ? '↓' : '↑'}
                </>
              )}
            </span>
          </div>
          
          {/* 전체 상태 요약 */}
          {sortedProcesses.length > 0 && (
            <div 
              role="complementary" 
              aria-label="프로세스 상태 요약"
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                padding: '0.25rem 0',
                borderBottom: '1px solid var(--color-border)',
                marginBottom: '0.25rem',
                fontSize: '0.75rem'
              }}
            >
              <div style={{ textAlign: 'center' }} role="group" aria-labelledby="running-status-label">
                <div 
                  id="running-status-label"
                  style={{ 
                    color: 'var(--color-success)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    justifyContent: 'center'
                  }}
                  aria-label={`실행 중인 프로세스: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'running').length}개`}
                >
                  <div 
                    role="img"
                    aria-label="실행 중 상태 표시기"
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-success)',
                      animation: enableUpdateAnimations ? 'runningPulse 2s ease-in-out infinite' : 'none'
                    }} 
                  />
                  {sortedProcesses.filter(p => p.status.toLowerCase() === 'running').length}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>Running</div>
              </div>
              
              <div style={{ textAlign: 'center' }} role="group" aria-labelledby="idle-status-label">
                <div 
                  id="idle-status-label"
                  style={{ 
                    color: 'var(--color-warning)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    justifyContent: 'center'
                  }}
                  aria-label={`대기 중인 프로세스: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'idle').length}개`}
                >
                  <div 
                    role="img"
                    aria-label="대기 중 상태 표시기"
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-warning)',
                      animation: enableUpdateAnimations ? 'idleBlink 3s ease-in-out infinite' : 'none'
                    }} 
                  />
                  {sortedProcesses.filter(p => p.status.toLowerCase() === 'idle').length}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>Idle</div>
              </div>
              
              <div style={{ textAlign: 'center' }} role="group" aria-labelledby="suspended-status-label">
                <div 
                  id="suspended-status-label"
                  style={{ 
                    color: 'var(--color-error)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    justifyContent: 'center'
                  }}
                  aria-label={`일시정지된 프로세스: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'suspended').length}개`}
                >
                  <div 
                    role="img"
                    aria-label="일시정지 상태 표시기"
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-error)',
                      animation: enableUpdateAnimations ? 'suspendedFlash 1.5s ease-in-out infinite' : 'none'
                    }} 
                  />
                  {sortedProcesses.filter(p => p.status.toLowerCase() === 'suspended').length}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>Suspended</div>
              </div>
              
              <div style={{ textAlign: 'center' }} role="group" aria-labelledby="high-usage-label">
                <div 
                  id="high-usage-label"
                  style={{ 
                    color: 'var(--color-info)',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    justifyContent: 'center'
                  }}
                  aria-label={`높은 GPU 사용률 프로세스: ${sortedProcesses.filter(p => p.gpu_usage > 90).length}개`}
                >
                  <span role="img" aria-label="높은 사용률 표시">🔥</span> {sortedProcesses.filter(p => p.gpu_usage > 90).length}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>High Usage</div>
              </div>
            </div>
          )}
          
          <div 
            className="process-list" 
            role="table" 
            aria-label="GPU 프로세스 목록"
            aria-rowcount={sortedProcesses.length}
            aria-describedby="gpu-process-widget-title"
          >
            {isInitialLoad ? (
              <div className="widget-loading-state" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--spacing-xl)',
                color: 'var(--color-text-secondary)',
                textAlign: 'center'
              }}>
                <InlineLoader message="Scanning for GPU processes..." />
                <div style={{
                  fontSize: '0.75rem',
                  opacity: 0.7,
                  marginTop: 'var(--spacing-sm)'
                }}>
                  This may take a few seconds...
                </div>
              </div>
            ) : sortedProcesses.length === 0 ? (
              <div className="widget-empty-state" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--spacing-xl)',
                color: 'var(--color-text-secondary)',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '2rem',
                  marginBottom: 'var(--spacing-md)',
                  opacity: 0.5
                }}>
                  🔍
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: 'var(--spacing-xs)'
                }}>
                  {filterEnabled ? 
                    'No processes match filter criteria' : 
                    'No GPU processes detected'
                  }
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  opacity: 0.7,
                  maxWidth: '200px',
                  lineHeight: 1.4
                }}>
                  {filterEnabled ? (
                    <>
                      Try adjusting GPU usage ({usageThreshold}%) or memory ({memoryThreshold}MB) thresholds
                    </>
                  ) : (
                    'Make sure your GPU drivers are installed and applications are using the GPU'
                  )}
                </div>
              </div>
            ) : (
              <>
                <div 
                  className="process-header" 
                  role="rowgroup"
                  aria-label="테이블 헤더"
                >
                  <div 
                    role="columnheader"
                    aria-label="모든 프로세스 선택/해제"
                    className="process-select-header"
                    title="Select all processes"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProcesses.size > 0 && selectedProcesses.size === sortedProcesses.length}
                      onChange={handleSelectAll}
                      aria-label={`모든 프로세스 선택 (현재 ${selectedProcesses.size}/${sortedProcesses.length}개 선택됨)`}
                      title="Select all processes"
                      style={{
                        margin: 0,
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                  <div 
                    role="columnheader"
                    tabIndex={0}
                    aria-sort={sortBy === 'name' ? (sortOrder === 'desc' ? 'descending' : 'ascending') : 'none'}
                    className="process-name-header sortable-header"
                    onClick={() => handleHeaderClick('name')}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHeaderClick('name')}
                    title="Click to sort by process name"
                    aria-label="프로세스 이름으로 정렬"
                  >
                    Process {getSortIcon('name')}
                  </div>
                  <div 
                    role="columnheader"
                    tabIndex={0}
                    aria-sort={sortBy === 'pid' ? (sortOrder === 'desc' ? 'descending' : 'ascending') : 'none'}
                    className="process-pid-header sortable-header"
                    onClick={() => handleHeaderClick('pid')}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHeaderClick('pid')}
                    title="Click to sort by PID"
                    aria-label="프로세스 ID로 정렬"
                  >
                    PID {getSortIcon('pid')}
                  </div>
                  <div 
                    role="columnheader"
                    tabIndex={0}
                    aria-sort={sortBy === 'gpu_usage' ? (sortOrder === 'desc' ? 'descending' : 'ascending') : 'none'}
                    className="process-gpu-header sortable-header"
                    onClick={() => handleHeaderClick('gpu_usage')}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHeaderClick('gpu_usage')}
                    title="Click to sort by GPU usage"
                    aria-label="GPU 사용률로 정렬"
                  >
                    GPU {getSortIcon('gpu_usage')}
                  </div>
                  <div 
                    role="columnheader"
                    tabIndex={0}
                    aria-sort={sortBy === 'gpu_memory' ? (sortOrder === 'desc' ? 'descending' : 'ascending') : 'none'}
                    className="process-memory-header sortable-header"
                    onClick={() => handleHeaderClick('gpu_memory')}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHeaderClick('gpu_memory')}
                    title="Click to sort by GPU memory usage"
                    aria-label="GPU 메모리 사용량으로 정렬"
                  >
                    VRAM {getSortIcon('gpu_memory')}
                  </div>
                  <div 
                    role="columnheader"
                    tabIndex={0}
                    aria-sort={sortBy === 'type' ? (sortOrder === 'desc' ? 'descending' : 'ascending') : 'none'}
                    className="process-type-header sortable-header"
                    onClick={() => handleHeaderClick('type')}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleHeaderClick('type')}
                    title="Click to sort by process type"
                    aria-label="프로세스 타입으로 정렬"
                  >
                    Type {getSortIcon('type')}
                  </div>
                </div>
                {sortedProcesses.map((process, index) => {
                  const updateInfo = processUpdates.get(process.pid);
                  const hasRecentChanges = updateInfo?.changed && (Date.now() - updateInfo.timestamp < 2000);
                  const statusClass = getProcessStatusWithPattern(process.status);
                  const usageClass = getGpuUsageClass(process.gpu_usage);
                  const memoryClass = getMemoryUsageClass(process.gpu_memory);
                  const typeClass = getProcessTypeClass(process.type);
                  
                  return (
                  <div 
                    key={getSafeKey(process, index)} 
                    className={`process-item ${statusClass} ${usageClass} ${memoryClass} ${typeClass} ${selectedProcesses.has(process.pid) ? 'process-selected' : ''} ${hasRecentChanges && enableUpdateAnimations ? 'process-updated' : ''} ${focusedRowIndex === index && isKeyboardNavigation ? 'process-keyboard-focused' : ''}`}
                    title={`${process.name} (PID: ${process.pid})\nStatus: ${process.status}\nGPU Usage: ${safeToFixedGPU(process.gpu_usage)}%\nGPU Memory: ${safeToFixed(process.gpu_memory, 0)}MB${updateInfo ? `\nLast updated: ${formatTime(updateInfo.timestamp)}` : ''}`}
                    onClick={(e) => handleProcessSelect(process.pid, e)}
                    onContextMenu={(e) => handleContextMenu(e, process.pid, process.name)}
                    tabIndex={0}
                    role="row"
                    aria-rowindex={index + 1}
                    aria-selected={selectedProcesses.has(process.pid)}
                    aria-label={`${index + 1}번째 프로세스: ${process.name}, PID ${process.pid}, GPU 사용률 ${safeToFixedGPU(process.gpu_usage)}%, 메모리 ${safeToFixed(process.gpu_memory, 0)}MB, 상태 ${process.status}`}
                    data-process-index={index}
                    onFocus={() => {
                      if (!isKeyboardNavigation) {
                        setFocusedRowIndex(index);
                        setIsKeyboardNavigation(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      // Handle row-specific keyboard events
                      switch (e.key) {
                        case ' ':
                        case 'Enter':
                          e.preventDefault();
                          handleProcessSelect(process.pid, e as any);
                          break;
                        case 'Delete':
                          e.preventDefault();
                          handleProcessAction('kill', [process.pid], [process.name]);
                          break;
                      }
                    }}
                    style={{
                      transition: enableUpdateAnimations ? 'all 0.3s ease' : 'none',
                      ...(hasRecentChanges && enableUpdateAnimations ? {
                        backgroundColor: 'var(--color-primary-alpha-10)',
                        borderColor: 'var(--color-primary-alpha-30)',
                        transform: 'translateX(2px)'
                      } : {}),
                      ...(focusedRowIndex === index && isKeyboardNavigation ? {
                        outline: '2px solid var(--color-primary)',
                        outlineOffset: '1px',
                        backgroundColor: 'var(--color-primary-alpha-05)'
                      } : {})
                    }}
                  >
                    <div className="process-select" role="gridcell" aria-label="프로세스 선택">
                      <input
                        type="checkbox"
                        checked={selectedProcesses.has(process.pid)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleProcessSelect(process.pid, e as any);
                        }}
                        aria-label={`${process.name} 프로세스 선택`}
                        style={{
                          margin: 0,
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                    <div 
                      className="process-name" 
                      role="gridcell"
                      aria-label={`프로세스 이름: ${process.name}`}
                      title={`${process.name}\nCommand: ${process.command}`}
                    >
                      <span 
                        className="process-type-icon"
                        role="img"
                        aria-label={`프로세스 유형: ${process.type}`}
                      >
                        {getProcessTypeIcon(process.type, process.name)}
                      </span>
                      {formatProcessName(process.name)}
                    </div>
                    <div 
                      className="process-pid"
                      role="gridcell"
                      aria-label={`프로세스 ID: ${process.pid}`}
                    >
                      {process.pid}
                    </div>
                    <div 
                      className="process-gpu"
                      role="gridcell"
                      aria-label={`GPU 사용률: ${safeToFixedGPU(process.gpu_usage)}퍼센트`}
                      style={{ 
                        color: process.gpu_usage > 90 ? 'var(--color-error)' : 
                               process.gpu_usage > 70 ? 'var(--color-warning)' : 
                               process.gpu_usage > 30 ? 'var(--color-info)' :
                               'var(--color-success)',
                        fontWeight: process.gpu_usage > 80 ? '700' : '500',
                        position: 'relative'
                      }}
                      title={`GPU Usage: ${safeToFixedGPU(process.gpu_usage)}%`}
                    >
                      {process.gpu_usage > 95 && (
                        <span 
                          role="img" 
                          aria-label="초고사용률 경고"
                          style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-8px',
                            fontSize: '8px',
                            animation: 'pulse 1s infinite'
                          }}
                        >🔥</span>
                      )}
                      {safeToFixedGPU(process.gpu_usage)}%
                    </div>
                    <div 
                      className="process-memory"
                      role="gridcell"
                      aria-label={`GPU 메모리 사용량: ${process.gpu_memory < 1024 ? `${safeToFixed(process.gpu_memory, 0)}메가바이트` : `${safeToFixed(process.gpu_memory / 1024, 1)}기가바이트`}`}
                      style={{ 
                        color: process.gpu_memory > 2048 ? 'var(--color-error)' : 
                               process.gpu_memory > 1024 ? 'var(--color-warning)' : 
                               process.gpu_memory > 512 ? 'var(--color-info)' :
                               'var(--color-success)',
                        fontWeight: process.gpu_memory > 1536 ? '700' : '500',
                        position: 'relative'
                      }}
                      title={`GPU Memory: ${safeToFixed(process.gpu_memory, 0)}MB`}
                    >
                      {process.gpu_memory > 4096 && (
                        <span 
                          role="img" 
                          aria-label="고용량 메모리 경고"
                          style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-8px',
                            fontSize: '8px',
                            animation: 'pulse 1s infinite'
                          }}
                        >💾</span>
                      )}
                      {process.gpu_memory < 1024 
                        ? `${safeToFixed(process.gpu_memory, 0)}MB`
                        : `${safeToFixed(process.gpu_memory / 1024, 1)}GB`
                      }
                    </div>
                    <div 
                      className={`process-type ${getProcessTypeClass(process.type)}`}
                      role="gridcell"
                      aria-label={`프로세스 타입: ${process.type}, 상태: ${process.status}`}
                      title={`Process Type: ${process.type}\nStatus: ${process.status}`}
                    >
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.25rem',
                        position: 'relative'
                      }}>
                        <span 
                          className="process-type-icon"
                          role="img"
                          aria-label={`프로세스 유형: ${process.type}`}
                        >
                          {getProcessTypeIcon(process.type, process.name)}
                        </span>
                        <span style={{ fontSize: '0.75rem' }}>{process.type}</span>
                        
                        {/* 상태 표시 점 */}
                        <div 
                          role="img"
                          aria-label={`프로세스 상태: ${process.status}`}
                          className={getConnectionStatusClass(process.status.toLowerCase() === 'running')}
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: 
                              process.status.toLowerCase() === 'running' ? 'var(--color-success)' :
                              process.status.toLowerCase() === 'idle' ? 'var(--color-warning)' :
                              process.status.toLowerCase() === 'suspended' ? 'var(--color-error)' :
                              'var(--color-text-secondary)',
                            animation: 
                              process.status.toLowerCase() === 'running' && enableUpdateAnimations ? 'runningPulse 2s ease-in-out infinite' :
                              process.status.toLowerCase() === 'suspended' && enableUpdateAnimations ? 'suspendedFlash 1.5s ease-in-out infinite' :
                              'none'
                          }}
                          title={`Status: ${process.status}`}
                        />
                      </div>
                    </div>
                  </div>
                  );
                })}
              </>
            )}
          </div>
          
          {/* 프로세스 제어 버튼 그룹 */}
          {selectedProcesses.size > 0 && (
            <div 
              className="process-control-buttons" 
              role="toolbar"
              aria-label="선택된 프로세스 제어 도구"
              style={{
                display: 'flex',
                gap: 'var(--spacing-sm)',
                padding: 'var(--spacing-sm)',
                borderTop: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-background-secondary)',
                borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                alignItems: 'center'
              }}
            >
              <div 
                role="status" 
                aria-live="polite"
                aria-label={`${selectedProcesses.size}개의 프로세스가 선택됨`}
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  marginRight: 'var(--spacing-sm)'
                }}
              >
                {selectedProcesses.size}개 프로세스 선택됨
              </div>
              <button
                className="process-control-btn kill-btn"
                onClick={handleKillSelected}
                disabled={isControlInProgress}
                aria-label={`선택된 ${selectedProcesses.size}개 프로세스 종료`}
                title="선택된 프로세스 종료"
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  border: '1px solid var(--color-error)',
                  backgroundColor: 'var(--color-error)',
                  color: 'white',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-error-dark)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-error)';
                }}
              >
                {isControlInProgress ? (
                  <>
                    <ButtonSpinner size={12} color="white" />
                    Killing...
                  </>
                ) : (
                  <>
                    🛑 Kill
                  </>
                )}
              </button>
              <button
                className="process-control-btn suspend-btn"
                onClick={handleSuspendSelected}
                disabled={isControlInProgress}
                title="선택된 프로세스 일시정지"
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  border: '1px solid var(--color-warning)',
                  backgroundColor: 'var(--color-warning)',
                  color: 'white',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-warning-dark)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-warning)';
                }}
              >
                {isControlInProgress ? (
                  <>
                    <ButtonSpinner size={12} color="white" />
                    Suspending...
                  </>
                ) : (
                  <>
                    ⏸️ Suspend
                  </>
                )}
              </button>
              <button
                className="process-control-btn resume-btn"
                onClick={handleResumeSelected}
                disabled={isControlInProgress}
                title="선택된 프로세스 재개"
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  border: '1px solid var(--color-success)',
                  backgroundColor: 'var(--color-success)',
                  color: 'white',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-success-dark)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-success)';
                }}
              >
                {isControlInProgress ? (
                  <>
                    <ButtonSpinner size={12} color="white" />
                    Resuming...
                  </>
                ) : (
                  <>
                    ▶️ Resume
                  </>
                )}
              </button>
              <button
                className="process-control-btn clear-btn"
                onClick={clearSelection}
                title="선택 해제"
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  marginLeft: 'auto'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-background)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu.visible && (
        <div
          className="context-menu"
          role="menu"
          aria-label={`${contextMenu.processName} 프로세스 제어 메뉴`}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            minWidth: '180px',
            padding: '0.5rem 0'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            role="menuitem"
            tabIndex={-1}
            aria-disabled="true"
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              borderBottom: '1px solid var(--color-border)',
              marginBottom: '0.25rem'
            }}
          >
            {contextMenu.processName}
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 400,
              color: 'var(--color-text-secondary)',
              marginTop: '0.125rem'
            }}>
              PID: {contextMenu.pid}
            </div>
          </div>
          
          <button
            className="context-menu-item"
            role="menuitem"
            onClick={() => handleContextAction('kill')}
            disabled={isControlInProgress}
            aria-label={`${contextMenu.processName} 프로세스 종료`}
            style={{
              width: '100%',
              padding: '0.5rem 1rem',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: 'var(--color-error)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-background-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span role="img" aria-label="종료">🛑</span> Kill Process
          </button>
          
          <button
            className="context-menu-item"
            role="menuitem"
            onClick={() => handleContextAction('suspend')}
            disabled={isControlInProgress}
            aria-label={`${contextMenu.processName} 프로세스 일시정지`}
            style={{
              width: '100%',
              padding: '0.5rem 1rem',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: 'var(--color-warning)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-background-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span role="img" aria-label="일시정지">⏸️</span> Suspend Process
          </button>
          
          <button
            className="context-menu-item"
            role="menuitem"
            onClick={() => handleContextAction('resume')}
            disabled={isControlInProgress}
            aria-label={`${contextMenu.processName} 프로세스 재개`}
            style={{
              width: '100%',
              padding: '0.5rem 1rem',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-background-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ▶️ Resume Process
          </button>

          <div style={{
            height: '1px',
            backgroundColor: 'var(--color-border)',
            margin: '0.25rem 0'
          }} />

          <div style={{
            padding: '0.25rem 1rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)'
          }}>
            Set Priority
          </div>
          
          {['high', 'above_normal', 'normal', 'below_normal', 'low'].map((priority) => (
            <button
              key={priority}
              className="context-menu-item"
              onClick={() => handleContextAction('priority', priority)}
              disabled={isControlInProgress}
              style={{
                width: '100%',
                padding: '0.375rem 1.5rem',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.8rem',
                color: 'var(--color-text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-background-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {priority === 'high' && '🔴'}
              {priority === 'above_normal' && '🟠'}
              {priority === 'normal' && '🟡'}
              {priority === 'below_normal' && '🔵'}
              {priority === 'low' && '🟢'}
              {priority.replace('_', ' ').toUpperCase()}
            </button>
          ))}
        </div>
      )}
      
      {widget && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          title="GPU Process Monitor Widget 설정"
        >
          <div className="settings-section">
            <h4 style={{ 
              margin: '0 0 var(--spacing-sm) 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)'
            }}>
              Configuration Presets
            </h4>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
              gap: '0.5rem',
              marginBottom: '1rem'
            }}>
              <button
                type="button"
                onClick={() => applyPreset('performance')}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-background)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
              >
                🚀 Performance
              </button>
              
              <button
                type="button"
                onClick={() => applyPreset('gaming')}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-background)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
              >
                🎮 Gaming
              </button>
              
              <button
                type="button"
                onClick={() => applyPreset('developer')}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-background)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
              >
                👨‍💻 Developer
              </button>
              
              <button
                type="button"
                onClick={() => applyPreset('minimal')}
                style={{
                  padding: '0.5rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-background)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
              >
                📱 Minimal
              </button>
            </div>
            
            <button
              type="button"
              onClick={resetToDefaults}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'transparent',
                color: 'var(--color-warning)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 500,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-warning)';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--color-warning)';
              }}
            >
              🔄 Reset to Default Settings
            </button>
            
            <div style={{ 
              fontSize: '0.7rem', 
              color: 'var(--color-text-secondary)', 
              marginTop: '0.5rem',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              Presets will override current settings
            </div>
          </div>
          
          <div className="settings-section">
            <label>
              Process count:
              <select 
                value={processCount}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuProcessCount: parseInt(e.target.value) });
                }}
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
              </select>
            </label>
            <label>
              Sort by:
              <select 
                value={sortBy}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuSortBy: e.target.value as typeof sortBy });
                }}
              >
                <option value="gpu_usage">GPU Usage</option>
                <option value="gpu_memory">GPU Memory</option>
                <option value="name">Process Name</option>
                <option value="pid">Process ID</option>
                <option value="type">Process Type</option>
                <option value="status">Process Status</option>
              </select>
            </label>
            <label>
              Sort order:
              <select 
                value={sortOrder}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuSortOrder: e.target.value as 'asc' | 'desc' });
                }}
              >
                <option value="desc">Descending (High to Low)</option>
                <option value="asc">Ascending (Low to High)</option>
              </select>
            </label>
          </div>
          
          <div className="settings-section">
            <h4 style={{ 
              margin: '0 0 var(--spacing-sm) 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)'
            }}>
              Process Filtering
            </h4>
            
            <label>
              <input 
                type="checkbox" 
                checked={filterEnabled}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuFilterEnabled: e.target.checked });
                }}
              />
              Enable filtering
            </label>
            
            {filterEnabled && (
              <>
                <label>
                  GPU usage threshold:
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={usageThreshold}
                      onChange={(e) => {
                        const { actions } = useDashboardStore.getState();
                        actions.updateWidgetConfig(widgetId, { gpuUsageThreshold: parseInt(e.target.value) });
                      }}
                      style={{ flex: 1 }}
                    />
                    <span style={{ 
                      minWidth: '3rem',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      fontFamily: 'var(--font-mono, monospace)',
                      textAlign: 'right'
                    }}>
                      {usageThreshold}%
                    </span>
                  </div>
                </label>
                
                <label>
                  GPU memory threshold:
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <input 
                      type="range"
                      min="50"
                      max="2000"
                      step="50"
                      value={memoryThreshold}
                      onChange={(e) => {
                        const { actions } = useDashboardStore.getState();
                        actions.updateWidgetConfig(widgetId, { gpuMemoryThreshold: parseInt(e.target.value) });
                      }}
                      style={{ flex: 1 }}
                    />
                    <span style={{ 
                      minWidth: '4rem',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      fontFamily: 'var(--font-mono, monospace)',
                      textAlign: 'right'
                    }}>
                      {memoryThreshold}MB
                    </span>
                  </div>
                </label>
                
                <label>
                  Filter condition:
                  <select 
                    value={filterType}
                    onChange={(e) => {
                      const { actions } = useDashboardStore.getState();
                      actions.updateWidgetConfig(widgetId, { gpuFilterType: e.target.value as 'and' | 'or' });
                    }}
                  >
                    <option value="or">Either condition (OR)</option>
                    <option value="and">Both conditions (AND)</option>
                  </select>
                </label>
              </>
            )}
          </div>
          
          <div className="settings-section">
            <h4 style={{ 
              margin: '0 0 var(--spacing-sm) 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)'
            }}>
              Real-time Updates
            </h4>
            
            <label>
              <input 
                type="checkbox" 
                checked={showUpdateIndicators}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowUpdateIndicators: e.target.checked });
                }}
              />
              Show update indicators
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={enableUpdateAnimations}
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuEnableUpdateAnimations: e.target.checked });
                }}
              />
              Enable update animations
            </label>
            
            <label>
              Update interval:
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <input 
                  type="range"
                  min="1000"
                  max="10000"
                  step="500"
                  value={config.gpuUpdateInterval || 2000}
                  onChange={(e) => {
                    const { actions } = useDashboardStore.getState();
                    actions.updateWidgetConfig(widgetId, { gpuUpdateInterval: parseInt(e.target.value) });
                  }}
                  style={{ flex: 1 }}
                />
                <span style={{ 
                  minWidth: '4rem',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  fontFamily: 'var(--font-mono, monospace)',
                  textAlign: 'right'
                }}>
                  {(config.gpuUpdateInterval || 2000)}ms
                </span>
              </div>
            </label>
            
            <div style={{ 
              fontSize: '0.75rem', 
              color: 'var(--color-text-secondary)', 
              marginTop: '0.5rem',
              padding: '0.5rem',
              backgroundColor: 'var(--color-background-secondary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)'
            }}>
              <strong>Visual Status Indicators:</strong>
              <div style={{ marginTop: '0.25rem', lineHeight: 1.4 }}>
                • <span style={{ color: 'var(--color-success)' }}>●</span> Running processes (pulsing animation)<br/>
                • <span style={{ color: 'var(--color-warning)' }}>●</span> Idle processes (blinking animation)<br/>
                • <span style={{ color: 'var(--color-error)' }}>●</span> Suspended processes (flashing animation)<br/>
                • 🔥 High GPU usage (&gt;95%) indicator<br/>
                • 💾 High memory usage (&gt;4GB) indicator
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h4 style={{ 
              margin: '0 0 var(--spacing-sm) 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)'
            }}>
              Visual Feedback
            </h4>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuShowStatusColors !== false} // default true
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowStatusColors: e.target.checked });
                }}
              />
              Show status colors
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuShowUsageGradients !== false} // default true
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowUsageGradients: e.target.checked });
                }}
              />
              Show usage gradients
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuShowProcessIcons !== false} // default true
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowProcessIcons: e.target.checked });
                }}
              />
              Show process icons
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuShowStatusAnimations !== false} // default true
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowStatusAnimations: e.target.checked });
                }}
              />
              Show status animations
            </label>
          </div>

          <div className="settings-section">
            <h4 style={{ 
              margin: '0 0 var(--spacing-sm) 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)'
            }}>
              Process Control
            </h4>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuEnableProcessControl !== false} // default true
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuEnableProcessControl: e.target.checked });
                }}
              />
              Enable process control
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuShowControlButtons !== false} // default true
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowControlButtons: e.target.checked });
                }}
              />
              Show control buttons
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuEnableContextMenu !== false} // default true
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuEnableContextMenu: e.target.checked });
                }}
              />
              Enable context menu (right-click)
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuRequireConfirmation !== false} // default true
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuRequireConfirmation: e.target.checked });
                }}
              />
              Require confirmation for actions
            </label>
          </div>

          <div className="settings-section">
            <h4 style={{ 
              margin: '0 0 var(--spacing-sm) 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)'
            }}>
              Display Options
            </h4>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuShowProcessPriority || false} // default false
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowProcessPriority: e.target.checked });
                }}
              />
              Show process priority
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuShowProcessCommand || false} // default false
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowProcessCommand: e.target.checked });
                }}
              />
              Show process command
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuShowLastUpdateTime || false} // default false
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuShowLastUpdateTime: e.target.checked });
                }}
              />
              Show last update time
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.gpuCompactView || false} // default false
                onChange={(e) => {
                  const { actions } = useDashboardStore.getState();
                  actions.updateWidgetConfig(widgetId, { gpuCompactView: e.target.checked });
                }}
              />
              Compact view
            </label>
          </div>
        </SettingsModal>
      )}

      {/* Confirmation Dialog */}
      {ConfirmComponent}
    </>
  );
};

// Main component with Error Boundary
const GpuProcessWidget: React.FC<WidgetProps> = (props) => {
  return (
    <GPUProcessErrorBoundary widgetId={props.widgetId}>
      <GpuProcessWidgetContent {...props} />
    </GPUProcessErrorBoundary>
  );
};

export default memo(GpuProcessWidget);