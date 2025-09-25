package services

import (
	"context"
	"fmt"
	"sync"
	"time"

	"HWnow-wails/internal/monitoring"
	"HWnow-wails/internal/native"
)

// AppService coordinates all application services
type AppService struct {
	ctx    context.Context
	config *Config

	// Service components
	configService    *ConfigService
	monitoringService *MonitoringService
	gpuControlService *GPUProcessControlService
	databaseService  *DatabaseService

	// Native services
	nativeUIService *native.UIService

	// Synchronization
	mutex sync.RWMutex
}

// NewAppService creates a new application service coordinator
func NewAppService(configPath string) *AppService {
	app := &AppService{
		configService:    NewConfigService(configPath),
		gpuControlService: NewGPUProcessControlService(),
		databaseService:  NewDatabaseService(),
	}

	return app
}

// Initialize initializes all application services
func (a *AppService) Initialize(ctx context.Context) error {
	a.mutex.Lock()
	defer a.mutex.Unlock()

	a.ctx = ctx

	// Load configuration first
	config, err := a.configService.LoadConfig()
	if err != nil {
		return err
	}
	a.config = config

	// Initialize monitoring service with config
	a.monitoringService = NewMonitoringService(&config.Monitoring)

	// Set up monitoring cache duration
	monitoring.SetCacheDuration(time.Duration(config.Monitoring.SecurityCheckSeconds) * time.Second)

	// Initialize database service
	a.databaseService.SetConfig(config)
	if err := a.databaseService.Initialize(); err != nil {
		monitoring.LogError("Failed to initialize database service", "error", err)
		return err
	}
	monitoring.LogInfo("Database service initialized successfully during startup")

	// Initialize native UI service
	a.nativeUIService = native.NewUIService()
	if err := a.nativeUIService.Initialize(ctx); err != nil {
		monitoring.LogError("Failed to initialize native UI service", "error", err)
		return err
	}

	monitoring.LogInfo("Starting monitoring service with configuration",
		"intervalSeconds", config.Monitoring.IntervalSeconds,
		"securityCheckSeconds", config.Monitoring.SecurityCheckSeconds)

	// Auto-start monitoring service
	if err := a.monitoringService.Start(); err != nil {
		monitoring.LogError("Failed to auto-start monitoring service", "error", err)
		return err
	} else {
		monitoring.LogInfo("Monitoring service auto-started successfully")
	}

	return nil
}

// Shutdown gracefully shuts down all services
func (a *AppService) Shutdown() error {
	a.mutex.Lock()
	defer a.mutex.Unlock()

	var errors []error

	// Stop monitoring service
	if a.monitoringService != nil && a.monitoringService.IsRunning() {
		if err := a.monitoringService.Stop(); err != nil {
			monitoring.LogError("Failed to stop monitoring service during shutdown", "error", err)
			errors = append(errors, err)
		}
	}

	// Close database service
	if a.databaseService != nil {
		if err := a.databaseService.Close(); err != nil {
			monitoring.LogError("Failed to close database service during shutdown", "error", err)
			errors = append(errors, err)
		}
	}

	if len(errors) > 0 {
		return errors[0] // Return first error
	}

	return nil
}

// Configuration methods

// GetConfig returns the current configuration
func (a *AppService) GetConfig() *Config {
	a.mutex.RLock()
	defer a.mutex.RUnlock()
	return a.config
}

// System information methods

// GetSystemInfo retrieves system information
func (a *AppService) GetSystemInfo() (*SystemInfo, error) {
	return a.monitoringService.GetSystemInfo()
}

// GetRealTimeMetrics retrieves real-time system metrics
func (a *AppService) GetRealTimeMetrics() (*RealTimeMetrics, error) {
	return a.monitoringService.GetRealTimeMetrics()
}

// GPU methods

// GetGPUInfo retrieves GPU information
func (a *AppService) GetGPUInfo() (*monitoring.GPUInfo, error) {
	return a.monitoringService.GetGPUInfo()
}

// GetGPUProcesses retrieves GPU processes
func (a *AppService) GetGPUProcesses() ([]monitoring.GPUProcess, error) {
	return a.monitoringService.GetGPUProcesses()
}

// GetGPUProcessesFiltered retrieves filtered GPU processes
func (a *AppService) GetGPUProcessesFiltered(query monitoring.GPUProcessQuery) (*monitoring.GPUProcessResponse, error) {
	return a.monitoringService.GetGPUProcessesFiltered(query)
}

// GetGPUProcessesDelta retrieves GPU process changes
func (a *AppService) GetGPUProcessesDelta(lastUpdateID string) (*monitoring.GPUProcessDeltaResponse, error) {
	return a.monitoringService.GetGPUProcessesDelta(lastUpdateID)
}

// GetTopProcesses retrieves top processes
func (a *AppService) GetTopProcesses(count int) ([]monitoring.ProcessInfo, error) {
	return a.monitoringService.GetTopProcesses(count)
}


// Page management methods

// GetPages retrieves all dashboard pages for a user
func (a *AppService) GetPages(userID string) *PageResult {
	return a.databaseService.GetPages(userID)
}

// CreatePage creates a new dashboard page
func (a *AppService) CreatePage(userID, pageID, pageName string) *PageResult {
	return a.databaseService.CreatePage(userID, pageID, pageName)
}

// DeletePage removes a dashboard page
func (a *AppService) DeletePage(userID, pageID string) *PageResult {
	return a.databaseService.DeletePage(userID, pageID)
}

// UpdatePageName updates the name of a dashboard page
func (a *AppService) UpdatePageName(userID, pageID, pageName string) *PageResult {
	return a.databaseService.UpdatePageName(userID, pageID, pageName)
}

// GPU control methods

// KillGPUProcess kills a GPU process
func (a *AppService) KillGPUProcess(pid int32) *GPUProcessControlResult {
	return a.gpuControlService.KillProcess(pid)
}

// SuspendGPUProcess suspends a GPU process
func (a *AppService) SuspendGPUProcess(pid int32) *GPUProcessControlResult {
	return a.gpuControlService.SuspendProcess(pid)
}

// ResumeGPUProcess resumes a GPU process
func (a *AppService) ResumeGPUProcess(pid int32) *GPUProcessControlResult {
	return a.gpuControlService.ResumeProcess(pid)
}

// SetGPUProcessPriority sets the priority of a GPU process
func (a *AppService) SetGPUProcessPriority(pid int32, priority string) *GPUProcessControlResult {
	return a.gpuControlService.SetProcessPriority(pid, priority)
}

// ValidateGPUProcess validates if a process is a valid GPU process
func (a *AppService) ValidateGPUProcess(pid int32) *GPUProcessValidationResult {
	return a.gpuControlService.ValidateProcess(pid)
}

// SetGPUProcessMonitoring enables or disables GPU process monitoring
func (a *AppService) SetGPUProcessMonitoring(enabled bool) {
	a.gpuControlService.SetGPUProcessMonitoring(enabled)
}

// Monitoring control methods

// StartMonitoring starts the monitoring service
func (a *AppService) StartMonitoring() error {
	if a.monitoringService == nil {
		return fmt.Errorf("monitoring service not initialized")
	}
	return a.monitoringService.Start()
}

// StopMonitoring stops the monitoring service
func (a *AppService) StopMonitoring() error {
	if a.monitoringService == nil {
		return fmt.Errorf("monitoring service not initialized")
	}
	return a.monitoringService.Stop()
}

// IsMonitoringRunning checks if monitoring is running
func (a *AppService) IsMonitoringRunning() bool {
	if a.monitoringService == nil {
		return false
	}
	return a.monitoringService.IsRunning()
}

// Database methods

// GetWidgets retrieves widgets for a specific user and page
func (a *AppService) GetWidgets(userID, pageID string) *WidgetResult {
	return a.databaseService.GetWidgets(userID, pageID)
}

// SaveWidgets saves widgets for a specific user and page
func (a *AppService) SaveWidgets(userID, pageID string, widgets []map[string]interface{}) *WidgetResult {
	return a.databaseService.SaveWidgets(userID, pageID, widgets)
}

// DeleteWidget deletes a specific widget
func (a *AppService) DeleteWidget(userID, pageID, widgetID string) *WidgetResult {
	return a.databaseService.DeleteWidget(userID, pageID, widgetID)
}

// Service access methods

// GetMonitoringService returns the monitoring service
func (a *AppService) GetMonitoringService() *MonitoringService {
	return a.monitoringService
}

// GetGPUControlService returns the GPU control service
func (a *AppService) GetGPUControlService() *GPUProcessControlService {
	return a.gpuControlService
}

// GetDatabaseService returns the database service
func (a *AppService) GetDatabaseService() *DatabaseService {
	return a.databaseService
}

// GetConfigService returns the config service
func (a *AppService) GetConfigService() *ConfigService {
	return a.configService
}