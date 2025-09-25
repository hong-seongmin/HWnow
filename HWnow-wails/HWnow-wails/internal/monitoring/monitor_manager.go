package monitoring

import (
	"fmt"
	"sync"
)

// monitorManager implements the MonitorManager interface
type monitorManager struct {
	monitors         map[string]SystemMonitor
	config           *MonitoringConfig
	mu               sync.RWMutex
	cpuMonitor       CPUMonitor
	memoryMonitor    MemoryMonitor
	gpuMonitor       GPUMonitor
	systemInfoProvider SystemInfoProvider
}

// NewMonitorManager creates a new monitor manager
func NewMonitorManager(config *MonitoringConfig) MonitorManager {
	if config == nil {
		config = DefaultMonitoringConfig()
	}

	return &monitorManager{
		monitors: make(map[string]SystemMonitor),
		config:   config,
	}
}

// RegisterMonitor registers a system monitor
func (m *monitorManager) RegisterMonitor(monitor SystemMonitor) error {
	if monitor == nil {
		return fmt.Errorf("monitor cannot be nil")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	name := monitor.GetName()
	m.monitors[name] = monitor

	// Cache specific monitor types for quick access
	switch v := monitor.(type) {
	case CPUMonitor:
		m.cpuMonitor = v
	case MemoryMonitor:
		m.memoryMonitor = v
	case GPUMonitor:
		m.gpuMonitor = v
	case SystemInfoProvider:
		m.systemInfoProvider = v
	}

	return nil
}

// GetMonitor returns a monitor by name
func (m *monitorManager) GetMonitor(name string) SystemMonitor {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.monitors[name]
}

// InitializeAll initializes all registered monitors
func (m *monitorManager) InitializeAll() error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for name, monitor := range m.monitors {
		if err := monitor.Initialize(); err != nil {
			return fmt.Errorf("failed to initialize monitor %s: %v", name, err)
		}
	}

	return nil
}

// CleanupAll cleans up all registered monitors
func (m *monitorManager) CleanupAll() error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var errs []error
	for name, monitor := range m.monitors {
		if err := monitor.Cleanup(); err != nil {
			errs = append(errs, fmt.Errorf("failed to cleanup monitor %s: %v", name, err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("cleanup errors: %v", errs)
	}

	return nil
}

// GetCPUMonitor returns the CPU monitor
func (m *monitorManager) GetCPUMonitor() CPUMonitor {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.cpuMonitor == nil && m.config.EnableCPUMonitoring {
		// Lazy initialization
		cpuMon := NewCPUMonitor()
		m.RegisterMonitor(cpuMon)
		return cpuMon
	}

	return m.cpuMonitor
}

// GetMemoryMonitor returns the memory monitor
func (m *monitorManager) GetMemoryMonitor() MemoryMonitor {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.memoryMonitor == nil && m.config.EnableMemoryMonitoring {
		// Lazy initialization
		memMon := NewMemoryMonitor()
		m.RegisterMonitor(memMon)
		return memMon
	}

	return m.memoryMonitor
}

// GetGPUMonitor returns the GPU monitor
func (m *monitorManager) GetGPUMonitor() GPUMonitor {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.gpuMonitor == nil && m.config.EnableGPUMonitoring {
		// Lazy initialization
		gpuMon := NewGPUMonitor()
		m.RegisterMonitor(gpuMon)
		return gpuMon
	}

	return m.gpuMonitor
}

// GetSystemInfoProvider returns the system info provider
func (m *monitorManager) GetSystemInfoProvider() SystemInfoProvider {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.systemInfoProvider == nil && m.config.EnableSystemInfo {
		// Lazy initialization
		sysInfo := NewSystemInfoProvider()
		m.RegisterMonitor(sysInfo)
		return sysInfo
	}

	return m.systemInfoProvider
}

// SetupDefaultMonitors sets up the default monitoring components
func (m *monitorManager) SetupDefaultMonitors() error {
	if m.config.EnableCPUMonitoring {
		cpuMon := NewCPUMonitor()
		if err := m.RegisterMonitor(cpuMon); err != nil {
			return fmt.Errorf("failed to register CPU monitor: %v", err)
		}
	}

	if m.config.EnableMemoryMonitoring {
		memMon := NewMemoryMonitor()
		if err := m.RegisterMonitor(memMon); err != nil {
			return fmt.Errorf("failed to register memory monitor: %v", err)
		}
	}

	if m.config.EnableSystemInfo {
		sysInfo := NewSystemInfoProvider()
		if err := m.RegisterMonitor(sysInfo); err != nil {
			return fmt.Errorf("failed to register system info provider: %v", err)
		}
	}

	if m.config.EnableGPUMonitoring {
		gpuMon := NewGPUMonitor()
		if err := m.RegisterMonitor(gpuMon); err != nil {
			return fmt.Errorf("failed to register GPU monitor: %v", err)
		}
	}

	return m.InitializeAll()
}