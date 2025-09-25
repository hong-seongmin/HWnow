package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
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
	Theme           string `json:"theme"`
}

type Config struct {
	Server     ServerConfig     `json:"server"`
	Database   DatabaseConfig   `json:"database"`
	Monitoring MonitoringConfig `json:"monitoring"`
	UI         UIConfig         `json:"ui"`
}

// Data structures (keeping the same interfaces)
type SystemInfo struct {
	Platform    string    `json:"platform"`
	CPUCores    int       `json:"cpu_cores"`
	CPUModel    string    `json:"cpu_model"`
	TotalMemory float64   `json:"total_memory"`
	BootTime    time.Time `json:"boot_time"`
}

type RealTimeMetrics struct {
	CPUUsage       float64                       `json:"cpu_usage"`
	CPUCoreUsage   []float64                     `json:"cpu_core_usage"`
	MemoryUsage    float64                       `json:"memory_usage"`
	DiskUsage      *monitoring.DiskUsageInfo     `json:"disk_usage"`
	DiskReadSpeed  float64                       `json:"disk_read_speed"`
	DiskWriteSpeed float64                       `json:"disk_write_speed"`
	NetworkIO      []monitoring.NetworkInterface `json:"network_io"`
	NetSentSpeed   float64                       `json:"net_sent_speed"`
	NetRecvSpeed   float64                       `json:"net_recv_speed"`

	SystemUptime  int64                     `json:"system_uptime"`
	BootTime      time.Time                 `json:"boot_time"`
	GPUInfo       *monitoring.GPUInfo       `json:"gpu_info"`
	GPUProcesses  []monitoring.GPUProcess   `json:"gpu_processes"`
	TopProcesses  []monitoring.ProcessInfo  `json:"top_processes"`
	MemoryDetails *monitoring.MemoryDetails `json:"memory_details"`
	BatteryInfo   *monitoring.BatteryInfo   `json:"battery_info"`
	NetworkStatus string                    `json:"network_status"`

	Timestamp time.Time `json:"timestamp"`
}

type GPUProcessControlResult struct {
	PID       int32  `json:"pid"`
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	Operation string `json:"operation"`
	Priority  string `json:"priority,omitempty"`
}

type GPUProcessValidationResult struct {
	PID         int32  `json:"pid"`
	IsValid     bool   `json:"is_valid"`
	Message     string `json:"message"`
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

func convertPageServiceResult(userID, pageID, pageName string, serviceResult *services.PageResult) *PageResult {
	if serviceResult == nil {
		return &PageResult{
			UserID:   userID,
			PageID:   pageID,
			PageName: pageName,
			Success:  false,
			Message:  "nil page result",
		}
	}

	result := &PageResult{
		UserID:   userID,
		PageID:   pageID,
		PageName: pageName,
		Success:  serviceResult.Success,
		Message:  serviceResult.Message,
		Pages:    serviceResult.Pages,
	}

	if len(serviceResult.Pages) > 0 {
		pageData := serviceResult.Pages[0]
		if id, ok := pageData["pageId"].(string); ok && result.PageID == "" {
			result.PageID = id
		}
		if name, ok := pageData["pageName"].(string); ok && result.PageName == "" {
			result.PageName = name
		}
	}

	if result.Pages == nil {
		result.Pages = []map[string]interface{}{}
	}

	return result
}

func convertWidgetServiceResult(
	userID, pageID, widgetID string,
	serviceResult *services.WidgetResult,
	fallbackWidgets []map[string]interface{},
) *WidgetResult {
	result := &WidgetResult{
		UserID:   userID,
		PageID:   pageID,
		WidgetID: widgetID,
		Widgets:  nil,
		Success:  false,
	}

	if len(fallbackWidgets) > 0 {
		result.Widgets = normalizeWidgetList(fallbackWidgets)
	}

	if serviceResult == nil {
		result.Message = "nil widget result"
		if result.Widgets == nil {
			result.Widgets = []map[string]interface{}{}
		}
		result.Count = len(result.Widgets)
		return result
	}

	result.Success = serviceResult.Success
	result.Message = serviceResult.Message

	if widgets := extractWidgetsFromData(serviceResult.Data); len(widgets) > 0 {
		result.Widgets = widgets
	}

	if count, ok := getCountFromData(serviceResult.Data); ok {
		result.Count = count
	}

	if result.Widgets == nil {
		result.Widgets = []map[string]interface{}{}
	}

	if result.Count == 0 {
		result.Count = len(result.Widgets)
	}

	return result
}

func extractWidgetsFromData(data interface{}) []map[string]interface{} {
	switch v := data.(type) {
	case []map[string]interface{}:
		return normalizeWidgetList(v)
	case []interface{}:
		normalized := make([]map[string]interface{}, 0, len(v))
		for _, item := range v {
			if widgetMap, ok := item.(map[string]interface{}); ok {
				normalized = append(normalized, normalizeWidgetMap(widgetMap))
			}
		}
		return normalized
	case map[string]interface{}:
		return normalizeWidgetList([]map[string]interface{}{v})
	default:
		return nil
	}
}

func getCountFromData(data interface{}) (int, bool) {
	switch v := data.(type) {
	case int:
		return v, true
	case int8:
		return int(v), true
	case int16:
		return int(v), true
	case int32:
		return int(v), true
	case int64:
		return int(v), true
	case uint:
		return int(v), true
	case uint8:
		return int(v), true
	case uint16:
		return int(v), true
	case uint32:
		return int(v), true
	case uint64:
		return int(v), true
	case float32:
		return int(v), true
	case float64:
		return int(v), true
	case json.Number:
		if num, err := v.Int64(); err == nil {
			return int(num), true
		}
	}
	return 0, false
}

func normalizeWidgetList(widgets []map[string]interface{}) []map[string]interface{} {
	normalized := make([]map[string]interface{}, 0, len(widgets))
	for _, widget := range widgets {
		if widget == nil {
			continue
		}
		normalized = append(normalized, normalizeWidgetMap(widget))
	}
	return normalized
}

func normalizeWidgetMap(widget map[string]interface{}) map[string]interface{} {
	normalized := map[string]interface{}{
		"widgetId":   getFirstString(widget, "widgetId", "widget_id", "id"),
		"widgetType": getFirstString(widget, "widgetType", "widget_type", "type"),
		"config":     widget["config"],
		"layout":     widget["layout"],
	}

	if normalized["config"] == nil {
		normalized["config"] = ""
	}
	if normalized["layout"] == nil {
		normalized["layout"] = ""
	}

	return normalized
}

func getFirstString(widget map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := widget[key]; ok {
			switch v := value.(type) {
			case string:
				if v != "" {
					return v
				}
			case fmt.Stringer:
				str := v.String()
				if str != "" {
					return str
				}
			case int:
				return fmt.Sprintf("%d", v)
			case int8:
				return fmt.Sprintf("%d", v)
			case int16:
				return fmt.Sprintf("%d", v)
			case int32:
				return fmt.Sprintf("%d", v)
			case int64:
				return fmt.Sprintf("%d", v)
			case uint:
				return fmt.Sprintf("%d", v)
			case uint8:
				return fmt.Sprintf("%d", v)
			case uint16:
				return fmt.Sprintf("%d", v)
			case uint32:
				return fmt.Sprintf("%d", v)
			case uint64:
				return fmt.Sprintf("%d", v)
			case float32:
				return fmt.Sprintf("%v", v)
			case float64:
				return fmt.Sprintf("%v", v)
			case json.Number:
				return v.String()
			default:
				if v != nil {
					str := fmt.Sprintf("%v", v)
					if str != "" && str != "<nil>" {
						return str
					}
				}
			}
		}
	}
	return ""
}

func ensureJSONString(value interface{}) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case string:
		return v
	case []byte:
		return string(v)
	default:
		bytes, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(bytes)
	}
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

func (a *App) GetTopProcesses(count int) ([]monitoring.ProcessInfo, error) {
	return a.appService.GetTopProcesses(count)
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

func (a *App) SetGPUProcessMonitoring(enabled bool) error {
	if a.appService == nil {
		return fmt.Errorf("app service not initialized")
	}
	a.appService.SetGPUProcessMonitoring(enabled)
	return nil
}

// Widget Management Methods
func (a *App) GetWidgets(userID, pageID string) (*WidgetResult, error) {
	serviceResult := a.appService.GetWidgets(userID, pageID)
	result := convertWidgetServiceResult(userID, pageID, "", serviceResult, nil)

	if !result.Success {
		return result, fmt.Errorf("Get widgets failed: %s", result.Message)
	}

	return result, nil
}

func (a *App) SaveWidgets(userID, pageID string, widgets []map[string]interface{}) (*WidgetResult, error) {
	normalizedWidgets := normalizeWidgetList(widgets)

	if len(normalizedWidgets) == 0 {
		cleared, err := a.DeleteAllWidgets(userID, pageID)
		if cleared != nil {
			cleared.Message = "All widgets deleted successfully"
		}
		return cleared, err
	}

	servicePayload := make([]map[string]interface{}, 0, len(normalizedWidgets))
	for _, widget := range normalizedWidgets {
		widgetID := getFirstString(widget, "widgetId")
		if widgetID == "" {
			failure := &WidgetResult{
				UserID:  userID,
				PageID:  pageID,
				Widgets: normalizedWidgets,
				Success: false,
				Message: "widgetId is required for all widgets",
			}
			return failure, fmt.Errorf("widgetId is required for all widgets")
		}

		servicePayload = append(servicePayload, map[string]interface{}{
			"widget_id":   widgetID,
			"widget_type": getFirstString(widget, "widgetType"),
			"config":      ensureJSONString(widget["config"]),
			"layout":      ensureJSONString(widget["layout"]),
		})
	}

	serviceResult := a.appService.SaveWidgets(userID, pageID, servicePayload)
	result := convertWidgetServiceResult(userID, pageID, "", serviceResult, normalizedWidgets)

	if !result.Success {
		return result, fmt.Errorf("Save widgets failed: %s", result.Message)
	}

	return result, nil
}

func (a *App) SaveWidget(userID, pageID, widgetID string, widgetData map[string]interface{}) (*WidgetResult, error) {
	if widgetData == nil {
		widgetData = map[string]interface{}{}
	}
	if widgetID != "" && getFirstString(widgetData, "widgetId", "widget_id", "id") == "" {
		widgetData = normalizeWidgetMap(widgetData)
		widgetData["widgetId"] = widgetID
	}

	result, err := a.SaveWidgets(userID, pageID, []map[string]interface{}{widgetData})
	if result != nil && result.WidgetID == "" {
		result.WidgetID = widgetID
	}
	return result, err
}

func (a *App) LoadWidgets(userID, pageID string) (*WidgetResult, error) {
	return a.GetWidgets(userID, pageID)
}

func (a *App) DeleteWidget(userID, pageID, widgetID string) (*WidgetResult, error) {
	serviceResult := a.appService.DeleteWidget(userID, pageID, widgetID)
	result := convertWidgetServiceResult(userID, pageID, widgetID, serviceResult, nil)

	if !result.Success {
		return result, fmt.Errorf("Delete widget failed: %s", result.Message)
	}

	return result, nil
}

func (a *App) DeleteAllWidgets(userID, pageID string) (*WidgetResult, error) {
	serviceResult := a.appService.GetWidgets(userID, pageID)
	current := convertWidgetServiceResult(userID, pageID, "", serviceResult, nil)

	if !current.Success {
		return current, fmt.Errorf("Load widgets failed: %s", current.Message)
	}

	if current.Count == 0 {
		return &WidgetResult{
			UserID:  userID,
			PageID:  pageID,
			Widgets: []map[string]interface{}{},
			Success: true,
			Message: "No widgets to delete",
			Count:   0,
		}, nil
	}

	for _, widget := range current.Widgets {
		widgetID := getFirstString(widget, "widgetId")
		if widgetID == "" {
			continue
		}

		deleteResult := a.appService.DeleteWidget(userID, pageID, widgetID)
		if deleteResult == nil || !deleteResult.Success {
			errMessage := "unknown error"
			if deleteResult != nil && deleteResult.Message != "" {
				errMessage = deleteResult.Message
			}
			failure := &WidgetResult{
				UserID:   userID,
				PageID:   pageID,
				WidgetID: widgetID,
				Success:  false,
				Message:  fmt.Sprintf("Failed to delete widget %s: %s", widgetID, errMessage),
			}
			return failure, fmt.Errorf("Failed to delete widget %s: %s", widgetID, errMessage)
		}
	}

	return &WidgetResult{
		UserID:  userID,
		PageID:  pageID,
		Widgets: []map[string]interface{}{},
		Success: true,
		Message: "All widgets deleted successfully",
		Count:   0,
	}, nil
}

// Page Management Methods
func (a *App) GetPages(userID string) (*PageResult, error) {
	serviceResult := a.appService.GetPages(userID)
	result := convertPageServiceResult(userID, "", "", serviceResult)

	if !result.Success {
		return result, fmt.Errorf("Get pages failed: %s", result.Message)
	}

	return result, nil
}

func (a *App) CreatePage(userID, pageID, pageName string) (*PageResult, error) {
	serviceResult := a.appService.CreatePage(userID, pageID, pageName)
	result := convertPageServiceResult(userID, pageID, pageName, serviceResult)

	if !result.Success {
		return result, fmt.Errorf("Create page failed: %s", result.Message)
	}

	return result, nil
}

func (a *App) DeletePage(userID, pageID string) (*PageResult, error) {
	serviceResult := a.appService.DeletePage(userID, pageID)
	result := convertPageServiceResult(userID, pageID, "", serviceResult)

	if !result.Success {
		return result, fmt.Errorf("Delete page failed: %s", result.Message)
	}

	return result, nil
}

func (a *App) UpdatePageName(userID, pageID, pageName string) (*PageResult, error) {
	serviceResult := a.appService.UpdatePageName(userID, pageID, pageName)
	result := convertPageServiceResult(userID, pageID, pageName, serviceResult)

	if !result.Success {
		return result, fmt.Errorf("Update page name failed: %s", result.Message)
	}

	return result, nil
}

// Legacy compatibility wrappers
func (a *App) LoadPages(userID string) (*PageResult, error) {
	return a.GetPages(userID)
}

func (a *App) SavePage(userID, pageID, pageName string) (*PageResult, error) {
	if pageID == "" {
		return a.CreatePage(userID, pageID, pageName)
	}
	return a.UpdatePageName(userID, pageID, pageName)
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
			Theme:           "dark",
		},
	}
}
