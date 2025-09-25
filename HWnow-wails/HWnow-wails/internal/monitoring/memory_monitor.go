package monitoring

import (
	"log"

	"github.com/shirou/gopsutil/v3/mem"
)

// memoryMonitor implements the MemoryMonitor interface
type memoryMonitor struct {
	name string
}

// NewMemoryMonitor creates a new memory monitor
func NewMemoryMonitor() MemoryMonitor {
	return &memoryMonitor{
		name: "memory_monitor",
	}
}

// Initialize initializes the memory monitor
func (m *memoryMonitor) Initialize() error {
	return nil
}

// Cleanup performs cleanup operations
func (m *memoryMonitor) Cleanup() error {
	return nil
}

// GetName returns the monitor name
func (m *memoryMonitor) GetName() string {
	return m.name
}

// GetTotalMemory returns total system memory
func (m *memoryMonitor) GetTotalMemory() (float64, error) {
	v, err := mem.VirtualMemory()
	if err != nil {
		return 0, err
	}

	// Convert bytes to GB
	totalGB := float64(v.Total) / (1024 * 1024 * 1024)
	return totalGB, nil
}

// GetMemoryUsage returns current memory usage details
func (m *memoryMonitor) GetMemoryUsage() (*MemoryDetails, error) {
	return m.getMemoryDetails()
}

// getMemoryUsage returns memory usage percentage
func (m *memoryMonitor) getMemoryUsage() (float64, error) {
	v, err := mem.VirtualMemory()
	if err != nil {
		return 0, err
	}
	return v.UsedPercent, nil
}

// getMemoryDetails returns detailed memory information
func (m *memoryMonitor) getMemoryDetails() (*MemoryDetails, error) {
	virtual, err := mem.VirtualMemory()
	if err != nil {
		log.Printf("Error getting virtual memory: %v", err)
		return nil, err
	}

	swap, err := mem.SwapMemory()
	if err != nil {
		log.Printf("Error getting swap memory: %v", err)
		return nil, err
	}

	log.Printf("Memory details - Physical: %.2f%%, Virtual: %.2f%%, Swap: %.2f%%",
		virtual.UsedPercent, virtual.UsedPercent, swap.UsedPercent)

	return &MemoryDetails{
		Physical: virtual.UsedPercent,
		Virtual:  virtual.UsedPercent, // 일반적으로 물리 메모리와 동일
		Swap:     swap.UsedPercent,
	}, nil
}