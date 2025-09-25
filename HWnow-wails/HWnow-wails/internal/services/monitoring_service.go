package services

import (
	"context"
	"sync"
	"time"

	"HWnow-wails/internal/monitoring"
)

// SystemInfo represents system information for Wails binding
type SystemInfo struct {
	Platform     string    `json:"platform"`
	CPUCores     int       `json:"cpu_cores"`
	CPUModel     string    `json:"cpu_model"`
	TotalMemory  float64   `json:"total_memory"`
	BootTime     time.Time `json:"boot_time"`
}

// RealTimeMetrics represents real-time system metrics
type RealTimeMetrics struct {
	CPUUsage       float64                      `json:"cpu_usage"`
	CPUCoreUsage   []float64                    `json:"cpu_core_usage"`
	MemoryUsage    float64                      `json:"memory_usage"`
	DiskUsage      *monitoring.DiskUsageInfo    `json:"disk_usage"`
	DiskReadSpeed  float64                      `json:"disk_read_speed"`
	DiskWriteSpeed float64                      `json:"disk_write_speed"`
	NetworkIO      []monitoring.NetworkInterface `json:"network_io"`
	NetSentSpeed   float64                      `json:"net_sent_speed"`
	NetRecvSpeed   float64                      `json:"net_recv_speed"`

	// 새로 추가된 필드들 - 실제 시스템 정보만 제공
	SystemUptime   int64                        `json:"system_uptime"`    // 시스템 업타임 (초)
	BootTime       time.Time                    `json:"boot_time"`        // 시스템 부팅 시간
	GPUInfo        *monitoring.GPUInfo          `json:"gpu_info"`         // GPU 정보 (실제 데이터만)
	GPUProcesses   []monitoring.GPUProcess      `json:"gpu_processes"`    // GPU 프로세스 목록
	TopProcesses   []monitoring.ProcessInfo     `json:"top_processes"`    // Top 프로세스 목록
	MemoryDetails  *monitoring.MemoryDetails    `json:"memory_details"`   // 메모리 상세 정보
	BatteryInfo    *monitoring.BatteryInfo      `json:"battery_info"`     // 배터리 정보 (실제 데이터만)
	NetworkStatus  string                       `json:"network_status"`   // 네트워크 연결 상태

	Timestamp      time.Time                    `json:"timestamp"`
}

// MonitoringService provides system monitoring functionality
type MonitoringService struct {
	mutex       sync.RWMutex
	isRunning   bool
	ctx         context.Context
	cancel      context.CancelFunc
	config      *MonitoringConfig
}

// NewMonitoringService creates a new monitoring service
func NewMonitoringService(config *MonitoringConfig) *MonitoringService {
	return &MonitoringService{
		config: config,
	}
}

// GetSystemInfo retrieves system information
func (s *MonitoringService) GetSystemInfo() (*SystemInfo, error) {
	// Get CPU information
	cpuCores, err := monitoring.GetCPUCores()
	if err != nil {
		return nil, err
	}

	cpuModel, err := monitoring.GetCPUModelName()
	if err != nil {
		cpuModel = "Unknown CPU"
	}

	// Get memory information
	totalMemory, err := monitoring.GetTotalMemory()
	if err != nil {
		return nil, err
	}

	// Get boot time
	bootTime, err := monitoring.GetBootTime()
	if err != nil {
		bootTime = time.Now()
	}

	// Get platform
	platform := monitoring.GetCurrentPlatform()

	return &SystemInfo{
		Platform:    platform,
		CPUCores:    cpuCores,
		CPUModel:    cpuModel,
		TotalMemory: totalMemory,
		BootTime:    bootTime,
	}, nil
}

// GetRealTimeMetrics retrieves real-time system metrics
func (s *MonitoringService) GetRealTimeMetrics() (*RealTimeMetrics, error) {
	metrics := &RealTimeMetrics{
		Timestamp: time.Now(),
	}

	// CPU metrics
	if s.config.EnableCpuMonitoring {
		if cpuUsage, err := monitoring.GetCPUUsage(); err == nil {
			metrics.CPUUsage = cpuUsage
		}

		if cpuCoreUsage, err := monitoring.GetCPUCoreUsage(); err == nil {
			metrics.CPUCoreUsage = cpuCoreUsage
		}
	}

	// Memory metrics
	if s.config.EnableMemoryMonitoring {
		if memoryUsage, err := monitoring.GetMemoryUsage(); err == nil {
			metrics.MemoryUsage = memoryUsage
		}

		if memoryDetails, err := monitoring.GetMemoryDetails(); err == nil {
			metrics.MemoryDetails = memoryDetails
		}
	}

	// Disk metrics
	if s.config.EnableDiskMonitoring {
		if diskUsage, err := monitoring.GetDiskUsage(); err == nil {
			metrics.DiskUsage = diskUsage
		}

		if diskReadSpeed, diskWriteSpeed, err := monitoring.GetDiskIOSpeed(); err == nil {
			metrics.DiskReadSpeed = diskReadSpeed
			metrics.DiskWriteSpeed = diskWriteSpeed
		}
	}

	// Network metrics
	if s.config.EnableNetworkMonitoring {
		if networkIO, err := monitoring.GetNetworkInterfaces(); err == nil {
			metrics.NetworkIO = networkIO
		}

		if netSentSpeed, netRecvSpeed, err := monitoring.GetNetworkIOSpeed(); err == nil {
			metrics.NetSentSpeed = netSentSpeed
			metrics.NetRecvSpeed = netRecvSpeed
		}

		if networkStatus, err := monitoring.GetNetworkStatus(); err == nil {
			metrics.NetworkStatus = networkStatus
		}
	}

	// System information
	if systemUptime, err := monitoring.GetSystemUptime(); err == nil {
		metrics.SystemUptime = systemUptime
	}

	if bootTime, err := monitoring.GetBootTime(); err == nil {
		metrics.BootTime = bootTime
	}

	// GPU information
	if gpuInfo, err := monitoring.GetGPUInfo(); err == nil {
		metrics.GPUInfo = gpuInfo
	}

	if gpuProcesses, err := monitoring.GetGPUProcesses(); err == nil {
		metrics.GPUProcesses = gpuProcesses
	}

	// Top processes
	if topProcesses, err := monitoring.GetTopProcesses(10); err == nil {
		metrics.TopProcesses = topProcesses
	}

	// Battery information
	if batteryInfo, err := monitoring.GetBatteryInfo(); err == nil {
		metrics.BatteryInfo = batteryInfo
	}

	return metrics, nil
}

// GetGPUInfo retrieves GPU information
func (s *MonitoringService) GetGPUInfo() (*monitoring.GPUInfo, error) {
	return monitoring.GetGPUInfo()
}

// GetGPUProcesses retrieves GPU processes
func (s *MonitoringService) GetGPUProcesses() ([]monitoring.GPUProcess, error) {
	return monitoring.GetGPUProcesses()
}

// GetGPUProcessesFiltered retrieves filtered GPU processes
func (s *MonitoringService) GetGPUProcessesFiltered(query monitoring.GPUProcessQuery) (*monitoring.GPUProcessResponse, error) {
	return monitoring.GetGPUProcessesFiltered(query)
}

// GetGPUProcessesDelta retrieves GPU process changes
func (s *MonitoringService) GetGPUProcessesDelta(lastUpdateID string) (*monitoring.GPUProcessDeltaResponse, error) {
	return monitoring.GetGPUProcessesDelta(lastUpdateID)
}

// GetTopProcesses retrieves top processes
func (s *MonitoringService) GetTopProcesses(count int) ([]monitoring.ProcessInfo, error) {
	return monitoring.GetTopProcesses(count)
}

// Start starts the monitoring service
func (s *MonitoringService) Start() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.isRunning {
		return nil
	}

	s.ctx, s.cancel = context.WithCancel(context.Background())
	s.isRunning = true

	// Start background monitoring routines if needed
	go s.backgroundMonitoring()

	return nil
}

// Stop stops the monitoring service
func (s *MonitoringService) Stop() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if !s.isRunning {
		return nil
	}

	if s.cancel != nil {
		s.cancel()
	}

	s.isRunning = false
	return nil
}

// IsRunning returns whether the monitoring service is running
func (s *MonitoringService) IsRunning() bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	return s.isRunning
}

// backgroundMonitoring runs background monitoring tasks
func (s *MonitoringService) backgroundMonitoring() {
	ticker := time.NewTicker(time.Duration(s.config.IntervalSeconds) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			// Perform background monitoring tasks
			// This can be extended based on specific requirements
		}
	}
}