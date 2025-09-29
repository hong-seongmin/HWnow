import React, { memo, useCallback, useRef } from 'react';
import { SettingsModal } from '../../common/SettingsModal';
import { GpuProcessSettings } from '../settings/GpuProcessSettings';
import { useConfirmDialog } from '../../common/ConfirmDialog';
import { useToast } from '../../../contexts/ToastContext';
import { ButtonSpinner, InlineLoader } from '../../common/LoadingSpinner';
import { GPU_PROCESS_PRESETS, type GPUProcessPresetType } from '../../../utils/gpuProcessWidgetDefaults';

import { GPUProcessErrorBoundary } from './ErrorBoundary';
import { ProcessTable } from './ProcessTable';
import { useWidgetState, useProcessOperations } from './WidgetStateManager';
import { ProcessOperationsHandler } from './ProcessOperations';
import { useWidgetWidth, calculateMaxProcessNameLength } from './useWidgetWidth';
import '../widget.css';

interface WidgetProps {
  widgetId: string;
  onRemove?: (widgetId: string) => void;
  isExpanded?: boolean;
  onExpand?: (widgetId: string) => void;
}

const GpuProcessWidgetContent: React.FC<WidgetProps> = ({ widgetId, onRemove, isExpanded = false, onExpand }) => {
  const { showToast } = useToast();
  const { showConfirm } = useConfirmDialog();

  // Get widget preset/settings
  const preset = GPU_PROCESS_PRESETS.default; // This would come from widget settings

  // State management
  const { state, actions, data } = useWidgetState(widgetId, preset);
  const { executeProcessOperation } = useProcessOperations(actions, showToast);

  // Process operations handler
  const processOpsHandler = ProcessOperationsHandler.getInstance();

  // Widget width detection for responsive process name display
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetWidth = useWidgetWidth(widgetRef);
  const maxProcessNameLength = calculateMaxProcessNameLength(widgetWidth);

  // Event handlers
  const handleSettingsClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    actions.setIsSettingsOpen(true);
  }, [actions]);

  const handleRemoveClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onRemove) {
      onRemove(widgetId);
    }
  }, [onRemove, widgetId]);

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onExpand) {
      onExpand(widgetId);
    }
  }, [onExpand, widgetId]);

  const handleSettingsSave = useCallback(() => {
    actions.setIsSettingsOpen(false);
    actions.setLastUpdateTime(Date.now());
    showToast('GPU Process settings saved successfully', 'success');
  }, [actions, showToast]);

  const handleTerminateProcess = useCallback(async (pid: number, processName: string) => {
    const confirmed = await showConfirm({
      title: 'Terminate Process',
      message: `Are you sure you want to terminate "${processName}" (PID: ${pid})?\n\nThis action cannot be undone.`,
      confirmText: 'Terminate',
      cancelText: 'Cancel',
      type: 'danger'
    });

    if (!confirmed) return;

    await executeProcessOperation(
      () => processOpsHandler.terminateProcess(pid, processName),
      pid,
      'terminate',
      processName
    );

    // Remove from selected processes
    actions.setSelectedProcesses(current => {
      const newSet = new Set(current);
      newSet.delete(pid);
      return newSet;
    });
  }, [showConfirm, executeProcessOperation, processOpsHandler, actions]);

  const handleTerminateSelected = useCallback(async () => {
    if (state.selectedProcesses.size === 0) {
      showToast('No processes selected', 'warning');
      return;
    }

    const selectedPids = Array.from(state.selectedProcesses);
    const processNames = data.sortedProcesses.reduce((acc, p) => {
      if (state.selectedProcesses.has(p.pid)) {
        acc[p.pid] = p.name;
      }
      return acc;
    }, {} as Record<number, string>);

    const confirmed = await showConfirm({
      title: 'Terminate Selected Processes',
      message: `Are you sure you want to terminate ${selectedPids.length} selected processes?\n\nThis action cannot be undone.`,
      confirmText: `Terminate ${selectedPids.length} Processes`,
      cancelText: 'Cancel',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      const results = await processOpsHandler.batchOperation(selectedPids, 'terminate', { processNames });

      const { success, failed } = results.summary;
      if (success > 0) {
        showToast(`Successfully terminated ${success} processes`, 'success');
      }
      if (failed > 0) {
        showToast(`Failed to terminate ${failed} processes`, 'error');
      }

      // Clear selection
      actions.setSelectedProcesses(new Set());
    } catch (error) {
      console.error('Batch terminate failed:', error);
      showToast('Failed to terminate selected processes', 'error');
    }
  }, [state.selectedProcesses, data.sortedProcesses, showConfirm, processOpsHandler, showToast, actions]);

  const handleRefresh = useCallback(() => {
    actions.setLastUpdateTime(Date.now());
    showToast('GPU processes refreshed', 'info');
  }, [actions, showToast]);

  const connectionIndicator = state.isConnected ? (
    <div className="connection-status connected" title="Connected to monitoring service">
      <div className="connection-dot"></div>
    </div>
  ) : (
    <div className="connection-status disconnected" title="Disconnected from monitoring service">
      <div className="connection-dot"></div>
    </div>
  );

  const hasSelectedProcesses = state.selectedProcesses.size > 0;
  const isAnyOperationInProgress = processOpsHandler.getOperationInProgressCount() > 0;

  return (
    <div ref={widgetRef} className={`widget widget-gpu-process ${isExpanded ? 'expanded' : ''}`}
         role="region"
         aria-label="GPU Process Monitor">

      <div className="widget-header">
        <div className="widget-title">
          <div className="widget-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <span>GPU Processes</span>
          {connectionIndicator}
        </div>

        <div className="widget-controls">
          {data.processStatusCounts.total > 0 && (
            <div className="process-count-badge">
              <span className="count-number">{data.processStatusCounts.total}</span>
              <span className="count-label">processes</span>
            </div>
          )}

          <div className="widget-actions">
            {hasSelectedProcesses && (
              <button
                className="btn btn-danger btn-sm"
                onClick={handleTerminateSelected}
                disabled={isAnyOperationInProgress}
                title={`Terminate ${state.selectedProcesses.size} selected processes`}
              >
                {isAnyOperationInProgress ? (
                  <ButtonSpinner size="sm" />
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Terminate ({state.selectedProcesses.size})
                  </>
                )}
              </button>
            )}

            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRefresh}
              title="Refresh GPU processes"
              aria-label="Refresh"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 1v2.5L7.5 2"/>
                <path d="M3 11v-2.5L4.5 10"/>
                <path d="M9 3.5a4 4 0 1 1-4-4"/>
                <path d="M3 8.5a4 4 0 1 0 4 4"/>
              </svg>
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExpandClick}
              title={isExpanded ? "Minimize widget" : "Expand widget"}
              aria-label={isExpanded ? "Minimize" : "Expand"}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                {isExpanded ? (
                  <path d="M3 9l3-3 3 3"/>
                ) : (
                  <path d="M3 4.5l3 3 3-3"/>
                )}
              </svg>
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={handleSettingsClick}
              title="Widget settings"
              aria-label="Settings"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6" cy="6" r="3"/>
                <path d="M6 1v2m0 6v2M1 6h2m6 0h2"/>
              </svg>
            </button>

            {onRemove && (
              <button
                className="btn btn-ghost btn-sm btn-remove"
                onClick={handleRemoveClick}
                title="Remove widget"
                aria-label="Remove"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 3L3 9M3 3l6 6"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="widget-content">
        {!state.isConnected && (
          <div className="widget-warning">
            <div className="warning-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <triangle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <span>Monitoring service disconnected. Attempting to reconnect...</span>
            <InlineLoader size="sm" />
          </div>
        )}

        <ProcessTable
          processes={data.sortedProcesses}
          selectedProcesses={state.selectedProcesses}
          isTerminating={state.isTerminating}
          sortColumn={state.sortColumn}
          sortDirection={state.sortDirection}
          onSort={actions.handleSort}
          onProcessSelect={actions.handleProcessSelect}
          onSelectAll={actions.handleSelectAll}
          onTerminateProcess={handleTerminateProcess}
          className={`${!state.isConnected ? 'disconnected' : ''}`}
          maxProcessNameLength={maxProcessNameLength}
        />
      </div>

      {state.isSettingsOpen && (
        <SettingsModal
          title="GPU Process Settings"
          onClose={() => actions.setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
        >
          <GpuProcessSettings
            widgetId={widgetId}
            onSettingsChange={handleSettingsSave}
          />
        </SettingsModal>
      )}
    </div>
  );
};

// Main exported component with error boundary
export const GpuProcessWidget: React.FC<WidgetProps> = (props) => {
  return (
    <GPUProcessErrorBoundary widgetId={props.widgetId}>
      <GpuProcessWidgetContent {...props} />
    </GPUProcessErrorBoundary>
  );
};

export default memo(GpuProcessWidget);