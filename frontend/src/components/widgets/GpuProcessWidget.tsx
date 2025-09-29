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


  // Ï¥àÍ∏∞ Î°úÎìú ?ÅÌÉú Í¥ÄÎ¶?
  React.useEffect(() => {
    if (gpuProcesses.length > 0 || Date.now() - componentMountTime > 5000) {
      setIsInitialLoad(false);
    }
  }, [gpuProcesses]);

  // ?§Î≥¥???§ÎπÑÍ≤åÏù¥???∏Îì§Îß?
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ?ÖÎ†• ?ÑÎìú???§Î•∏ ?îÏÜå???¨Ïª§?§Í? ?àÏùÑ ?åÎäî Î¨¥Ïãú
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // ?§Ï†ï Î™®Îã¨???¥Î†§?àÏúºÎ©?Î¨¥Ïãú
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
        // ?¨Ïª§?§Í? ?ÑÏ†Ø???àÎäîÏßÄ ?ïÏù∏
        const widgetElement = document.getElementById(`gpu-process-widget-${widgetId}`);
        if (widgetElement && !widgetElement.contains(document.activeElement)) {
          widgetElement.focus();
        }
      }
    };

    // ÎßàÏö∞???¥Î¶≠ ???§Î≥¥???§ÎπÑÍ≤åÏù¥??Î™®Îìú ?¥Ï†ú
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

  // ?¨Ïª§?§Îêú ?âÏù¥ Î≥ÄÍ≤ΩÎê† ???¥Îãπ ?ÑÎ°ú?∏Ïä§Î•??†ÌÉù (?†ÌÉù??
  React.useEffect(() => {
    if (isKeyboardNavigation && focusedRowIndex >= 0) {
      const processes = sortedProcesses;
      if (focusedRowIndex < processes.length) {
        // ?§ÌÅ¨Î¶?Î¶¨ÎçîÎ•??ÑÌïú aria-live ?ÖÎç∞?¥Ìä∏???¨Í∏∞??Ï≤òÎ¶¨
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

  // ?§Î≥¥???®Ï∂ï???ÑÏ?Îß??úÏãú
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

  // ?§Î≥¥???§ÎπÑÍ≤åÏù¥?òÏùÑ ?ÑÌïú ?ÑÎ°ú?∏Ïä§ ?†ÌÉù ?†Í? ?®Ïàò
  const toggleProcessSelection = (pid: number) => {
    const newSelected = new Set(selectedProcesses);
    if (newSelected.has(pid)) {
      newSelected.delete(pid);
    } else {
      newSelected.add(pid);
    }
    setSelectedProcesses(newSelected);
  };

  // ?§Î≥¥???§ÎπÑÍ≤åÏù¥?òÏùÑ ?ÑÌïú ?ÑÎ°ú?∏Ïä§ ?°ÏÖò ?∏Îì§??
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
            message: `?ÑÎ°ú?∏Ïä§ "${processName}" (PID: ${pid})??Î•? Ï¢ÖÎ£å?òÏãúÍ≤†Ïäµ?àÍπå?\n\n???ëÏóÖ?Ä ?òÎèåÎ¶????ÜÏäµ?àÎã§.`,
            type: 'danger',
            icon: '[X]',
            onConfirm: executeAction
          });
          break;
        case 'suspend':
          showConfirm({
            title: 'Process Suspension',
            message: `?ÑÎ°ú?∏Ïä§ "${processName}" (PID: ${pid})??Î•? ?ºÏãú?ïÏ??òÏãúÍ≤†Ïäµ?àÍπå?`,
            type: 'warning',
            icon: '[PAUSE]',
            onConfirm: executeAction
          });
          break;
        case 'resume':
          showConfirm({
            title: 'Process Resume',
            message: `?ÑÎ°ú?∏Ïä§ "${processName}" (PID: ${pid})??Î•? ?¨Í∞ú?òÏãúÍ≤†Ïäµ?àÍπå?`,
            type: 'default',
            icon: '[RESUME]',
            onConfirm: executeAction
          });
          break;
        case 'priority':
          showConfirm({
            title: 'Process Priority Change',
            message: `?ÑÎ°ú?∏Ïä§ "${processName}" (PID: ${pid})???∞ÏÑ†?úÏúÑÎ•?${priority}Î°?Î≥ÄÍ≤ΩÌïò?úÍ≤†?µÎãàÍπ?`,
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
    // ?ÑÏû¨ ?§Ï†ï???ÑÏ†Ñ??Ï¥àÍ∏∞??
    actions.updateWidgetConfig(widgetId, {
      // GPU ?ÑÎ°ú?∏Ïä§ Í¥Ä???§Ï†ïÎß?Ï¥àÍ∏∞?îÌïòÍ≥??§Î•∏ ?§Ï†ï?Ä Î≥¥Ï°¥
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
      // Í∞ôÏ? Ïª¨Îüº ?¥Î¶≠???ïÎ†¨ ?úÏÑú Î≥ÄÍ≤?
      const newSortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
      actions.updateWidgetConfig(widgetId, { gpuSortOrder: newSortOrder });
    } else {
      // ?§Î•∏ Ïª¨Îüº ?¥Î¶≠???¥Îãπ Ïª¨Îüº?ºÎ°ú ?ïÎ†¨ Î≥ÄÍ≤?
      actions.updateWidgetConfig(widgetId, { 
        gpuSortBy: newSortBy as SortKey,
        gpuSortOrder: 'desc' // ??Ïª¨Îüº?Ä Í∏∞Î≥∏?ÅÏúºÎ°??¥Î¶ºÏ∞®Ïàú
      });
    }
  };

  const getSortIcon = (columnKey: typeof sortBy) => {
    if (sortBy !== columnKey) return null;
    return sortOrder === 'desc' ? '‚ñº' : '‚ñ≤';
  };

  // ?ÑÎ°ú?∏Ïä§ ?†ÌÉù Í¥Ä???∏Îì§?¨Îì§
  const handleProcessSelect = (pid: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + ?¥Î¶≠: ?§Ï§ë ?†ÌÉù
      const newSelected = new Set(selectedProcesses);
      if (newSelected.has(pid)) {
        newSelected.delete(pid);
      } else {
        newSelected.add(pid);
      }
      setSelectedProcesses(newSelected);
    } else {
      // ?ºÎ∞ò ?¥Î¶≠: ?®Ïùº ?†ÌÉù
      setSelectedProcesses(new Set([pid]));
    }
  };

  const handleSelectAll = () => {
    if (selectedProcesses.size === sortedProcesses.length) {
      // Î™®Îì† ?ÑÎ°ú?∏Ïä§Í∞Ä ?†ÌÉù??Í≤ΩÏö∞ ?†ÌÉù ?¥Ï†ú
      setSelectedProcesses(new Set());
    } else {
      // Î™®Îì† ?ÑÎ°ú?∏Ïä§ ?†ÌÉù
      const allPids = new Set(sortedProcesses.map(p => p.pid));
      setSelectedProcesses(allPids);
    }
  };

  const clearSelection = () => {
    setSelectedProcesses(new Set());
  };

  // Ïª®ÌÖç?§Ìä∏ Î©îÎâ¥ ?∏Îì§?¨Îì§
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
            message: `?ÑÎ°ú?∏Ïä§ "${processName}" (PID: ${pid})??Î•? Ï¢ÖÎ£å?òÏãúÍ≤†Ïäµ?àÍπå?\n\n???ëÏóÖ?Ä ?òÎèåÎ¶????ÜÏäµ?àÎã§.`,
            type: 'danger',
            icon: '[X]',
            onConfirm: executeAction
          });
          break;
        case 'suspend':
          showConfirm({
            title: 'Process Suspension',
            message: `?ÑÎ°ú?∏Ïä§ "${processName}" (PID: ${pid})??Î•? ?ºÏãú?ïÏ??òÏãúÍ≤†Ïäµ?àÍπå?`,
            type: 'warning',
            icon: '[PAUSE]',
            onConfirm: executeAction
          });
          break;
        case 'resume':
          showConfirm({
            title: 'Process Resume',
            message: `?ÑÎ°ú?∏Ïä§ "${processName}" (PID: ${pid})??Î•? ?¨Í∞ú?òÏãúÍ≤†Ïäµ?àÍπå?`,
            type: 'default',
            icon: '[RESUME]',
            onConfirm: executeAction
          });
          break;
        case 'priority':
          if (!priority) return;
          showConfirm({
            title: 'Change Process Priority',
            message: `?ÑÎ°ú?∏Ïä§ "${processName}" (PID: ${pid})???∞ÏÑ†?úÏúÑÎ•?${priority.toUpperCase()}Î°?Î≥ÄÍ≤ΩÌïò?úÍ≤†?µÎãàÍπ?`,
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

  // ?ÑÏó≠ ?¥Î¶≠ ?¥Î≤§?∏Î°ú Ïª®ÌÖç?§Ìä∏ Î©îÎâ¥ ?®Í∏∞Í∏?
  React.useEffect(() => {
    const handleGlobalClick = () => hideContextMenu();
    if (contextMenu.visible) {
      document.addEventListener('click', handleGlobalClick);
      return () => document.removeEventListener('click', handleGlobalClick);
    }
  }, [contextMenu.visible]);

  // ?§ÏãúÍ∞??∞Ïù¥??Î≥ÄÍ≤?Í∞êÏ? Î∞??úÍ∞Å???ºÎìúÎ∞?
  React.useEffect(() => {
    if (gpuProcesses.length === 0) return;
    
    // ?ÖÎç∞?¥Ìä∏ ?úÍ∞Ñ Î∞??úÏãúÍ∏??§Ï†ï
    setLastUpdateTime(Date.now());
    setUpdateIndicatorVisible(true);
    
    // ?ÑÎ°ú?∏Ïä§ Î≥ÄÍ≤ΩÏÇ¨??Í∞êÏ?
    const updates = new Map<number, { timestamp: number; changed: boolean }>();
    
    gpuProcesses.forEach(process => {
      const prevProcess = previousProcesses.find(p => p.pid === process.pid);
      let hasChanges = false;
      
      if (!prevProcess) {
        // ?àÎ°ú???ÑÎ°ú?∏Ïä§
        hasChanges = true;
      } else {
        // Í∏∞Ï°¥ ?ÑÎ°ú?∏Ïä§??Î≥ÄÍ≤ΩÏÇ¨??Í∞êÏ?
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
    
    // ?ÖÎç∞?¥Ìä∏ ?úÏãúÍ∏??êÎèô ?®Í?
    const hideTimer = setTimeout(() => {
      setUpdateIndicatorVisible(false);
    }, 1500);
    
    return () => clearTimeout(hideTimer);
  }, [gpuProcesses]);

  // WebSocket ?∞Í≤∞ ?ÅÌÉú Î™®Îãà?∞ÎßÅ (Í∞úÏÑ†??Î≤ÑÏ†Ñ)
  React.useEffect(() => {
    // WebSocket ?∞Í≤∞ ?ÅÌÉú Î≥ÄÍ≤?ÏΩúÎ∞± ?±Î°ù
    const unsubscribe = onConnectionStatusChange((connected) => {
      setIsConnected(connected);
      if (!connected) {
      }
    });
    
    // ?ïÍ∏∞?ÅÏù∏ ?ÅÌÉú ?ïÏù∏ (Ï∂îÍ??ÅÏù∏ ?àÏ†Ñ ?•Ïπò)
    const statusCheckInterval = setInterval(() => {
      const status = getWebSocketStatus();
      
      // WebSocket ?ÅÌÉú?Ä ?§Ï†ú ?∞Ïù¥???òÏã† ?ÅÌÉú ÎπÑÍµê
      const now = Date.now();
      const timeSinceUpdate = now - lastUpdateTime;
      
      if (status.connected && timeSinceUpdate > 15000) {
        console.warn('WebSocket connected but no data received for 15 seconds');
        // Î∞∞Ïπò Ï≤òÎ¶¨ Í∞ïÏ†ú ?§Ìñâ ?úÎèÑ
        flushGPUProcessBatch();
      }
      
      // ?îÎ≤ÑÍ∑??ïÎ≥¥ Ï∂úÎ†• (Í∞úÎ∞ú ?òÍ≤Ω?êÏÑúÎß?
      if (import.meta.env.DEV) {
        console.debug('WebSocket Status:', status);
      }
    }, 10000); // 10Ï¥àÎßà???ïÏù∏
    
    return () => {
      unsubscribe();
      clearInterval(statusCheckInterval);
    };
  }, [lastUpdateTime]);

  // ?ÑÎ°ú?∏Ïä§ Î≥ÄÍ≤??òÏù¥?ºÏù¥???êÎèô ?úÍ±∞
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

  // ?ÑÎ°ú?∏Ïä§ ?úÏñ¥ ?∏Îì§?¨Îì§
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
        
        // Í≤∞Í≥º Î©îÏãúÏßÄ ?úÏãú
        showBulkProcessResult(successCount, failureCount, 'kill', errors);
        
        // ?†ÌÉù ?¥Ï†ú
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process kill:', error);
        showProcessError('?†ÌÉù???ÑÎ°ú?∏Ïä§??, 'kill', '?àÏÉÅÏπ?Î™ªÌïú ?§Î•òÍ∞Ä Î∞úÏÉù?àÏäµ?àÎã§.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToKill.length === 1 
        ? `?ÑÎ°ú?∏Ïä§ ${processesToKill[0]}??Î•? Ï¢ÖÎ£å?òÏãúÍ≤†Ïäµ?àÍπå?\n\n???ëÏóÖ?Ä ?òÎèåÎ¶????ÜÏäµ?àÎã§.`
        : `?†ÌÉù??${processesToKill.length}Í∞??ÑÎ°ú?∏Ïä§Î•?Î™®Îëê Ï¢ÖÎ£å?òÏãúÍ≤†Ïäµ?àÍπå?\n\n???ëÏóÖ?Ä ?òÎèåÎ¶????ÜÏäµ?àÎã§.`;
        
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
        
        // Í≤∞Í≥º Î©îÏãúÏßÄ ?úÏãú
        showBulkProcessResult(successCount, failureCount, 'suspend', errors);
        
        // ?†ÌÉù ?¥Ï†ú
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process suspend:', error);
        showProcessError('?†ÌÉù???ÑÎ°ú?∏Ïä§??, 'suspend', '?àÏÉÅÏπ?Î™ªÌïú ?§Î•òÍ∞Ä Î∞úÏÉù?àÏäµ?àÎã§.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToSuspend.length === 1 
        ? `?ÑÎ°ú?∏Ïä§ ${processesToSuspend[0]}??Î•? ?ºÏãú?ïÏ??òÏãúÍ≤†Ïäµ?àÍπå?`
        : `?†ÌÉù??${processesToSuspend.length}Í∞??ÑÎ°ú?∏Ïä§Î•?Î™®Îëê ?ºÏãú?ïÏ??òÏãúÍ≤†Ïäµ?àÍπå?`;
        
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
        
        // Í≤∞Í≥º Î©îÏãúÏßÄ ?úÏãú
        showBulkProcessResult(successCount, failureCount, 'resume', errors);
        
        // ?†ÌÉù ?¥Ï†ú
        setSelectedProcesses(new Set());
        
      } catch (error) {
        console.error('Unexpected error during process resume:', error);
        showProcessError('?†ÌÉù???ÑÎ°ú?∏Ïä§??, 'resume', '?àÏÉÅÏπ?Î™ªÌïú ?§Î•òÍ∞Ä Î∞úÏÉù?àÏäµ?àÎã§.');
      } finally {
        setIsControlInProgress(false);
      }
    };
    
    // Show confirmation dialog
    if (config.gpuRequireConfirmation !== false) { // default true
      const message = processesToResume.length === 1 
        ? `?ÑÎ°ú?∏Ïä§ ${processesToResume[0]}??Î•? ?¨Í∞ú?òÏãúÍ≤†Ïäµ?àÍπå?`
        : `?†ÌÉù??${processesToResume.length}Í∞??ÑÎ°ú?∏Ïä§Î•?Î™®Îëê ?¨Í∞ú?òÏãúÍ≤†Ïäµ?àÍπå?`;
        
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
                <title id="gpu-icon-title">GPU ?ÑÏù¥ÏΩ?/title>
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
            
            {/* ?§ÏãúÍ∞??ÖÎç∞?¥Ìä∏ ?ÅÌÉú ?úÏãúÍ∏?*/}
            {showUpdateIndicators && (
              <div 
                role="status" 
                aria-live="polite"
                aria-label={`?∞Í≤∞ ?ÅÌÉú: ${isConnected ? '?∞Í≤∞?? : '?∞Í≤∞ ?¥Ï†ú??}, ÎßàÏ?Îß??ÖÎç∞?¥Ìä∏: ${lastUpdateTime > 0 ? getRelativeTimeString(lastUpdateTime) : '?ÜÏùå'}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  marginLeft: '0.5rem',
                  fontSize: '0.7rem',
                  color: 'var(--color-text-secondary)'
                }}
              >
                {/* ?∞Í≤∞ ?ÅÌÉú ?úÏãúÍ∏?*/}
                <div 
                  role="img"
                  aria-label={isConnected ? '?§ÏãúÍ∞??∞Í≤∞ ?ÅÌÉú: ?∞Í≤∞?? : '?§ÏãúÍ∞??∞Í≤∞ ?ÅÌÉú: ?∞Í≤∞ ?¥Ï†ú??}
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
                
                {/* ÎßàÏ?Îß??ÖÎç∞?¥Ìä∏ ?úÍ∞Ñ */}
                {lastUpdateTime > 0 && (
                  <span 
                    style={{ 
                      fontFamily: 'var(--font-mono, monospace)',
                      opacity: 0.8
                    }}
                    title={`Last update: ${formatTime(lastUpdateTime)}`}
                    aria-label={`ÎßàÏ?Îß??ÖÎç∞?¥Ìä∏ ?úÍ∞Ñ: ${formatTime(lastUpdateTime)}`}
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
              √ó
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
                  {sortedProcesses.length}/{filteredCount} filtered (of {totalCount}) by {sortBy.toUpperCase().replace('_', ' ')} {sortOrder === 'desc' ? '‚ñº' : '‚ñ≤'}
                </>
              ) : (
                <>
                  Top {processCount} by {sortBy.toUpperCase().replace('_', ' ')} {sortOrder === 'desc' ? '‚ñº' : '‚ñ≤'}
                </>
              )}
            </span>
          </div>
          
          {/* ?ÑÏ≤¥ ?ÅÌÉú ?îÏïΩ */}
          {sortedProcesses.length > 0 && (
            <div 
              role="complementary" 
              aria-label="?ÑÎ°ú?∏Ïä§ ?ÅÌÉú ?îÏïΩ"
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
                  aria-label={`?§Ìñâ Ï§ëÏù∏ ?ÑÎ°ú?∏Ïä§: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'running').length}Í∞?}
                >
                  <div 
                    role="img"
                    aria-label="?§Ìñâ Ï§??ÅÌÉú ?úÏãúÍ∏?
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
                  aria-label={`?ÄÍ∏?Ï§ëÏù∏ ?ÑÎ°ú?∏Ïä§: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'idle').length}Í∞?}
                >
                  <div 
                    role="img"
                    aria-label="?ÄÍ∏?Ï§??ÅÌÉú ?úÏãúÍ∏?
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
                  aria-label={`?ºÏãú?ïÏ????ÑÎ°ú?∏Ïä§: ${sortedProcesses.filter(p => p.status.toLowerCase() === 'suspended').length}Í∞?}
                >
                  <div 
                    role="img"
                    aria-label="?ºÏãú?ïÏ? ?ÅÌÉú ?úÏãúÍ∏?
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
                  aria-label={`?íÏ? GPU ?¨Ïö©Î•??ÑÎ°ú?∏Ïä§: ${sortedProcesses.filter(p => p.gpu_usage > 90).length}Í∞?}
                >
                  <span role="img" aria-label="?íÏ? ?¨Ïö©Î•??úÏãú">?î•</span> {sortedProcesses.filter(p => p.gpu_usage > 90).length}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>High Usage</div>
              </div>
            </div>
          )}
          
          <div 
            className="process-list" 
            role="table" 
            aria-label="GPU ?ÑÎ°ú?∏Ïä§ Î™©Î°ù"
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
                  ?îç
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
                  aria-label="?åÏù¥Î∏??§Îçî"
                >
                  <div 
                    role="columnheader"
                    aria-label="Î™®Îì† ?ÑÎ°ú?∏Ïä§ ?†ÌÉù/?¥Ï†ú"
                    className="process-select-header"
                    title="Select all processes"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProcesses.size > 0 && selectedProcesses.size === sortedProcesses.length}
                      onChange={handleSelectAll}
                      aria-label={`Î™®Îì† ?ÑÎ°ú?∏Ïä§ ?†ÌÉù (?ÑÏû¨ ${selectedProcesses.size}/${sortedProcesses.length}Í∞??†ÌÉù??`}
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
                    aria-label="?ÑÎ°ú?∏Ïä§ ?¥Î¶Ñ?ºÎ°ú ?ïÎ†¨"
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
                    aria-label="?ÑÎ°ú?∏Ïä§ IDÎ°??ïÎ†¨"
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
                    aria-label="GPU ?¨Ïö©Î•†Î°ú ?ïÎ†¨"
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
                    aria-label="GPU Î©îÎ™®Î¶??¨Ïö©?âÏúºÎ°??ïÎ†¨"
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
                    aria-label="?ÑÎ°ú?∏Ïä§ ?Ä?ÖÏúºÎ°??ïÎ†¨"
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
                    aria-label={`${index + 1}Î≤àÏß∏ ?ÑÎ°ú?∏Ïä§: ${process.name}, PID ${process.pid}, GPU ?¨Ïö©Î•?${process.gpu_usage.toFixed(1)}%, Î©îÎ™®Î¶?${process.gpu_memory.toFixed(0)}MB, ?ÅÌÉú ${process.status}`}
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
                    <div className="process-select" role="gridcell" aria-label="?ÑÎ°ú?∏Ïä§ ?†ÌÉù">
                      <input
                        type="checkbox"
                        checked={selectedProcesses.has(process.pid)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleProcessSelect(process.pid, e as any);
                        }}
                        aria-label={`${process.name} ?ÑÎ°ú?∏Ïä§ ?†ÌÉù`}
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
                      aria-label={`?ÑÎ°ú?∏Ïä§ ?¥Î¶Ñ: ${process.name}`}
                      title={isProcessNameTruncated ? `${process.name}\nCommand: ${process.command}` : undefined}
                    >
                      <span 
                        className="process-type-icon"
                        role="img"
                        aria-label={`?ÑÎ°ú?∏Ïä§ ?†Ìòï: ${process.type}`}
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
                      aria-label={`?ÑÎ°ú?∏Ïä§ ID: ${process.pid}`}
                    >
                      {process.pid}
                    </div>
                    <div 
                      className="process-gpu"
                      role="gridcell"
                      aria-label={`GPU ?¨Ïö©Î•? ${process.gpu_usage.toFixed(1)}?ºÏÑº??}
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
                          aria-label="Ï¥àÍ≥†?¨Ïö©Î•?Í≤ΩÍ≥†"
                          style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-8px',
                            fontSize: '8px',
                            animation: 'pulse 1s infinite'
                          }}
                        >?î•</span>
                      )}
                      {process.gpu_usage.toFixed(1)}%
                    </div>
                    <div 
                      className="process-memory"
                      role="gridcell"
                      aria-label={`GPU Î©îÎ™®Î¶??¨Ïö©?? ${process.gpu_memory < 1024 ? `${process.gpu_memory.toFixed(0)}Î©îÍ?Î∞îÏù¥?? : `${(process.gpu_memory / 1024).toFixed(1)}Í∏∞Í?Î∞îÏù¥??}`}
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
                          aria-label="Í≥†Ïö©??Î©îÎ™®Î¶?Í≤ΩÍ≥†"
                          style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-8px',
                            fontSize: '8px',
                            animation: 'pulse 1s infinite'
                          }}
                        >?íæ</span>
                      )}
                      {process.gpu_memory < 1024 
                        ? `${process.gpu_memory.toFixed(0)}MB`
                        : `${(process.gpu_memory / 1024).toFixed(1)}GB`
                      }
                    </div>
                    <div 
                      className={`process-type ${getProcessTypeClass(process.type)}`}
                      role="gridcell"
                      aria-label={`?ÑÎ°ú?∏Ïä§ ?Ä?? ${process.type}, ?ÅÌÉú: ${process.status}`}
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
                          aria-label={`?ÑÎ°ú?∏Ïä§ ?†Ìòï: ${process.type}`}
                        >
                          {getProcessTypeIcon(process.type, process.name)}
                        </span>
                        <span style={{ fontSize: '0.75rem' }}>{process.type}</span>
                        
                        {/* ?ÅÌÉú ?úÏãú ??*/}
                        <div 
                          role="img"
                          aria-label={`?ÑÎ°ú?∏Ïä§ ?ÅÌÉú: ${process.status}`}
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
          
          {/* ?ÑÎ°ú?∏Ïä§ ?úÏñ¥ Î≤ÑÌäº Í∑∏Î£π */}
          {selectedProcesses.size > 0 && (
            <div 
              className="process-control-buttons" 
              role="toolbar"
              aria-label="?†ÌÉù???ÑÎ°ú?∏Ïä§ ?úÏñ¥ ?ÑÍµ¨"
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
                aria-label={`${selectedProcesses.size}Í∞úÏùò ?ÑÎ°ú?∏Ïä§Í∞Ä ?†ÌÉù??}
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  marginRight: 'var(--spacing-sm)'
                }}
              >
                {selectedProcesses.size}Í∞??ÑÎ°ú?∏Ïä§ ?†ÌÉù??
              </div>
              <button
                className="process-control-btn kill-btn"
                onClick={handleKillSelected}
                disabled={isControlInProgress}
                aria-label={`?†ÌÉù??${selectedProcesses.size}Í∞??ÑÎ°ú?∏Ïä§ Ï¢ÖÎ£å`}
                title="?†ÌÉù???ÑÎ°ú?∏Ïä§ Ï¢ÖÎ£å"
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
                title="?†ÌÉù???ÑÎ°ú?∏Ïä§ ?ºÏãú?ïÏ?"
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
                title="?†ÌÉù???ÑÎ°ú?∏Ïä§ ?¨Í∞ú"
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
                title="?†ÌÉù ?¥Ï†ú"
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

      {/* Ïª®ÌÖç?§Ìä∏ Î©îÎâ¥ */}
      {contextMenu.visible && (
        <div
          className="context-menu"
          role="menu"
          aria-label={`${contextMenu.processName} ?ÑÎ°ú?∏Ïä§ ?úÏñ¥ Î©îÎâ¥`}
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
            aria-label={`${contextMenu.processName} ?ÑÎ°ú?∏Ïä§ Ï¢ÖÎ£å`}
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
            <span role="img" aria-label="Ï¢ÖÎ£å">[X]</span> Kill Process
          </button>
          
          <button
            className="context-menu-item"
            role="menuitem"
            onClick={() => handleContextAction('suspend')}
            disabled={isControlInProgress}
            aria-label={`${contextMenu.processName} ?ÑÎ°ú?∏Ïä§ ?ºÏãú?ïÏ?`}
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
            <span role="img" aria-label="?ºÏãú?ïÏ?">[PAUSE]</span> Suspend Process
          </button>
          
          <button
            className="context-menu-item"
            role="menuitem"
            onClick={() => handleContextAction('resume')}
            disabled={isControlInProgress}
            aria-label={`${contextMenu.processName} ?ÑÎ°ú?∏Ïä§ ?¨Í∞ú`}
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
              {priority === 'high' && '?î¥'}
              {priority === 'above_normal' && '?ü†'}
              {priority === 'normal' && '?ü°'}
              {priority === 'below_normal' && '?îµ'}
              {priority === 'low' && '?ü¢'}
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
          title="GPU Process Monitor Widget ?§Ï†ï"
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
                ?éÆ Gaming
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
                ?ë®?çüí?Developer
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
                ?ì± Minimal
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
              ?îÑ Reset to Default Settings
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
                ???î• High GPU usage (&gt;95%) indicator<br/>
                ???íæ High memory usage (&gt;4GB) indicator
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
