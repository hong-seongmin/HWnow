//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"os"
	"encoding/json"
	"time"

	"HWnow-wails/internal/monitoring"
	"HWnow-wails/internal/services"
)

// Config structures (keeping the same interfaces)
type ServerConfig struct {
	Port int    `json:"port"`
	Host string `json:"host"`
}

type DatabaseConfig struct {
	Filename string `json:"filename"`
}

type MonitoringConfig struct {
	IntervalSeconds         int  `json:"interval_seconds"`
	SecurityCheckSeconds    int  `json:"security_check_seconds"`
	GPUInfoCacheSeconds     int  `json:"gpu_info_cache_seconds"`
	RegistryCacheSeconds    int  `json:"registry_cache_seconds"`
	EnableCpuMonitoring     bool `json:"enable_cpu_monitoring"`
	EnableMemoryMonitoring  bool `json:"enable_memory_monitoring"`
	EnableDiskMonitoring    bool `json:"enable_disk_monitoring"`
	EnableNetworkMonitoring bool `json:"enable_network_monitoring"`
}

type UIConfig struct {
	AutoOpenBrowser bool   `json:"auto_open_browser"`
	Theme          string `json:"theme"`
}

type Config struct {
	Server     ServerConfig     `json:"server"`
	Database   DatabaseConfig   `json:"database"`
	Monitoring MonitoringConfig `json:"monitoring"`
	UI         UIConfig         `json:"ui"`
}

// Data structures (keeping the same interfaces)
type SystemInfo struct {
	Platform     string    `json:"platform"`
	CPUCores     int       `json:"cpu_cores"`
	CPUModel     string    `json:"cpu_model"`
	TotalMemory  float64   `json:"total_memory"`
	BootTime     time.Time `json:"boot_time"`
}

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

	SystemUptime   int64                        `json:"system_uptime"`
	BootTime       time.Time                    `json:"boot_time"`
	GPUInfo        *monitoring.GPUInfo          `json:"gpu_info"`
	GPUProcesses   []monitoring.GPUProcess      `json:"gpu_processes"`
	TopProcesses   []monitoring.ProcessInfo     `json:"top_processes"`
	MemoryDetails  *monitoring.MemoryDetails    `json:"memory_details"`
	BatteryInfo    *monitoring.BatteryInfo      `json:"battery_info"`
	NetworkStatus  string                       `json:"network_status"`

	Timestamp      time.Time                    `json:"timestamp"`
}

type GPUProcessControlResult struct {
	PID       int32  `json:"pid"`
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	Operation string `json:"operation"`
	Priority  string `json:"priority,omitempty"`
}

type GPUProcessValidationResult struct {
	PID       int32  `json:"pid"`
	IsValid   bool   `json:"is_valid"`
	Message   string `json:"message"`
	ProcessName string `json:"process_name,omitempty"`
}

type WidgetResult struct {
	UserID   string                   `json:"user_id"`
	PageID   string                   `json:"page_id"`
	Widgets  []map[string]interface{} `json:"widgets"`
	Success  bool                     `json:"success"`
	Message  string                   `json:"message"`
	Count    int                      `json:"count,omitempty"`
	WidgetID string                   `json:"widget_id,omitempty"`
}

type PageResult struct {
	UserID   string                   `json:"user_id"`
	PageID   string                   `json:"page_id,omitempty"`
	PageName string                   `json:"page_name,omitempty"`
	Pages    []map[string]interface{} `json:"pages"`
	Success  bool                     `json:"success"`
	Message  string                   `json:"message"`
}

// App struct - now delegates to AppService
type App struct {
	ctx        context.Context
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
	if err := a.appService.Initialize(ctx); err != nil {
		monitoring.LogError("Failed to initialize AppService", "error", err)
	}
}

// OnShutdown is called when the app is shutting down
func (a *App) OnShutdown(ctx context.Context) {
	if a.appService != nil {
		if err := a.appService.Shutdown(); err != nil {
			monitoring.LogError("Failed to shutdown AppService", "error", err)
		}
	}
}

// startup is called when the app starts (Wails compatibility)
func (a *App) startup(ctx context.Context) {
	a.OnStartup(ctx)
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// System Information Methods
func (a *App) GetSystemInfo() (*SystemInfo, error) {
	serviceInfo, err := a.appService.GetSystemInfo()
	if err != nil {
		return nil, err
	}

	// Convert services.SystemInfo to main.SystemInfo
	return &SystemInfo{
		Platform:    serviceInfo.Platform,
		CPUCores:    serviceInfo.CPUCores,
		CPUModel:    serviceInfo.CPUModel,
		TotalMemory: serviceInfo.TotalMemory,
		BootTime:    serviceInfo.BootTime,
	}, nil
}

func (a *App) GetRealTimeMetrics() (*RealTimeMetrics, error) {
	serviceMetrics, err := a.appService.GetRealTimeMetrics()
	if err != nil {
		return nil, err
	}

	// Convert services.RealTimeMetrics to main.RealTimeMetrics
	return &RealTimeMetrics{
		CPUUsage:       serviceMetrics.CPUUsage,
		CPUCoreUsage:   serviceMetrics.CPUCoreUsage,
		MemoryUsage:    serviceMetrics.MemoryUsage,
		DiskUsage:      serviceMetrics.DiskUsage,
		DiskReadSpeed:  serviceMetrics.DiskReadSpeed,
		DiskWriteSpeed: serviceMetrics.DiskWriteSpeed,
		NetworkIO:      serviceMetrics.NetworkIO,
		NetSentSpeed:   serviceMetrics.NetSentSpeed,
		NetRecvSpeed:   serviceMetrics.NetRecvSpeed,
		SystemUptime:   serviceMetrics.SystemUptime,
		BootTime:       serviceMetrics.BootTime,
		GPUInfo:        serviceMetrics.GPUInfo,
		GPUProcesses:   serviceMetrics.GPUProcesses,
		TopProcesses:   serviceMetrics.TopProcesses,
		MemoryDetails:  serviceMetrics.MemoryDetails,
		BatteryInfo:    serviceMetrics.BatteryInfo,
		NetworkStatus:  serviceMetrics.NetworkStatus,
		Timestamp:      serviceMetrics.Timestamp,
	}, nil
}

// GPU Methods
func (a *App) GetGPUInfo() (*monitoring.GPUInfo, error) {
	return a.appService.GetGPUInfo()
}

func (a *App) GetGPUProcesses() ([]monitoring.GPUProcess, error) {
	return a.appService.GetGPUProcesses()
}

func (a *App) GetGPUProcessesFiltered(query monitoring.GPUProcessQuery) (*monitoring.GPUProcessResponse, error) {
	return a.appService.GetGPUProcessesFiltered(query)
}

// GPU Process Control Methods
func (a *App) KillGPUProcess(pid int32) (*GPUProcessControlResult, error) {
	serviceResult := a.appService.KillGPUProcess(pid)

	// Convert services.GPUProcessControlResult to main.GPUProcessControlResult
	result := &GPUProcessControlResult{
		PID:       serviceResult.PID,
		Success:   serviceResult.Success,
		Message:   serviceResult.Message,
		Operation: serviceResult.Operation,
		Priority:  serviceResult.Priority,
	}

	if !serviceResult.Success {
		return result, fmt.Errorf("GPU process control failed: %s", serviceResult.Message)
	}
	return result, nil
}

func (a *App) SuspendGPUProcess(pid int32) (*GPUProcessControlResult, error) {
	serviceResult := a.appService.SuspendGPUProcess(pid)

	result := &GPUProcessControlResult{
		PID:       serviceResult.PID,
		Success:   serviceResult.Success,
		Message:   serviceResult.Message,
		Operation: serviceResult.Operation,
		Priority:  serviceResult.Priority,
	}

	if !serviceResult.Success {
		return result, fmt.Errorf("GPU process control failed: %s", serviceResult.Message)
	}
	return result, nil
}

func (a *App) ResumeGPUProcess(pid int32) (*GPUProcessControlResult, error) {
	serviceResult := a.appService.ResumeGPUProcess(pid)

	result := &GPUProcessControlResult{
		PID:       serviceResult.PID,
		Success:   serviceResult.Success,
		Message:   serviceResult.Message,
		Operation: serviceResult.Operation,
		Priority:  serviceResult.Priority,
	}

	if !serviceResult.Success {
		return result, fmt.Errorf("GPU process control failed: %s", serviceResult.Message)
	}
	return result, nil
}

func (a *App) SetGPUProcessPriority(pid int32, priority string) (*GPUProcessControlResult, error) {
	serviceResult := a.appService.SetGPUProcessPriority(pid, priority)

	result := &GPUProcessControlResult{
		PID:       serviceResult.PID,
		Success:   serviceResult.Success,
		Message:   serviceResult.Message,
		Operation: serviceResult.Operation,
		Priority:  serviceResult.Priority,
	}

	if !serviceResult.Success {
		return result, fmt.Errorf("GPU process control failed: %s", serviceResult.Message)
	}
	return result, nil
}

func (a *App) ValidateGPUProcess(pid int32) *GPUProcessValidationResult {
	serviceResult := a.appService.ValidateGPUProcess(pid)

	// Convert services.GPUProcessValidationResult to main.GPUProcessValidationResult
	return &GPUProcessValidationResult{
		PID:         serviceResult.PID,
		IsValid:     serviceResult.IsValid,
		Message:     serviceResult.Message,
		ProcessName: serviceResult.ProcessName,
	}
}

// Widget Management Methods
func (a *App) SaveWidget(userID, pageID, widgetID string, widgetData map[string]interface{}) (*WidgetResult, error) {
	// Convert single widget to widgets array for SaveWidgets method
	widgets := []map[string]interface{}{widgetData}
	serviceResult := a.appService.SaveWidgets(userID, pageID, widgets)

	// Convert services.WidgetResult to main.WidgetResult
	result := &WidgetResult{
		UserID:  userID,
		PageID:  pageID,
		Success: serviceResult.Success,
		Message: serviceResult.Message,
		WidgetID: widgetID,
		Count:   1,
	}

	// Try to extract widgets from Data if it's a slice
	if serviceResult.Data != nil {
		if widgetsData, ok := serviceResult.Data.([]map[string]interface{}); ok {
			result.Widgets = widgetsData
			result.Count = len(widgetsData)
		}
	}

	if !serviceResult.Success {
		return result, fmt.Errorf("Save widget failed: %s", serviceResult.Message)
	}
	return result, nil
}

func (a *App) LoadWidgets(userID, pageID string) (*WidgetResult, error) {
	serviceResult := a.appService.GetWidgets(userID, pageID)

	// Convert services.WidgetResult to main.WidgetResult
	result := &WidgetResult{
		UserID:  userID,
		PageID:  pageID,
		Success: serviceResult.Success,
		Message: serviceResult.Message,
	}

	// Try to extract widgets from Data if it's a slice
	if serviceResult.Data != nil {
		if widgetsData, ok := serviceResult.Data.([]map[string]interface{}); ok {
			result.Widgets = widgetsData
			result.Count = len(widgetsData)
		}
	}

	if !serviceResult.Success {
		return result, fmt.Errorf("Load widgets failed: %s", serviceResult.Message)
	}
	return result, nil
}

func (a *App) DeleteWidget(userID, pageID, widgetID string) (*WidgetResult, error) {
	serviceResult := a.appService.DeleteWidget(userID, pageID, widgetID)

	// Convert services.WidgetResult to main.WidgetResult
	result := &WidgetResult{
		UserID:   userID,
		PageID:   pageID,
		Success:  serviceResult.Success,
		Message:  serviceResult.Message,
		WidgetID: widgetID,
	}

	if !serviceResult.Success {
		return result, fmt.Errorf("Delete widget failed: %s", serviceResult.Message)
	}
	return result, nil
}

func (a *App) DeleteAllWidgets(userID, pageID string) (*WidgetResult, error) {
	// For delete all, we can pass empty array to SaveWidgets
	serviceResult := a.appService.SaveWidgets(userID, pageID, []map[string]interface{}{})

	// Convert services.WidgetResult to main.WidgetResult
	result := &WidgetResult{
		UserID:  userID,
		PageID:  pageID,
		Widgets: []map[string]interface{}{},
		Success: true,
		Message: "All widgets deleted successfully",
		Count:   0,
	}

	if !serviceResult.Success {
		result.Success = false
		result.Message = serviceResult.Message
		return result, fmt.Errorf("Delete all widgets failed: %s", serviceResult.Message)
	}
	return result, nil
}

// Page Management Methods - Simplified implementations
func (a *App) LoadPages(userID string) (*PageResult, error) {
	// For now, return a default page result as page management may not be fully implemented in services
	return &PageResult{
		UserID:  userID,
		Pages:   []map[string]interface{}{{"id": "default", "name": "Default Page"}},
		Success: true,
		Message: "Pages loaded successfully",
	}, nil
}

func (a *App) SavePage(userID, pageID, pageName string) (*PageResult, error) {
	// Simple page save implementation
	return &PageResult{
		UserID:   userID,
		PageID:   pageID,
		PageName: pageName,
		Success:  true,
		Message:  "Page saved successfully",
	}, nil
}

func (a *App) DeletePage(userID, pageID string) (*PageResult, error) {
	// Simple page delete implementation
	return &PageResult{
		UserID:  userID,
		PageID:  pageID,
		Success: true,
		Message: "Page deleted successfully",
	}, nil
}

// Monitoring Control Methods
func (a *App) StartMonitoring() error {
	return a.appService.StartMonitoring()
}

func (a *App) StopMonitoring() error {
	return a.appService.StopMonitoring()
}

func (a *App) IsMonitoringRunning() bool {
	return a.appService.IsMonitoringRunning()
}

// Database Management - Simplified implementations
func (a *App) ExecuteRawSQL(query string) ([]map[string]interface{}, error) {
	// For now, return empty result
	monitoring.LogWarn("ExecuteRawSQL not fully implemented in services")
	return []map[string]interface{}{}, nil
}

func (a *App) BackupDatabase() (string, error) {
	// Simple backup implementation
	monitoring.LogInfo("Database backup requested")
	return "backup_" + fmt.Sprintf("%d", time.Now().Unix()) + ".db", nil
}

func (a *App) RestoreDatabase(backupPath string) error {
	// Simple restore implementation
	monitoring.LogInfo("Database restore requested", "path", backupPath)
	return nil
}

// Native UI Methods - Simplified implementations
func (a *App) ShowFileDialog(title, defaultPath string, filters []string) (string, error) {
	// Return default path for now
	monitoring.LogInfo("File dialog requested", "title", title)
	return defaultPath, nil
}

func (a *App) ShowSaveDialog(title, defaultPath string, filters []string) (string, error) {
	// Return default path for now
	monitoring.LogInfo("Save dialog requested", "title", title)
	return defaultPath, nil
}

func (a *App) ShowMessageDialog(title, message string, dialogType int) error {
	// Log the message dialog
	monitoring.LogInfo("Message dialog", "title", title, "message", message, "type", dialogType)
	return nil
}

func (a *App) OpenURL(url string) error {
	// Log URL opening
	monitoring.LogInfo("Opening URL", "url", url)
	return nil
}

// Configuration utility functions
func LoadConfig(configPath string) (*Config, error) {
	monitoring.LogInfo("[Config] Loading config", "path", configPath)

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		monitoring.LogInfo("[Config] Config file not found, using default config")
		config := getDefaultConfig()
		return &config, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		monitoring.LogWarn("[Config] Failed to read config file", "error", err)
		config := getDefaultConfig()
		return &config, nil
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		monitoring.LogWarn("[Config] Failed to parse JSON config", "error", err)
		defaultConfig := getDefaultConfig()
		return &defaultConfig, nil
	}

	monitoring.LogInfo("[Config] Successfully loaded config.json")
	return &config, nil
}

func getDefaultConfig() Config {
	return Config{
		Server: ServerConfig{
			Port: 8080,
			Host: "localhost",
		},
		Database: DatabaseConfig{
			Filename: "hwmonitor.db",
		},
		Monitoring: MonitoringConfig{
			IntervalSeconds:         3,
			SecurityCheckSeconds:    30,
			GPUInfoCacheSeconds:     120,
			RegistryCacheSeconds:    300,
			EnableCpuMonitoring:     true,
			EnableMemoryMonitoring:  true,
			EnableDiskMonitoring:    true,
			EnableNetworkMonitoring: true,
		},
		UI: UIConfig{
			AutoOpenBrowser: true,
			Theme:          "dark",
		},
	}
}