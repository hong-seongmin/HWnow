import React, { memo, useState, useRef, useEffect } from 'react';
import { useSystemResourceStore } from '../../stores/systemResourceStore';
import { useDashboardStore } from '../../stores/dashboardStore';
import { SettingsModal } from '../common/SettingsModal';
import { useConfirmDialog } from '../common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import { ButtonSpinner, InlineLoader } from '../common/LoadingSpinner';
import { killGPUProcess, suspendGPUProcess, resumeGPUProcess, setGPUProcessPriority } from '../../services/apiService';
import { onConnectionStatusChange, getWebSocketStatus, flushGPUProcessBatch } from '../../services/websocketService';
import { GPU_PROCESS_PRESETS, type GPUProcessPresetType } from '../../utils/gpuProcessWidgetDefaults';
import { formatProcessName, getRelativeTimeString, formatTime, getProcessTypeIcon, getGpuUsageClass, getMemoryUsageClass, getProcessTypeClass, getConnectionStatusClass, getProcessStatusWithPattern } from './gpu-process/processFormatters';
import type { SortKey } from './gpu-process/processFiltering';
import { useGpuProcessConfig } from './gpu-process/useGpuProcessConfig';
import { useGpuProcessMetrics } from './gpu-process/useGpuProcessMetrics';
import './widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const APPROXIMATE_PROCESS_NAME_CHAR_WIDTH = 7;
const PROCESS_NAME_PADDING_PX = 16;
const MIN_PROCESS_NAME_CHAR_LIMIT = 4;
const MAX_PROCESS_NAME_CHAR_LIMIT = 120;

const getProcessNameCharacterLimit = (size: string) => {
  switch (size) {
    case 'small':
      return 18;
    case 'medium':
      return 24;
    case 'large':
      return 32;
    case 'extra-large':
      return 40;
    case 'ultra-large':
      return 50;
    default:
      return 24;
  }
};

const GpuProcessWidget: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
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
  const [processNameCharacterLimit, setProcessNameCharacterLimit] = useState<number>(getProcessNameCharacterLimit('medium'));
  
  const { showConfirm, ConfirmComponent } = useConfirmDialog();
  const { showProcessSuccess, showProcessError, showBulkProcessResult } = useToast();
  
  const gpuProcesses = useSystemResourceStore((state) => state.data.gpu_processes);
  const [componentMountTime] = useState(Date.now());
  const computeProcessNameCharacterLimit = React.useCallback((categoryOverride?: string) => {
    const widgetElement = widgetRef.current;
    const targetCategory = categoryOverride ?? widgetSizeCategory;
    const baseLimit = getProcessNameCharacterLimit(targetCategory);
    let nextLimit = baseLimit;

    if (widgetElement) {
      const processNameElement =
        widgetElement.querySelector<HTMLElement>('.process-item .process-name-text') ??
        widgetElement.querySelector<HTMLElement>('.process-item .process-name') ??
        widgetElement.querySelector<HTMLElement>('.process-name-header');

      if (processNameElement) {
        const width = processNameElement.getBoundingClientRect().width;
        if (width > 0) {
          const effectiveWidth = Math.max(0, width - PROCESS_NAME_PADDING_PX);
          const widthBasedLimit = Math.floor(effectiveWidth / APPROXIMATE_PROCESS_NAME_CHAR_WIDTH);
          nextLimit = Math.max(MIN_PROCESS_NAME_CHAR_LIMIT, Math.min(MAX_PROCESS_NAME_CHAR_LIMIT, widthBasedLimit));
        }
      }
    }

    setProcessNameCharacterLimit((prev) => (prev === nextLimit ? prev : nextLimit));
  }, [widgetSizeCategory]);

  const {
    widget,
    config,
    processCount,
    sortBy,
    sortOrder,
    filterEnabled,
    usageThreshold,
    memoryThreshold,
    filterType,
    showUpdateIndicators,
    enableUpdateAnimations,
  } = useGpuProcessConfig(widgetId);

  const {
    sortedProcesses,
    filteredCount,
    totalCount,
  } = useGpuProcessMetrics(gpuProcesses, {
    filterEnabled,
    usageThreshold,
    memoryThreshold,
    filterType,
    sortBy: sortBy as SortKey,
    sortOrder,
    processCount,
  });


  // 초기 로드 ?�태 관�?
  React.useEffect(() => {
    if (gpuProcesses.length > 0 || Date.now() - componentMountTime > 5000) {
      setIsInitialLoad(false);
    }
  }, [gpuProcesses]);

  // ?�보???�비게이???�들�?
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ?�력 ?�드???�른 ?�소???�커?��? ?�을 ?�는 무시
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // ?�정 모달???�려?�으�?무시
      if (isSettingsOpen) {
        return;
      }

      const processes = sortedProcesses;
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
        // ?�커?��? ?�젯???�는지 ?�인
        const widgetElement = document.getElementById(`gpu-process-widget-${widgetId}`);
        if (widgetElement && !widgetElement.contains(document.activeElement)) {
          widgetElement.focus();
        }
      }
    };

    // 마우???�릭 ???�보???�비게이??모드 ?�제
    const handleMouseDown = () => {
      setIsKeyboardNavigation(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [focusedRowIndex, selectedProcesses, isSettingsOpen, widgetId, sortedProcesses]);

  // ?�커?�된 ?�이 변경될 ???�당 ?�로?�스�??�택 (?�택??
  React.useEffect(() => {
    if (isKeyboardNavigation && focusedRowIndex >= 0) {
      const processes = sortedProcesses;
      if (focusedRowIndex < processes.length) {
        // ?�크�?리더�??�한 aria-live ?�데?�트???�기??처리
      }
    }
  }, [focusedRowIndex, isKeyboardNavigation, sortedProcesses]);

  // Widget size detection for dynamic item sizing
  useEffect(() => {
    const detectWidgetSize = () => {
      if (!widgetRef.current) {
        return;
      }

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

      computeProcessNameCharacterLimit(category);
    };

    detectWidgetSize();

    if (!widgetRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(() => detectWidgetSize());
    resizeObserver.observe(widgetRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [widgetSizeCategory, computeProcessNameCharacterLimit]);

  useEffect(() => {
    computeProcessNameCharacterLimit();
  }, [sortedProcesses.length, computeProcessNameCharacterLimit]);

  // ?�보???�축???��?�??�시
  const showKeyboardShortcutsHelp = () => {
    const shortcuts = [
      '???? Navigate rows',
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

  // ?�보???�비게이?�을 ?�한 ?�로?�스 ?�택 ?��? ?�수
  const toggleProcessSelection = (pid: number) => {
    const newSelected = new Set(selectedProcesses);
    if (newSelected.has(pid)) {
      newSelected.delete(pid);
    } else {
      newSelected.add(pid);
    }
    setSelectedProcesses(newSelected);
  };

  // ?�보???�비게이?�을 ?�한 ?�로?�스 ?�션 ?�들??
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
            message: `?�로?�스 "${processName}" (PID: ${pid})??�? 종료?�시겠습?�까?\n\n???�업?� ?�돌�????�습?�다.`,
            type: 'danger',
            icon: '[X]',
            onConfirm: executeAction
          });
          break;
        case 'suspend':
          showConfirm({
            title: 'Process Suspension',
            message: `?�로?�스 "${processName}" (PID: ${pid})??�? ?�시?��??�시겠습?�까?`,
            type: 'warning',
            icon: '[PAUSE]',
            onConfirm: executeAction
          });
          break;
        case 'resume':
          showConfirm({
            title: 'Process Resume',
            message: `?�로?�스 "${processName}" (PID: ${pid})??�? ?�개?�시겠습?�까?`,
            type: 'default',
            icon: '[RESUME]',
            onConfirm: executeAction
          });
          break;
        case 'priority':
          showConfirm({
            title: 'Process Priority Change',
            message: `?�로?�스 "${processName}" (PID: ${pid})???�선?�위�?${priority}�?변경하?�겠?�니�?`,
            type: 'warning',
            icon: '[!]',
            onConfirm: executeAction
          });
          break;
      }
    } else {
      // No confirmation needed or multiple processes
      executeAction();
    }
  };

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
    // ?�재 ?�정???�전??초기??
    actions.updateWidgetConfig(widgetId, {
      // GPU ?�로?�스 관???�정�?초기?�하�??�른 ?�정?� 보존
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
      // 같�? 컬럼 ?�릭???�렬 ?�서 변�?
      const newSortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
      actions.updateWidgetConfig(widgetId, { gpuSortOrder: newSortOrder });
    } else {
      // ?�른 컬럼 ?�릭???�당 컬럼?�로 ?�렬 변�?
      actions.updateWidgetConfig(widgetId, { 
        gpuSortBy: newSortBy as SortKey,
        gpuSortOrder: 'desc' // ??컬럼?� 기본?�으�??�림차순
      });
    }
  };

  const getSortIcon = (columnKey: typeof sortBy) => {
    if (sortBy !== columnKey) return null;
    return sortOrder === 'desc' ? '▼' : '▲';
  };

  // ?�로?�스 ?�택 관???�들?�들
  const handleProcessSelect = (pid: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + ?�릭: ?�중 ?�택
      const newSelected = new Set(selectedProcesses);
      if (newSelected.has(pid)) {
        newSelected.delete(pid);
      } else {
        newSelected.add(pid);
      }
      setSelectedProcesses(newSelected);
    } else {
      // ?�반 ?�릭: ?�일 ?�택
      setSelectedProcesses(new Set([pid]));
    }
  };

  const handleSelectAll = () => {
    if (selectedProcesses.size === sortedProcesses.length) {
      // 모든 ?�로?�스가 ?�택??경우 ?�택 ?�제
      setSelectedProcesses(new Set());
    } else {
      // 모든 ?�로?�스 ?�택
      const allPids = new Set(sortedProcesses.map(p => p.pid));
      setSelectedProcesses(allPids);
    }
  };

  const clearSelection = () => {
    setSelectedProcesses(new Set());
  };

  // 컨텍?�트 메뉴 ?�들?�들
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
            message: `?�로?�스 "${processName}" (PID: ${pid})??�? 종료?�시겠습?�까?\n\n???�업?� ?�돌�????�습?�다.`,
            type: 'danger',
            icon: '[X]',
            onConfirm: executeAction
          });
          break;
        case 'suspend':
          showConfirm({
            title: 'Process Suspension',
            message: `?�로?�스 "${processName}" (PID: ${pid})??�? ?�시?��??�시겠습?�까?`,
            type: 'warning',
            icon: '[PAUSE]',
            onConfirm: executeAction
          });
          break;
        case 'resume':
          showConfirm({
            title: 'Process Resume',
            message: `?�로?�스 "${processName}" (PID: ${pid})??�? ?�개?�시겠습?�까?`,
            type: 'default',
            icon: '[RESUME]',
            onConfirm: executeAction
          });
          break;
        case 'priority':
          if (!priority) return;
          showConfirm({
            title: 'Change Process Priority',
            message: `?�로?�스 "${processName}" (PID: ${pid})???�선?�위�?${priority.toUpperCase()}�?변경하?�겠?�니�?`,
            type: 'warning',
            icon: '[!]',
            onConfirm: executeAction
          });
          break;
      }
    } else {
      // Execute without confirmation
      executeAction();
    }
  };

  // ?�역 ?�릭 ?�벤?�로 컨텍?�트 메뉴 ?�기�?
  React.useEffect(() => {
    const handleGlobalClick = () => hideContextMenu();
    if (contextMenu.visible) {
      document.addEventListener('click', handleGlobalClick);
      return () => document.removeEventListener('click', handleGlobalClick);
    }
  }, [contextMenu.visible]);

  // ?�시�??�이??변�?감�? �??�각???�드�?
  React.useEffect(() => {
    if (gpuProcesses.length === 0) return;
    
    // ?�데?�트 ?�간 �??�시�??�정
    setLastUpdateTime(Date.now());
    setUpdateIndicatorVisible(true);
    
    // ?�로?�스 변경사??감�?
    const updates = new Map<number, { timestamp: number; changed: boolean }>();
    
    gpuProcesses.forEach(process => {
      const prevProcess = previousProcesses.find(p => p.pid === process.pid);
      let hasChanges = false;
      
      if (!prevProcess) {
        // ?�로???�로?�스
        hasChanges = true;
      } else {
        // 기존 ?�로?�스??변경사??감�?
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
    
    // ?�데?�트 ?�시�??�동 ?��?
    const hideTimer = setTimeout(() => {
      setUpdateIndicatorVisible(false);
    }, 1500);
    
    return () => clearTimeout(hideTimer);
  }, [gpuProcesses]);

  // WebSocket ?�결 ?�태 모니?�링 (개선??버전)
  React.useEffect(() => {
    // WebSocket ?�결 ?�태 변�?콜백 ?�록
    const unsubscribe = onConnectionStatusChange((connected) => {
      setIsConnected(connected);
      if (!connected) {
      }
    });
    
    // ?�기?�인 ?�태 ?�인 (추�??�인 ?�전 ?�치)
    const statusCheckInterval = setInterval(() => {
      const status = getWebSocketStatus();
      
      // WebSocket ?�태?� ?�제 ?�이???�신 ?�태 비교
      const now = Date.now();
      const timeSinceUpdate = now - lastUpdateTime;
      
      if (status.connected && timeSinceUpdate > 15000) {
        console.warn('WebSocket connected but no data received for 15 seconds');
        // 배치 처리 강제 ?�행 ?�도
        flushGPUProcessBatch();
      }
      
      // ?�버�??�보 출력 (개발 ?�경?�서�?
      if (import.meta.env.DEV) {
        console.debug('WebSocket Status:', status);
      }
    }, 10000); // 10초마???�인
    
    return () => {
      unsubscribe();
      clearInterval(statusCheckInterval);
    };
  }, [lastUpdateTime]);

  // ?�로?�스 변�??�이?�이???�동 ?�거
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

  // ?�로?�스 ?�어 ?�들?�들
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
        
        // 결과 메시지 ?�시
        showBulkProcessResult(successCount, failureCount, 'kill', errors);
        
        // ?�택 ?�제
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process kill:', error);
        showProcessError('?�택???�로?�스??, 'kill', '?�상�?못한 ?�류가 발생?�습?�다.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToKill.length === 1 
        ? `?�로?�스 ${processesToKill[0]}??�? 종료?�시겠습?�까?\n\n???�업?� ?�돌�????�습?�다.`
        : `?�택??${processesToKill.length}�??�로?�스�?모두 종료?�시겠습?�까?\n\n???�업?� ?�돌�????�습?�다.`;
        
      showConfirm({
        title: 'Kill Selected Processes',
        message,
        type: 'danger',
        icon: '[X]',
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
        
        // 결과 메시지 ?�시
        showBulkProcessResult(successCount, failureCount, 'suspend', errors);
        
        // ?�택 ?�제
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process suspend:', error);
        showProcessError('?�택???�로?�스??, 'suspend', '?�상�?못한 ?�류가 발생?�습?�다.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToSuspend.length === 1 
        ? `?�로?�스 ${processesToSuspend[0]}??�? ?�시?��??�시겠습?�까?`
        : `?�택??${processesToSuspend.length}�??�로?�스�?모두 ?�시?��??�시겠습?�까?`;
        
      showConfirm({
        title: 'Suspend Selected Processes',
        message,
        type: 'warning',
        icon: '[PAUSE]',
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
        
        // 결과 메시지 ?�시
        showBulkProcessResult(successCount, failureCount, 'resume', errors);
        
        // ?�택 ?�제
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process resume:', error);
        showProcessError('?�택???�로?�스??, 'resume', '?�상�?못한 ?�류가 발생?�습?�다.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToResume.length === 1 
        ? `?�로?�스 ${processesToResume[0]}??�? ?�개?�시겠습?�까?`
        : `?�택??${processesToResume.length}�??�로?�스�?모두 ?�개?�시겠습?�까?`;
        
      showConfirm({
        title: 'Resume Selected Processes',
        message,
        type: 'default',
        icon: '[RESUME]',
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
                <title id="gpu-icon-title">GPU ?�이�?/title>
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
            
            {/* ?�시�??�데?�트 ?�태 ?�시�?*/}
            {showUpdateIndicators && (
              <div 
                role="status" 
                aria-live="polite"
                aria-label={`?�결 ?�태: ${isConnected ? '?�결?? : '?�결 ?�제??}, 마�?�??�데?�트: ${lastUpdateTime > 0 ? getRelativeTimeString(lastUpdateTime) : '?�음'}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  marginLeft: '0.5rem',
                  fontSize: '0.7rem',
                  color: 'var(--color-text-secondary)'
                }}
              >
                {/* ?�결 ?�태 ?�시�?*/}
                <div 
                  role="img"
                  aria-label={isConnected ? '?�시�??�결 ?�태: ?�결?? : '?�시�??�결 ?�태: ?�결 ?�제??}
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
                
                {/* 마�?�??�데?�트 ?�간 */}
                {lastUpdateTime > 0 && (
                  <span 
                    style={{ 
                      fontFamily: 'var(--font-mono, monospace)',
                      opacity: 0.8
                    }}
                    title={`Last update: ${formatTime(lastUpdateTime)}`}
                    aria-label={`마�?�??�데?�트 ?�간: ${formatTime(lastUpdateTime)}`}
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
                  {sortedProcesses.length}/{filteredCount} filtered (of {totalCount}) by {sortBy.toUpperCase().replace('_', ' ')} {sortOrder === 'desc' ? '▼' : '▲'}
                </>
              ) : (
                <>
                  Top {processCount} by {sortBy.toUpperCase().replace('_', ' ')} {sortOrder === 'desc' ? '▼' : '▲'}
                </>
              )}
            </span>
          </div>
          
          {/* ?�체 ?�태 ?�약 */}
          {sortedProcesses.length > 0 && (
            <div 
              role="complementary" 
              aria-label="?�로?�스 ?�태 ?�약"
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
                  aria-label={`?�행 중인 ?�로?�스: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'running').length}�?}
                >
                  <div 
                    role="img"
                    aria-label="?�행 �??�태 ?�시�?
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
                  aria-label={`?��?중인 ?�로?�스: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'idle').length}�?}
                >
                  <div 
                    role="img"
                    aria-label="?��?�??�태 ?�시�?
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
                  aria-label={`?�시?��????�로?�스: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'suspended').length}�?}
                >
                  <div 
                    role="img"
                    aria-label="?�시?��? ?�태 ?�시�?
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
                  aria-label={`?��? GPU ?�용�??�로?�스: ${sortedProcesses.filter(p => p.gpu_usage > 90).length}�?}
                >
                  <span role="img" aria-label="?��? ?�용�??�시">?��</span> {sortedProcesses.filter(p => p.gpu_usage > 90).length}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>High Usage</div>
              </div>
            </div>
          )}
          
          <div 
            className="process-list" 
            role="table" 
            aria-label="GPU ?�로?�스 목록"
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
                  ?��
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
                  aria-label="?�이�??�더"
                >
                  <div 
                    role="columnheader"
                    aria-label="모든 ?�로?�스 ?�택/?�제"
                    className="process-select-header"
                    title="Select all processes"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProcesses.size > 0 && selectedProcesses.size === sortedProcesses.length}
                      onChange={handleSelectAll}
                      aria-label={`모든 ?�로?�스 ?�택 (?�재 ${selectedProcesses.size}/${sortedProcesses.length}�??�택??`}
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
                    aria-label="?�로?�스 ?�름?�로 ?�렬"
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
                    aria-label="?�로?�스 ID�??�렬"
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
                    aria-label="GPU ?�용률로 ?�렬"
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
                    aria-label="GPU 메모�??�용?�으�??�렬"
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
                    aria-label="?�로?�스 ?�?�으�??�렬"
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
                  const truncatedProcessName = formatProcessName(process.name, processNameCharacterLimit);
                  const isProcessNameTruncated = truncatedProcessName !== process.name;
                  
                  return (
                  <div 
                    key={`${process.pid}-${index}`} 
                    className={`process-item ${statusClass} ${usageClass} ${memoryClass} ${typeClass} ${selectedProcesses.has(process.pid) ? 'process-selected' : ''} ${hasRecentChanges && enableUpdateAnimations ? 'process-updated' : ''} ${focusedRowIndex === index && isKeyboardNavigation ? 'process-keyboard-focused' : ''}`}
                    title={`${process.name} (PID: ${process.pid})\nStatus: ${process.status}\nGPU Usage: ${process.gpu_usage.toFixed(1)}%\nGPU Memory: ${process.gpu_memory.toFixed(0)}MB${updateInfo ? `\nLast updated: ${formatTime(updateInfo.timestamp)}` : ''}`}
                    onClick={(e) => handleProcessSelect(process.pid, e)}
                    onContextMenu={(e) => handleContextMenu(e, process.pid, process.name)}
                    tabIndex={0}
                    role="row"
                    aria-rowindex={index + 1}
                    aria-selected={selectedProcesses.has(process.pid)}
                    aria-label={`${index + 1}번째 ?�로?�스: ${process.name}, PID ${process.pid}, GPU ?�용�?${process.gpu_usage.toFixed(1)}%, 메모�?${process.gpu_memory.toFixed(0)}MB, ?�태 ${process.status}`}
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
                    <div className="process-select" role="gridcell" aria-label="?�로?�스 ?�택">
                      <input
                        type="checkbox"
                        checked={selectedProcesses.has(process.pid)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleProcessSelect(process.pid, e as any);
                        }}
                        aria-label={`${process.name} ?�로?�스 ?�택`}
                        style={{
                          margin: 0,
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                    <div 
                      className="process-name" 
                      role="gridcell"
                      style={{ minWidth: 0, cursor: isProcessNameTruncated ? 'help' : 'default' }}
                      aria-label={`?�로?�스 ?�름: ${process.name}`}
                      title={isProcessNameTruncated ? `${process.name}\nCommand: ${process.command}` : undefined}
                    >
                      <span 
                        className="process-type-icon"
                        role="img"
                        aria-label={`?�로?�스 ?�형: ${process.type}`}
                      >
                        {getProcessTypeIcon(process.type, process.name)}
                      </span>
                      <span className="process-name-text">
                        {truncatedProcessName}
                      </span>
                    </div>
                    <div 
                      className="process-pid"
                      role="gridcell"
                      aria-label={`?�로?�스 ID: ${process.pid}`}
                    >
                      {process.pid}
                    </div>
                    <div 
                      className="process-gpu"
                      role="gridcell"
                      aria-label={`GPU ?�용�? ${process.gpu_usage.toFixed(1)}?�센??}
                      style={{ 
                        color: process.gpu_usage > 90 ? 'var(--color-error)' : 
                               process.gpu_usage > 70 ? 'var(--color-warning)' : 
                               process.gpu_usage > 30 ? 'var(--color-info)' :
                               'var(--color-success)',
                        fontWeight: process.gpu_usage > 80 ? '700' : '500',
                        position: 'relative'
                      }}
                      title={`GPU Usage: ${process.gpu_usage.toFixed(1)}%`}
                    >
                      {process.gpu_usage > 95 && (
                        <span 
                          role="img" 
                          aria-label="초고?�용�?경고"
                          style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-8px',
                            fontSize: '8px',
                            animation: 'pulse 1s infinite'
                          }}
                        >?��</span>
                      )}
                      {process.gpu_usage.toFixed(1)}%
                    </div>
                    <div 
                      className="process-memory"
                      role="gridcell"
                      aria-label={`GPU 메모�??�용?? ${process.gpu_memory < 1024 ? `${process.gpu_memory.toFixed(0)}메�?바이?? : `${(process.gpu_memory / 1024).toFixed(1)}기�?바이??}`}
                      style={{ 
                        color: process.gpu_memory > 2048 ? 'var(--color-error)' : 
                               process.gpu_memory > 1024 ? 'var(--color-warning)' : 
                               process.gpu_memory > 512 ? 'var(--color-info)' :
                               'var(--color-success)',
                        fontWeight: process.gpu_memory > 1536 ? '700' : '500',
                        position: 'relative'
                      }}
                      title={`GPU Memory: ${process.gpu_memory.toFixed(0)}MB`}
                    >
                      {process.gpu_memory > 4096 && (
                        <span 
                          role="img" 
                          aria-label="고용??메모�?경고"
                          style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-8px',
                            fontSize: '8px',
                            animation: 'pulse 1s infinite'
                          }}
                        >?��</span>
                      )}
                      {process.gpu_memory < 1024 
                        ? `${process.gpu_memory.toFixed(0)}MB`
                        : `${(process.gpu_memory / 1024).toFixed(1)}GB`
                      }
                    </div>
                    <div 
                      className={`process-type ${getProcessTypeClass(process.type)}`}
                      role="gridcell"
                      aria-label={`?�로?�스 ?�?? ${process.type}, ?�태: ${process.status}`}
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
                          aria-label={`?�로?�스 ?�형: ${process.type}`}
                        >
                          {getProcessTypeIcon(process.type, process.name)}
                        </span>
                        <span style={{ fontSize: '0.75rem' }}>{process.type}</span>
                        
                        {/* ?�태 ?�시 ??*/}
                        <div 
                          role="img"
                          aria-label={`?�로?�스 ?�태: ${process.status}`}
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
          
          {/* ?�로?�스 ?�어 버튼 그룹 */}
          {selectedProcesses.size > 0 && (
            <div 
              className="process-control-buttons" 
              role="toolbar"
              aria-label="?�택???�로?�스 ?�어 ?�구"
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
                aria-label={`${selectedProcesses.size}개의 ?�로?�스가 ?�택??}
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  marginRight: 'var(--spacing-sm)'
                }}
              >
                {selectedProcesses.size}�??�로?�스 ?�택??
              </div>
              <button
                className="process-control-btn kill-btn"
                onClick={handleKillSelected}
                disabled={isControlInProgress}
                aria-label={`?�택??${selectedProcesses.size}�??�로?�스 종료`}
                title="?�택???�로?�스 종료"
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
                    [X] Kill
                  </>
                )}
              </button>
              <button
                className="process-control-btn suspend-btn"
                onClick={handleSuspendSelected}
                disabled={isControlInProgress}
                title="?�택???�로?�스 ?�시?��?"
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
                    [PAUSE] Suspend
                  </>
                )}
              </button>
              <button
                className="process-control-btn resume-btn"
                onClick={handleResumeSelected}
                disabled={isControlInProgress}
                title="?�택???�로?�스 ?�개"
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
                    [RESUME] Resume
                  </>
                )}
              </button>
              <button
                className="process-control-btn clear-btn"
                onClick={clearSelection}
                title="?�택 ?�제"
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

      {/* 컨텍?�트 메뉴 */}
      {contextMenu.visible && (
        <div
          className="context-menu"
          role="menu"
          aria-label={`${contextMenu.processName} ?�로?�스 ?�어 메뉴`}
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
            aria-label={`${contextMenu.processName} ?�로?�스 종료`}
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
            <span role="img" aria-label="종료">[X]</span> Kill Process
          </button>
          
          <button
            className="context-menu-item"
            role="menuitem"
            onClick={() => handleContextAction('suspend')}
            disabled={isControlInProgress}
            aria-label={`${contextMenu.processName} ?�로?�스 ?�시?��?`}
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
            <span role="img" aria-label="?�시?��?">[PAUSE]</span> Suspend Process
          </button>
          
          <button
            className="context-menu-item"
            role="menuitem"
            onClick={() => handleContextAction('resume')}
            disabled={isControlInProgress}
            aria-label={`${contextMenu.processName} ?�로?�스 ?�개`}
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
            [RESUME] Resume Process
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
              {priority === 'high' && '?��'}
              {priority === 'above_normal' && '?��'}
              {priority === 'normal' && '?��'}
              {priority === 'below_normal' && '?��'}
              {priority === 'low' && '?��'}
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
          title="GPU Process Monitor Widget ?�정"
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
                ?? Performance
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
                ?�� Gaming
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
                ?��?��?Developer
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
                ?�� Minimal
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
              ?�� Reset to Default Settings
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
                  actions.updateWidgetConfig(widgetId, { gpuSortBy: e.target.value as SortKey });
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
                ??<span style={{ color: 'var(--color-success)' }}>??/span> Running processes (pulsing animation)<br/>
                ??<span style={{ color: 'var(--color-warning)' }}>??/span> Idle processes (blinking animation)<br/>
                ??<span style={{ color: 'var(--color-error)' }}>??/span> Suspended processes (flashing animation)<br/>
                ???�� High GPU usage (&gt;95%) indicator<br/>
                ???�� High memory usage (&gt;4GB) indicator
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

export default memo(GpuProcessWidget);
