package monitoring

import (
	"time"
)

// gpuMonitor implements the GPUMonitor interface
type gpuMonitor struct {
	name string
}

// NewGPUMonitor creates a new GPU monitor
func NewGPUMonitor() GPUMonitor {
	return &gpuMonitor{
		name: "gpu_monitor",
	}
}

// Initialize initializes the GPU monitor
func (g *gpuMonitor) Initialize() error {
	return nil
}

// Cleanup performs cleanup operations
func (g *gpuMonitor) Cleanup() error {
	return nil
}

// GetName returns the monitor name
func (g *gpuMonitor) GetName() string {
	return g.name
}

// GetGPUInfo returns GPU hardware information
func (g *gpuMonitor) GetGPUInfo() (*GPUInfo, error) {
	return getGPUInfoUncached()
}

// GetGPUProcessesFiltered returns GPU processes with filtering
func (g *gpuMonitor) GetGPUProcessesFiltered(query GPUProcessQuery) (*GPUProcessResponse, error) {
	return GetGPUProcessesFilteredInternal(query)
}

// GetGPUProcessesDelta returns GPU process changes
func (g *gpuMonitor) GetGPUProcessesDelta(lastUpdateID string) (*GPUProcessDeltaResponse, error) {
	return GetGPUProcessesDeltaInternal(lastUpdateID)
}

// Note: GPU-related types are defined in collector.go to avoid duplication
// This module uses the existing types: GPUVendor, GPUProcessError, GPUProcessCache, etc.

// Note: GPU vendor detection and helper functions are available in collector.go

// GetGPUProcessesFilteredInternal - internal implementation for filtered GPU processes
func GetGPUProcessesFilteredInternal(query GPUProcessQuery) (*GPUProcessResponse, error) {
	startTime := time.Now()

	processes, err := getCachedGPUProcesses()
	if err != nil {
		return nil, err
	}

	// Apply filters
	if query.Filter.Enabled {
		processes = filterGPUProcesses(processes, query.Filter)
	}

	// Apply sorting
	sortGPUProcesses(processes, query.Sort)

	// Apply pagination
	totalCount := len(processes)
	filteredCount := totalCount

	start := query.Offset
	if start > totalCount {
		start = totalCount
	}

	end := start + query.MaxItems
	if end > totalCount || query.MaxItems <= 0 {
		end = totalCount
	}

	if start < end {
		processes = processes[start:end]
	} else {
		processes = []GPUProcess{}
	}

	response := &GPUProcessResponse{
		Processes:     processes,
		TotalCount:    totalCount,
		FilteredCount: filteredCount,
		HasMore:       end < totalCount,
		QueryTime:     time.Since(startTime).Milliseconds(),
	}

	return response, nil
}

// GetGPUProcessesDeltaInternal - internal implementation for GPU process delta
func GetGPUProcessesDeltaInternal(lastUpdateID string) (*GPUProcessDeltaResponse, error) {
	// Use the existing cache from collector.go - we'll delegate to the original function for now
	return GetGPUProcessesDeltaOriginal(lastUpdateID)
}

// Note: Helper functions (filterGPUProcesses, sortGPUProcesses, computeGPUProcessDelta, processChanged)
// are available in collector.go and used by the internal implementations

// Note: This module delegates to the existing implementations in collector.go
// Future iterations will move the actual GPU detection and processing logic here