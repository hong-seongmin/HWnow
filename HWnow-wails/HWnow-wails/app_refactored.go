//go:build ignore
// +build ignore

package main

import (
	"context"

	"HWnow-wails/internal/monitoring"
	"HWnow-wails/internal/services"
)

// App struct
type App struct {
	ctx context.Context
	appService *services.AppService
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		appService: services.NewAppService("config.json"),
	}
}

// OnStartup is called when the app starts
func (a *App) OnStartup(ctx context.Context) {
	a.ctx = ctx
	a.startup(ctx)
}

// OnShutdown is called when the app is closing
func (a *App) OnShutdown(ctx context.Context) {
	if a.appService != nil {
		a.appService.Shutdown()
	}
}

// startup handles the startup logic
func (a *App) startup(ctx context.Context) {
	if err := a.appService.Initialize(ctx); err != nil {
		monitoring.LogError("Failed to initialize application services", "error", err)
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return "Hello " + name + ", It's show time!"
}

// System Information Methods

// GetSystemInfo returns system information
func (a *App) GetSystemInfo() (*services.SystemInfo, error) {
	return a.appService.GetSystemInfo()
}

// GetRealTimeMetrics returns real-time system metrics
func (a *App) GetRealTimeMetrics() (*services.RealTimeMetrics, error) {
	return a.appService.GetRealTimeMetrics()
}

// GPU Methods

// GetGPUInfo returns GPU information
func (a *App) GetGPUInfo() (*monitoring.GPUInfo, error) {
	return a.appService.GetGPUInfo()
}

// GetGPUProcesses returns GPU processes
func (a *App) GetGPUProcesses() ([]monitoring.GPUProcess, error) {
	return a.appService.GetGPUProcesses()
}

// GetGPUProcessesFiltered returns filtered GPU processes
func (a *App) GetGPUProcessesFiltered(query monitoring.GPUProcessQuery) (*monitoring.GPUProcessResponse, error) {
	return a.appService.GetGPUProcessesFiltered(query)
}

// GetGPUProcessesDelta returns GPU process changes
func (a *App) GetGPUProcessesDelta(lastUpdateID string) (*monitoring.GPUProcessDeltaResponse, error) {
	return a.appService.GetGPUProcessesDelta(lastUpdateID)
}

// GetTopProcesses returns top processes
func (a *App) GetTopProcesses(count int) ([]monitoring.ProcessInfo, error) {
	return a.appService.GetTopProcesses(count)
}

// GPU Control Methods

// KillGPUProcess kills a GPU process
func (a *App) KillGPUProcess(pid int32) *services.GPUProcessControlResult {
	return a.appService.KillGPUProcess(pid)
}

// SuspendGPUProcess suspends a GPU process
func (a *App) SuspendGPUProcess(pid int32) *services.GPUProcessControlResult {
	return a.appService.SuspendGPUProcess(pid)
}

// ResumeGPUProcess resumes a GPU process
func (a *App) ResumeGPUProcess(pid int32) *services.GPUProcessControlResult {
	return a.appService.ResumeGPUProcess(pid)
}

// SetGPUProcessPriority sets GPU process priority
func (a *App) SetGPUProcessPriority(pid int32, priority string) *services.GPUProcessControlResult {
	return a.appService.SetGPUProcessPriority(pid, priority)
}

// ValidateGPUProcess validates if a process is a GPU process
func (a *App) ValidateGPUProcess(pid int32) *services.GPUProcessValidationResult {
	return a.appService.ValidateGPUProcess(pid)
}

// SetGPUProcessMonitoring enables/disables GPU process monitoring
func (a *App) SetGPUProcessMonitoring(enabled bool) {
	a.appService.SetGPUProcessMonitoring(enabled)
}

// Monitoring Control Methods

// StartMonitoring starts the monitoring service
func (a *App) StartMonitoring() error {
	return a.appService.StartMonitoring()
}

// StopMonitoring stops the monitoring service
func (a *App) StopMonitoring() error {
	return a.appService.StopMonitoring()
}

// IsMonitoringRunning returns whether monitoring is running
func (a *App) IsMonitoringRunning() bool {
	return a.appService.IsMonitoringRunning()
}

// Database Methods

// GetWidgets retrieves widgets for a user and page
func (a *App) GetWidgets(userID, pageID string) *services.WidgetResult {
	return a.appService.GetWidgets(userID, pageID)
}

// SaveWidgets saves widgets for a user and page
func (a *App) SaveWidgets(userID, pageID string, widgets []map[string]interface{}) *services.WidgetResult {
	return a.appService.SaveWidgets(userID, pageID, widgets)
}

// DeleteWidget deletes a widget
func (a *App) DeleteWidget(userID, pageID, widgetID string) *services.WidgetResult {
	return a.appService.DeleteWidget(userID, pageID, widgetID)
}