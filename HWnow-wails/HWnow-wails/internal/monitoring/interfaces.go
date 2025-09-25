package monitoring

import (
	"time"
)

// SystemMonitor defines the interface for system monitoring components
type SystemMonitor interface {
	// Initialize initializes the monitor
	Initialize() error

	// Cleanup performs cleanup operations
	Cleanup() error

	// GetName returns the monitor name
	GetName() string
}

// CPUMonitor defines the interface for CPU monitoring
type CPUMonitor interface {
	SystemMonitor

	// GetCPUCoreUsage returns per-core CPU usage
	GetCPUCoreUsage() ([]float64, error)

	// GetCPUCores returns the number of CPU cores
	GetCPUCores() (int, error)

	// GetCPUModelName returns the CPU model name
	GetCPUModelName() (string, error)
}

// MemoryMonitor defines the interface for memory monitoring
type MemoryMonitor interface {
	SystemMonitor

	// GetTotalMemory returns total system memory
	GetTotalMemory() (float64, error)

	// GetMemoryUsage returns current memory usage details
	GetMemoryUsage() (*MemoryDetails, error)
}

// GPUMonitor defines the interface for GPU monitoring
type GPUMonitor interface {
	SystemMonitor

	// GetGPUInfo returns GPU hardware information
	GetGPUInfo() (*GPUInfo, error)

	// GetGPUProcesses returns GPU processes with filtering
	GetGPUProcessesFiltered(query GPUProcessQuery) (*GPUProcessResponse, error)

	// GetGPUProcessesDelta returns GPU process changes
	GetGPUProcessesDelta(lastUpdateID string) (*GPUProcessDeltaResponse, error)
}

// SystemInfoProvider defines the interface for system information
type SystemInfoProvider interface {
	SystemMonitor

	// GetBootTime returns system boot time
	GetBootTime() (time.Time, error)

	// GetSystemUptime returns system uptime in seconds
	GetSystemUptime() (int64, error)

	// GetCurrentPlatform returns the current platform
	GetCurrentPlatform() string

	// GetBatteryInfo returns battery information
	GetBatteryInfo() (*BatteryInfo, error)
}

// MonitorManager manages all system monitors
type MonitorManager interface {
	// RegisterMonitor registers a system monitor
	RegisterMonitor(monitor SystemMonitor) error

	// GetMonitor returns a monitor by name
	GetMonitor(name string) SystemMonitor

	// InitializeAll initializes all registered monitors
	InitializeAll() error

	// CleanupAll cleans up all registered monitors
	CleanupAll() error

	// GetCPUMonitor returns the CPU monitor
	GetCPUMonitor() CPUMonitor

	// GetMemoryMonitor returns the memory monitor
	GetMemoryMonitor() MemoryMonitor

	// GetGPUMonitor returns the GPU monitor
	GetGPUMonitor() GPUMonitor

	// GetSystemInfoProvider returns the system info provider
	GetSystemInfoProvider() SystemInfoProvider
}

// MonitoringConfig holds configuration for monitoring components
type MonitoringConfig struct {
	// EnableCPUMonitoring enables CPU monitoring
	EnableCPUMonitoring bool

	// EnableMemoryMonitoring enables memory monitoring
	EnableMemoryMonitoring bool

	// EnableGPUMonitoring enables GPU monitoring
	EnableGPUMonitoring bool

	// EnableSystemInfo enables system info collection
	EnableSystemInfo bool

	// CacheDurations for different monitoring components
	CPUCacheDuration    time.Duration
	MemoryCacheDuration time.Duration
	GPUCacheDuration    time.Duration
	SystemCacheDuration time.Duration
}

// DefaultMonitoringConfig returns a default monitoring configuration
func DefaultMonitoringConfig() *MonitoringConfig {
	return &MonitoringConfig{
		EnableCPUMonitoring:    true,
		EnableMemoryMonitoring: true,
		EnableGPUMonitoring:    true,
		EnableSystemInfo:       true,
		CPUCacheDuration:       30 * time.Second,
		MemoryCacheDuration:    10 * time.Second,
		GPUCacheDuration:       600 * time.Second,
		SystemCacheDuration:    300 * time.Second,
	}
}