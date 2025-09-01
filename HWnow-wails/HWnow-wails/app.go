package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
	
	"HWnow-wails/internal/monitoring"
	"HWnow-wails/internal/native"
	db "HWnow-wails/internal/database"
)

// ServerConfig represents server configuration
type ServerConfig struct {
	Port int    `json:"port"`
	Host string `json:"host"`
}

// DatabaseConfig represents database configuration
type DatabaseConfig struct {
	Filename string `json:"filename"`
}

// MonitoringConfig represents monitoring configuration
type MonitoringConfig struct {
	IntervalSeconds         int  `json:"interval_seconds"`         // Default interval for performance metrics
	SecurityCheckSeconds    int  `json:"security_check_seconds"`   // Security checks interval (longer)
	GPUInfoCacheSeconds     int  `json:"gpu_info_cache_seconds"`   // GPU hardware info caching
	RegistryCacheSeconds    int  `json:"registry_cache_seconds"`   // Registry query caching
	EnableCpuMonitoring     bool `json:"enable_cpu_monitoring"`
	EnableMemoryMonitoring  bool `json:"enable_memory_monitoring"`
	EnableDiskMonitoring    bool `json:"enable_disk_monitoring"`
	EnableNetworkMonitoring bool `json:"enable_network_monitoring"`
}

// UIConfig represents UI configuration
type UIConfig struct {
	AutoOpenBrowser bool   `json:"auto_open_browser"`
	Theme          string `json:"theme"`
}

// Config structure for application configuration
type Config struct {
	Server     ServerConfig     `json:"server"`
	Database   DatabaseConfig   `json:"database"`
	Monitoring MonitoringConfig `json:"monitoring"`
	UI         UIConfig         `json:"ui"`
}

// SystemInfo represents system information for Wails binding
type SystemInfo struct {
	Platform     string  `json:"platform"`
	CPUCores     int     `json:"cpu_cores"`
	TotalMemory  float64 `json:"total_memory"`
	BootTime     time.Time `json:"boot_time"`
}

// RealTimeMetrics represents real-time system metrics
type RealTimeMetrics struct {
	CPUUsage       float64                     `json:"cpu_usage"`
	MemoryUsage    float64                     `json:"memory_usage"`
	DiskUsage      *monitoring.DiskUsageInfo   `json:"disk_usage"`
	NetworkIO      []monitoring.NetworkInterface `json:"network_io"`
	Timestamp      time.Time                   `json:"timestamp"`
}

// GPUProcessControlResult represents the result of GPU process control operations
type GPUProcessControlResult struct {
	PID       int32  `json:"pid"`
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	Operation string `json:"operation"`
	Priority  string `json:"priority,omitempty"`
}

// GPUProcessValidationResult represents GPU process validation results
type GPUProcessValidationResult struct {
	PID       int32  `json:"pid"`
	IsValid   bool   `json:"is_valid"`
	Message   string `json:"message"`
	ProcessName string `json:"process_name,omitempty"`
}

// WidgetResult represents widget operations result
type WidgetResult struct {
	UserID   string                   `json:"user_id"`
	PageID   string                   `json:"page_id"`
	Widgets  []map[string]interface{} `json:"widgets"`
	Success  bool                     `json:"success"`
	Message  string                   `json:"message"`
	Count    int                      `json:"count,omitempty"`
	WidgetID string                   `json:"widget_id,omitempty"`
}

// PageResult represents page operations result
type PageResult struct {
	UserID   string                   `json:"user_id"`
	PageID   string                   `json:"page_id,omitempty"`
	PageName string                   `json:"page_name,omitempty"`
	Pages    []map[string]interface{} `json:"pages"`
	Success  bool                     `json:"success"`
	Message  string                   `json:"message"`
}

// App struct
type App struct {
	ctx                     context.Context
	config                  *Config
	monitoringService       *MonitoringService
	gpuProcessControlService *GPUProcessControlService
	databaseService         *DatabaseService
	nativeUI                *native.UIService
}

// NewApp creates a new App application struct
func NewApp() *App {
	// 기본 설정으로 초기화
	defaultConfig := getDefaultConfig()
	return &App{
		config:                   &defaultConfig,
		monitoringService:        NewMonitoringService(),
		gpuProcessControlService: NewGPUProcessControlService(),
		databaseService:         NewDatabaseService(),
		nativeUI:                native.NewUIService(),
	}
}

// OnStartup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) OnStartup(ctx context.Context) {
	a.ctx = ctx
	
	// Load configuration and set cache durations
	config := getDefaultConfig()
	if a.config != nil {
		config = *a.config
	}
	
	// Set security cache duration
	monitoring.SetCacheDuration(time.Duration(config.Monitoring.SecurityCheckSeconds) * time.Second)
	
	// Initialize native UI service
	if err := a.nativeUI.Initialize(ctx); err != nil {
		monitoring.LogError("Failed to initialize native UI service", "error", err)
	}
}

// OnShutdown is called when the app is shutting down
func (a *App) OnShutdown(ctx context.Context) {
	// Clean up native UI resources
	if a.nativeUI != nil {
		a.nativeUI.Cleanup()
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods (Wails 기본 메서드 유지)
func (a *App) startup(ctx context.Context) {
	a.OnStartup(ctx)
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// LoadConfig loads configuration from file or returns default config
func LoadConfig(configPath string) (*Config, error) {
	// 파일이 존재하지 않으면 기본 설정 반환
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		config := getDefaultConfig()
		return &config, nil
	}
	
	// 파일이 존재하면 로드 시도
	data, err := os.ReadFile(configPath)
	if err != nil {
		// 파일 읽기 실패 시 기본 설정 반환
		config := getDefaultConfig()
		return &config, nil
	}
	
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		// JSON 파싱 실패 시 기본 설정 반환
		defaultConfig := getDefaultConfig()
		return &defaultConfig, nil
	}
	
	return &config, nil
}

// getDefaultConfig returns the default configuration
func getDefaultConfig() Config {
	return Config{
		Server: ServerConfig{
			Port: 8080,
			Host: "localhost",
		},
		Database: DatabaseConfig{
			Filename: "monitoring.db",
		},
		Monitoring: MonitoringConfig{
			IntervalSeconds:         2,
			SecurityCheckSeconds:    30,
			GPUInfoCacheSeconds:     30,
			RegistryCacheSeconds:    60,
			EnableCpuMonitoring:     true,
			EnableMemoryMonitoring:  true,
			EnableDiskMonitoring:    true,
			EnableNetworkMonitoring: true,
		},
		UI: UIConfig{
			AutoOpenBrowser: false,
			Theme:          "system",
		},
	}
}

// ====== Phase 2.1 TDD Refactor Phase: 최적화된 모니터링 서비스 Wails 바인딩 ======

// MonitoringService encapsulates monitoring operations
type MonitoringService struct {
	isRunning bool
	mutex     sync.RWMutex
}

// GPUProcessControlService encapsulates GPU process control operations
type GPUProcessControlService struct {
	validPriorities []string
	mutex           sync.RWMutex
}

// NewMonitoringService creates a new monitoring service
func NewMonitoringService() *MonitoringService {
	return &MonitoringService{
		isRunning: false,
	}
}

// NewGPUProcessControlService creates a new GPU process control service
func NewGPUProcessControlService() *GPUProcessControlService {
	return &GPUProcessControlService{
		validPriorities: []string{"low", "normal", "high", "realtime"},
	}
}

// GetSystemInfo returns system information with improved error handling
func (a *App) GetSystemInfo() (*SystemInfo, error) {
	const defaultCPUCores = 1
	const defaultTotalMemory = 0.0
	
	platform := monitoring.GetCurrentPlatform()
	
	// CPU 코어 수 조회 - 더 안전한 기본값 처리
	cpuCores, err := monitoring.GetCPUCores()
	if err != nil {
		monitoring.LogWarn("Failed to get CPU cores", "error", err)
		cpuCores = defaultCPUCores
	}
	
	// 총 메모리 조회 - 더 안전한 기본값 처리
	totalMemory, err := monitoring.GetTotalMemory()
	if err != nil {
		monitoring.LogWarn("Failed to get total memory", "error", err)
		totalMemory = defaultTotalMemory
	}
	
	// 시스템 시작 시간 조회 - 더 안전한 기본값 처리
	bootTime, err := monitoring.GetBootTime()
	if err != nil {
		monitoring.LogWarn("Failed to get boot time", "error", err)
		bootTime = time.Now()
	}
	
	systemInfo := &SystemInfo{
		Platform:     platform,
		CPUCores:     cpuCores,
		TotalMemory:  totalMemory,
		BootTime:     bootTime,
	}
	
	monitoring.LogInfo("System info retrieved successfully", 
		"platform", platform,
		"cores", cpuCores,
		"memory_mb", totalMemory)
	
	return systemInfo, nil
}

// GetRealTimeMetrics returns current system metrics with improved error handling
func (a *App) GetRealTimeMetrics() (*RealTimeMetrics, error) {
	timestamp := time.Now()
	
	// CPU 사용률 - 안전한 기본값 처리
	cpuUsage, err := monitoring.GetCPUUsage()
	if err != nil {
		monitoring.LogWarn("Failed to get CPU usage", "error", err)
		cpuUsage = 0.0
	}
	
	// 메모리 사용률 - 안전한 기본값 처리
	memUsage, err := monitoring.GetMemoryUsage()
	if err != nil {
		monitoring.LogWarn("Failed to get memory usage", "error", err)
		memUsage = 0.0
	}
	
	// 디스크 사용률 - 안전한 기본값 처리
	diskUsage, err := monitoring.GetDiskUsage()
	if err != nil {
		monitoring.LogWarn("Failed to get disk usage", "error", err)
		diskUsage = &monitoring.DiskUsageInfo{
			Total: 0, Used: 0, Free: 0, UsedPercent: 0,
		}
	}
	
	// 네트워크 인터페이스 - 안전한 기본값 처리
	networkIO, err := monitoring.GetNetworkInterfaces()
	if err != nil {
		monitoring.LogWarn("Failed to get network interfaces", "error", err)
		networkIO = []monitoring.NetworkInterface{}
	}
	
	metrics := &RealTimeMetrics{
		CPUUsage:    cpuUsage,
		MemoryUsage: memUsage,
		DiskUsage:   diskUsage,
		NetworkIO:   networkIO,
		Timestamp:   timestamp,
	}
	
	monitoring.LogDebug("Real-time metrics retrieved", 
		"cpu_usage", cpuUsage,
		"memory_usage", memUsage,
		"network_interfaces", len(networkIO))
	
	return metrics, nil
}

// GetGPUInfo returns GPU information with improved error handling and logging
func (a *App) GetGPUInfo() (*monitoring.GPUInfo, error) {
	gpuInfo, err := monitoring.GetGPUInfo()
	if err != nil {
		monitoring.LogInfo("GPU not available or failed to retrieve info", "error", err)
		// GPU가 없거나 조회 실패 시 안전한 기본값 반환
		return &monitoring.GPUInfo{
			Name:         "N/A",
			Usage:        0,
			MemoryUsed:   0,
			MemoryTotal:  0,
			Temperature:  0,
		}, nil
	}
	
	monitoring.LogDebug("GPU info retrieved successfully", 
		"name", gpuInfo.Name,
		"usage", gpuInfo.Usage,
		"memory_used", gpuInfo.MemoryUsed)
	
	return gpuInfo, nil
}

// GetGPUProcesses returns list of GPU processes with improved error handling
func (a *App) GetGPUProcesses() ([]monitoring.GPUProcess, error) {
	processes, err := monitoring.GetGPUProcesses()
	if err != nil {
		monitoring.LogInfo("Failed to get GPU processes", "error", err)
		// 프로세스 없거나 조회 실패 시 빈 배열 반환
		return []monitoring.GPUProcess{}, nil
	}
	
	monitoring.LogDebug("GPU processes retrieved", "count", len(processes))
	return processes, nil
}

// GetTopProcesses returns top processes by resource usage with validation
func (a *App) GetTopProcesses(count int) ([]monitoring.ProcessInfo, error) {
	// 입력 유효성 검사
	if count <= 0 {
		monitoring.LogWarn("Invalid process count requested", "count", count)
		count = 10 // 기본값
	}
	if count > 100 {
		monitoring.LogWarn("Process count too high, limiting", "requested", count, "limited", 100)
		count = 100 // 최대값 제한
	}
	
	processes, err := monitoring.GetTopProcesses(count)
	if err != nil {
		monitoring.LogWarn("Failed to get top processes", "error", err)
		return []monitoring.ProcessInfo{}, nil
	}
	
	monitoring.LogDebug("Top processes retrieved", "requested", count, "actual", len(processes))
	return processes, nil
}

// StartMonitoring starts the monitoring service with improved error handling
func (a *App) StartMonitoring() error {
	return a.monitoringService.Start()
}

// StopMonitoring stops the monitoring service with improved error handling  
func (a *App) StopMonitoring() error {
	return a.monitoringService.Stop()
}

// IsMonitoringRunning returns whether monitoring is active
func (a *App) IsMonitoringRunning() bool {
	return a.monitoringService.IsRunning()
}

// Start starts the monitoring service
func (s *MonitoringService) Start() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	
	if s.isRunning {
		monitoring.LogInfo("Monitoring service already running")
		return nil // 이미 시작됨
	}
	
	// 모니터링 로직 초기화
	// 실제로는 고루틴으로 백그라운드 모니터링을 시작할 것임
	s.isRunning = true
	monitoring.LogInfo("Monitoring service started successfully")
	
	return nil
}

// Stop stops the monitoring service
func (s *MonitoringService) Stop() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	
	if !s.isRunning {
		monitoring.LogInfo("Monitoring service already stopped")
		return nil // 이미 중지됨
	}
	
	s.isRunning = false
	monitoring.LogInfo("Monitoring service stopped successfully")
	
	return nil
}

// IsRunning returns whether monitoring is active
func (s *MonitoringService) IsRunning() bool {
	s.mutex.RLock()
	defer s.mutex.RUnlock()
	
	return s.isRunning
}

// ====== Phase 2.2 TDD Refactor Phase: 최적화된 GPU 프로세스 제어 Wails 바인딩 ======

// validatePID validates process ID input
func (g *GPUProcessControlService) validatePID(pid int32) error {
	if pid <= 0 {
		return fmt.Errorf("invalid PID: must be greater than 0")
	}
	return nil
}

// validatePriority validates priority input
func (g *GPUProcessControlService) validatePriority(priority string) error {
	g.mutex.RLock()
	defer g.mutex.RUnlock()
	
	for _, validPrio := range g.validPriorities {
		if priority == validPrio {
			return nil
		}
	}
	return fmt.Errorf("invalid priority: must be one of %v", g.validPriorities)
}

// createControlResult creates a standardized control result
func (g *GPUProcessControlService) createControlResult(pid int32, success bool, message, operation, priority string) *GPUProcessControlResult {
	return &GPUProcessControlResult{
		PID:       pid,
		Success:   success,
		Message:   message,
		Operation: operation,
		Priority:  priority,
	}
}

// executeProcessControl executes process control operation with standardized logging and error handling
func (g *GPUProcessControlService) executeProcessControl(pid int32, operation string, priority string, controlFunc func(int32) error) *GPUProcessControlResult {
	// 입력 유효성 검사
	if err := g.validatePID(pid); err != nil {
		monitoring.LogWarn("Invalid PID provided", "pid", pid, "operation", operation, "error", err)
		return g.createControlResult(pid, false, err.Error(), operation, priority)
	}
	
	if operation == "set_priority" {
		if err := g.validatePriority(priority); err != nil {
			monitoring.LogWarn("Invalid priority provided", "pid", pid, "priority", priority, "error", err)
			return g.createControlResult(pid, false, err.Error(), operation, priority)
		}
	}
	
	// 작업 실행
	monitoring.LogInfo("Executing GPU process control", "pid", pid, "operation", operation, "priority", priority)
	err := controlFunc(pid)
	if err != nil {
		monitoring.LogError("GPU process control failed", "pid", pid, "operation", operation, "error", err)
		return g.createControlResult(pid, false, err.Error(), operation, priority)
	}
	
	monitoring.LogInfo("GPU process control successful", "pid", pid, "operation", operation)
	return g.createControlResult(pid, true, fmt.Sprintf("GPU process %s successfully", operation), operation, priority)
}

// KillGPUProcess terminates a GPU process using the optimized service architecture
func (a *App) KillGPUProcess(pid int32) *GPUProcessControlResult {
	return a.gpuProcessControlService.executeProcessControl(pid, "killed", "", func(pid int32) error {
		return monitoring.KillGPUProcess(pid)
	})
}

// SuspendGPUProcess suspends a GPU process using the optimized service architecture
func (a *App) SuspendGPUProcess(pid int32) *GPUProcessControlResult {
	return a.gpuProcessControlService.executeProcessControl(pid, "suspended", "", func(pid int32) error {
		return monitoring.SuspendGPUProcess(pid)
	})
}

// ResumeGPUProcess resumes a GPU process using the optimized service architecture
func (a *App) ResumeGPUProcess(pid int32) *GPUProcessControlResult {
	return a.gpuProcessControlService.executeProcessControl(pid, "resumed", "", func(pid int32) error {
		return monitoring.ResumeGPUProcess(pid)
	})
}

// SetGPUProcessPriority sets GPU process priority using the optimized service architecture
func (a *App) SetGPUProcessPriority(pid int32, priority string) *GPUProcessControlResult {
	return a.gpuProcessControlService.executeProcessControl(pid, "set_priority", priority, func(pid int32) error {
		return monitoring.SetGPUProcessPriority(pid, priority)
	})
}

// ValidateGPUProcess validates if a process is a valid GPU process with optimized service architecture
func (a *App) ValidateGPUProcess(pid int32) *GPUProcessValidationResult {
	monitoring.LogInfo("Validating GPU process", "pid", pid)
	
	// 입력 유효성 검사 (서비스 메서드 재사용)
	if err := a.gpuProcessControlService.validatePID(pid); err != nil {
		result := &GPUProcessValidationResult{
			PID:     pid,
			IsValid: false,
			Message: err.Error(),
		}
		monitoring.LogWarn("Invalid PID provided for validation", "pid", pid, "error", err)
		return result
	}
	
	// 기존 모니터링 패키지 함수 활용
	isValid, processName, err := monitoring.VerifyGPUProcess(pid)
	if err != nil {
		result := &GPUProcessValidationResult{
			PID:     pid,
			IsValid: false,
			Message: err.Error(),
		}
		monitoring.LogError("Failed to validate GPU process", "pid", pid, "error", err)
		return result
	}
	
	result := &GPUProcessValidationResult{
		PID:         pid,
		IsValid:     isValid,
		ProcessName: processName,
	}
	
	if isValid {
		result.Message = "Process is a valid GPU process"
		monitoring.LogInfo("GPU process validation successful", "pid", pid, "process_name", processName)
	} else {
		result.Message = "Process is not using GPU or does not exist"
		monitoring.LogInfo("GPU process validation failed", "pid", pid)
	}
	
	return result
}

// ====== Phase 2.3: Database System Integration ======

// ====== Phase 2.3 TDD Refactor Phase: 최적화된 데이터베이스 서비스 아키텍처 ======

// DatabaseService handles database operations with optimized architecture
type DatabaseService struct {
	mutex        sync.RWMutex
	db           *sql.DB
	isInitialized bool
	connectionString string
	configCache   *Config
}

// NewDatabaseService creates a new database service instance
func NewDatabaseService() *DatabaseService {
	return &DatabaseService{
		isInitialized: false,
	}
}

// validateDatabaseConfig validates database configuration parameters
func (ds *DatabaseService) validateDatabaseConfig(dbPath, dbFile string) error {
	if dbPath == "" {
		return fmt.Errorf("database path cannot be empty")
	}
	if dbFile == "" {
		return fmt.Errorf("database file cannot be empty")
	}
	return nil
}

// getDatabasePath gets database path from config or uses default
func (ds *DatabaseService) getDatabasePath() (string, string) {
	dbPath := "./data"
	dbFile := "hwmonitor.db"
	
	// 설정에서 데이터베이스 경로 가져오기 (향후 확장 가능)
	if ds.configCache != nil && ds.configCache.Database.Filename != "" {
		dbFile = ds.configCache.Database.Filename
	}
	
	return dbPath, dbFile
}

// Initialize initializes the database connection and tables with optimized error handling
func (ds *DatabaseService) Initialize() error {
	ds.mutex.Lock()
	defer ds.mutex.Unlock()
	
	// 이미 초기화된 경우 스킵
	if ds.isInitialized && ds.db != nil {
		monitoring.LogInfo("Database service already initialized")
		return nil
	}
	
	// 데이터베이스 경로 설정
	dbPath, dbFile := ds.getDatabasePath()
	
	// 입력 유효성 검사
	if err := ds.validateDatabaseConfig(dbPath, dbFile); err != nil {
		monitoring.LogError("Invalid database configuration", "error", err)
		return err
	}
	
	// 데이터베이스 파일 경로 확인
	dataSourceName, err := db.EnsureDB(dbPath, dbFile)
	if err != nil {
		monitoring.LogError("Failed to ensure database path", "dbPath", dbPath, "dbFile", dbFile, "error", err)
		return fmt.Errorf("database path setup failed: %w", err)
	}
	
	// 데이터베이스 초기화
	ds.db, err = db.InitDB(dataSourceName)
	if err != nil {
		monitoring.LogError("Failed to initialize database", "dataSource", dataSourceName, "error", err)
		return fmt.Errorf("database initialization failed: %w", err)
	}
	
	// 연결 테스트
	if err := ds.db.Ping(); err != nil {
		monitoring.LogError("Failed to ping database", "error", err)
		ds.db.Close()
		ds.db = nil
		return fmt.Errorf("database connection test failed: %w", err)
	}
	
	ds.connectionString = dataSourceName
	ds.isInitialized = true
	monitoring.LogInfo("Database service initialized successfully", "path", dataSourceName, "initialized", ds.isInitialized)
	return nil
}

// Close closes the database connection safely with enhanced cleanup
func (ds *DatabaseService) Close() error {
	ds.mutex.Lock()
	defer ds.mutex.Unlock()
	
	if ds.db != nil {
		// 진행 중인 트랜잭션이 있다면 대기
		monitoring.LogInfo("Closing database connection", "connectionString", ds.connectionString)
		
		err := ds.db.Close()
		if err != nil {
			monitoring.LogError("Failed to close database", "error", err)
			return fmt.Errorf("database close failed: %w", err)
		}
		
		ds.db = nil
		ds.isInitialized = false
		ds.connectionString = ""
		monitoring.LogInfo("Database connection closed successfully")
	}
	return nil
}

// GetConnectionInfo returns database connection information for debugging
func (ds *DatabaseService) GetConnectionInfo() map[string]interface{} {
	ds.mutex.RLock()
	defer ds.mutex.RUnlock()
	
	return map[string]interface{}{
		"initialized":      ds.isInitialized,
		"connectionString": ds.connectionString,
		"hasConnection":    ds.db != nil,
	}
}

// validateUserInput validates user input parameters with enhanced checks
func (ds *DatabaseService) validateUserInput(userID, pageID string) error {
	if userID == "" {
		return fmt.Errorf("userID cannot be empty")
	}
	if len(userID) > 255 {
		return fmt.Errorf("userID too long: maximum 255 characters")
	}
	if pageID == "" {
		return fmt.Errorf("pageID cannot be empty")
	}
	if len(pageID) > 255 {
		return fmt.Errorf("pageID too long: maximum 255 characters")
	}
	return nil
}

// validateWidgetInput validates widget-specific input parameters
func (ds *DatabaseService) validateWidgetInput(widgetID string) error {
	if widgetID == "" {
		return fmt.Errorf("widgetID cannot be empty")
	}
	if len(widgetID) > 255 {
		return fmt.Errorf("widgetID too long: maximum 255 characters")
	}
	return nil
}

// validatePageName validates page name input
func (ds *DatabaseService) validatePageName(pageName string) error {
	if pageName == "" {
		return fmt.Errorf("pageName cannot be empty")
	}
	if len(pageName) > 255 {
		return fmt.Errorf("pageName too long: maximum 255 characters")
	}
	return nil
}

// ensureInitialized ensures the database service is initialized
func (ds *DatabaseService) ensureInitialized() error {
	if ds.db == nil || !ds.isInitialized {
		if err := ds.Initialize(); err != nil {
			return fmt.Errorf("database initialization failed: %w", err)
		}
	}
	return nil
}

// executeWithRetry executes database operation with retry logic for connection failures
func (ds *DatabaseService) executeWithRetry(operation func() error) error {
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		err := operation()
		if err == nil {
			return nil
		}
		
		// 연결 에러인 경우 재초기화 시도
		if i < maxRetries-1 {
			monitoring.LogWarn("Database operation failed, retrying", "attempt", i+1, "error", err)
			ds.isInitialized = false
			if retryErr := ds.ensureInitialized(); retryErr != nil {
				monitoring.LogError("Failed to reinitialize database", "error", retryErr)
				continue
			}
		} else {
			return fmt.Errorf("database operation failed after %d retries: %w", maxRetries, err)
		}
	}
	return nil
}

// GetWidgets retrieves widget list for a specific user and page with optimized error handling
func (a *App) GetWidgets(userID, pageID string) *WidgetResult {
	// 입력 유효성 검사
	if err := a.databaseService.validateUserInput(userID, pageID); err != nil {
		monitoring.LogWarn("Invalid input for GetWidgets", "userID", userID, "pageID", pageID, "error", err)
		return &WidgetResult{
			UserID:  userID,
			PageID:  pageID,
			Widgets: []map[string]interface{}{},
			Success: false,
			Message: err.Error(),
		}
	}
	
	monitoring.LogInfo("Retrieving widgets", "userID", userID, "pageID", pageID)
	
	// 최적화된 데이터베이스 작업 실행
	var widgets []map[string]interface{}
	err := a.databaseService.executeWithRetry(func() error {
		if err := a.databaseService.ensureInitialized(); err != nil {
			return err
		}
		
		// 데이터베이스에서 위젯 조회
		widgetStates, err := db.GetWidgets(a.databaseService.db, userID, pageID)
		if err != nil {
			return fmt.Errorf("failed to query widgets: %w", err)
		}
		
		// 위젯 데이터를 프론트엔드 호환 형태로 변환
		widgets = make([]map[string]interface{}, len(widgetStates))
		for i, ws := range widgetStates {
			widgets[i] = map[string]interface{}{
				"widgetId":   ws.WidgetID,
				"widgetType": ws.WidgetType,
				"config":     ws.Config,
				"layout":     ws.Layout,
			}
		}
		return nil
	})
	
	if err != nil {
		monitoring.LogError("Failed to get widgets from database", "userID", userID, "pageID", pageID, "error", err)
		return &WidgetResult{
			UserID:  userID,
			PageID:  pageID,
			Widgets: []map[string]interface{}{},
			Success: false,
			Message: fmt.Sprintf("Failed to retrieve widgets: %v", err),
		}
	}
	
	monitoring.LogInfo("Widgets retrieved successfully", "userID", userID, "pageID", pageID, "count", len(widgets))
	
	return &WidgetResult{
		UserID:  userID,
		PageID:  pageID,
		Widgets: widgets,
		Success: true,
		Message: fmt.Sprintf("Successfully retrieved %d widgets", len(widgets)),
	}
}

// SaveWidgets saves widget configuration to database
func (a *App) SaveWidgets(userID, pageID string, widgets []map[string]interface{}) *WidgetResult {
	// 입력 유효성 검사
	if err := a.databaseService.validateUserInput(userID, pageID); err != nil {
		monitoring.LogWarn("Invalid input for SaveWidgets", "userID", userID, "pageID", pageID, "error", err)
		return &WidgetResult{
			UserID:  userID,
			PageID:  pageID,
			Widgets: []map[string]interface{}{},
			Success: false,
			Message: err.Error(),
		}
	}
	
	if len(widgets) == 0 {
		monitoring.LogWarn("No widgets provided for saving", "userID", userID, "pageID", pageID)
		return &WidgetResult{
			UserID:  userID,
			PageID:  pageID,
			Widgets: []map[string]interface{}{},
			Success: false,
			Message: "No widgets provided",
		}
	}
	
	// 데이터베이스 초기화 확인
	if a.databaseService.db == nil {
		if err := a.databaseService.Initialize(); err != nil {
			monitoring.LogError("Failed to initialize database for SaveWidgets", "error", err)
			return &WidgetResult{
				UserID:  userID,
				PageID:  pageID,
				Widgets: []map[string]interface{}{},
				Success: false,
				Message: "Database initialization failed",
			}
		}
	}
	
	monitoring.LogInfo("Saving widgets", "userID", userID, "pageID", pageID, "count", len(widgets))
	
	// 위젯 데이터를 데이터베이스 형태로 변환
	widgetStates := make([]db.WidgetState, len(widgets))
	for i, w := range widgets {
		widgetID, _ := w["widgetId"].(string)
		widgetType, _ := w["widgetType"].(string)
		config, _ := w["config"].(string)
		layout, _ := w["layout"].(string)
		
		widgetStates[i] = db.WidgetState{
			UserID:     userID,
			PageID:     pageID,
			WidgetID:   widgetID,
			WidgetType: widgetType,
			Config:     config,
			Layout:     layout,
		}
	}
	
	// 데이터베이스에 위젯 저장
	err := db.SaveWidgets(a.databaseService.db, widgetStates)
	if err != nil {
		monitoring.LogError("Failed to save widgets to database", "userID", userID, "pageID", pageID, "error", err)
		return &WidgetResult{
			UserID:  userID,
			PageID:  pageID,
			Widgets: []map[string]interface{}{},
			Success: false,
			Message: fmt.Sprintf("Failed to save widgets: %v", err),
		}
	}
	
	monitoring.LogInfo("Widgets saved successfully", "userID", userID, "pageID", pageID, "count", len(widgets))
	
	return &WidgetResult{
		UserID:  userID,
		PageID:  pageID,
		Widgets: widgets,
		Success: true,
		Message: fmt.Sprintf("Successfully saved %d widgets", len(widgets)),
		Count:   len(widgets),
	}
}

// DeleteWidget removes a widget from database
func (a *App) DeleteWidget(userID, pageID, widgetID string) *WidgetResult {
	// 입력 유효성 검사
	if err := a.databaseService.validateUserInput(userID, pageID); err != nil {
		monitoring.LogWarn("Invalid input for DeleteWidget", "userID", userID, "pageID", pageID, "error", err)
		return &WidgetResult{
			UserID:   userID,
			PageID:   pageID,
			WidgetID: widgetID,
			Widgets:  []map[string]interface{}{},
			Success:  false,
			Message:  err.Error(),
		}
	}
	
	if widgetID == "" {
		monitoring.LogWarn("WidgetID cannot be empty", "userID", userID, "pageID", pageID)
		return &WidgetResult{
			UserID:   userID,
			PageID:   pageID,
			WidgetID: widgetID,
			Widgets:  []map[string]interface{}{},
			Success:  false,
			Message:  "WidgetID cannot be empty",
		}
	}
	
	// 데이터베이스 초기화 확인
	if a.databaseService.db == nil {
		if err := a.databaseService.Initialize(); err != nil {
			monitoring.LogError("Failed to initialize database for DeleteWidget", "error", err)
			return &WidgetResult{
				UserID:   userID,
				PageID:   pageID,
				WidgetID: widgetID,
				Widgets:  []map[string]interface{}{},
				Success:  false,
				Message:  "Database initialization failed",
			}
		}
	}
	
	monitoring.LogInfo("Deleting widget", "userID", userID, "pageID", pageID, "widgetID", widgetID)
	
	// 데이터베이스에서 위젯 삭제
	err := db.DeleteWidget(a.databaseService.db, userID, pageID, widgetID)
	if err != nil {
		monitoring.LogError("Failed to delete widget from database", "userID", userID, "pageID", pageID, "widgetID", widgetID, "error", err)
		return &WidgetResult{
			UserID:   userID,
			PageID:   pageID,
			WidgetID: widgetID,
			Widgets:  []map[string]interface{}{},
			Success:  false,
			Message:  fmt.Sprintf("Failed to delete widget: %v", err),
		}
	}
	
	monitoring.LogInfo("Widget deleted successfully", "userID", userID, "pageID", pageID, "widgetID", widgetID)
	
	return &WidgetResult{
		UserID:   userID,
		PageID:   pageID,
		WidgetID: widgetID,
		Widgets:  []map[string]interface{}{},
		Success:  true,
		Message:  "Widget deleted successfully",
	}
}

// GetPages retrieves page list for a specific user
func (a *App) GetPages(userID string) *PageResult {
	// 입력 유효성 검사
	if userID == "" {
		monitoring.LogWarn("UserID cannot be empty for GetPages")
		return &PageResult{
			UserID:  userID,
			Pages:   []map[string]interface{}{},
			Success: false,
			Message: "UserID cannot be empty",
		}
	}
	
	// 데이터베이스 초기화 확인
	if a.databaseService.db == nil {
		if err := a.databaseService.Initialize(); err != nil {
			monitoring.LogError("Failed to initialize database for GetPages", "error", err)
			return &PageResult{
				UserID:  userID,
				Pages:   []map[string]interface{}{},
				Success: false,
				Message: "Database initialization failed",
			}
		}
	}
	
	monitoring.LogInfo("Retrieving pages", "userID", userID)
	
	// 데이터베이스에서 페이지 조회
	pageList, err := db.GetPages(a.databaseService.db, userID)
	if err != nil {
		monitoring.LogError("Failed to get pages from database", "userID", userID, "error", err)
		return &PageResult{
			UserID:  userID,
			Pages:   []map[string]interface{}{},
			Success: false,
			Message: fmt.Sprintf("Failed to retrieve pages: %v", err),
		}
	}
	
	// 페이지 데이터를 프론트엔드 호환 형태로 변환
	pages := make([]map[string]interface{}, len(pageList))
	for i, p := range pageList {
		pages[i] = map[string]interface{}{
			"pageId":    p.PageID,
			"pageName":  p.PageName,
			"pageOrder": p.PageOrder,
		}
	}
	
	monitoring.LogInfo("Pages retrieved successfully", "userID", userID, "count", len(pages))
	
	return &PageResult{
		UserID:  userID,
		Pages:   pages,
		Success: true,
		Message: fmt.Sprintf("Successfully retrieved %d pages", len(pages)),
	}
}

// CreatePage creates a new page for a user
func (a *App) CreatePage(userID, pageID, pageName string) *PageResult {
	// 입력 유효성 검사
	if err := a.databaseService.validateUserInput(userID, pageID); err != nil {
		monitoring.LogWarn("Invalid input for CreatePage", "userID", userID, "pageID", pageID, "error", err)
		return &PageResult{
			UserID:   userID,
			PageID:   pageID,
			PageName: pageName,
			Pages:    []map[string]interface{}{},
			Success:  false,
			Message:  err.Error(),
		}
	}
	
	if pageName == "" {
		monitoring.LogWarn("PageName cannot be empty", "userID", userID, "pageID", pageID)
		return &PageResult{
			UserID:   userID,
			PageID:   pageID,
			PageName: pageName,
			Pages:    []map[string]interface{}{},
			Success:  false,
			Message:  "PageName cannot be empty",
		}
	}
	
	// 데이터베이스 초기화 확인
	if a.databaseService.db == nil {
		if err := a.databaseService.Initialize(); err != nil {
			monitoring.LogError("Failed to initialize database for CreatePage", "error", err)
			return &PageResult{
				UserID:   userID,
				PageID:   pageID,
				PageName: pageName,
				Pages:    []map[string]interface{}{},
				Success:  false,
				Message:  "Database initialization failed",
			}
		}
	}
	
	monitoring.LogInfo("Creating page", "userID", userID, "pageID", pageID, "pageName", pageName)
	
	// 데이터베이스에 페이지 생성
	err := db.CreatePage(a.databaseService.db, userID, pageID, pageName)
	if err != nil {
		monitoring.LogError("Failed to create page in database", "userID", userID, "pageID", pageID, "pageName", pageName, "error", err)
		return &PageResult{
			UserID:   userID,
			PageID:   pageID,
			PageName: pageName,
			Pages:    []map[string]interface{}{},
			Success:  false,
			Message:  fmt.Sprintf("Failed to create page: %v", err),
		}
	}
	
	monitoring.LogInfo("Page created successfully", "userID", userID, "pageID", pageID, "pageName", pageName)
	
	return &PageResult{
		UserID:   userID,
		PageID:   pageID,
		PageName: pageName,
		Pages:    []map[string]interface{}{},
		Success:  true,
		Message:  "Page created successfully",
	}
}

// DeletePage removes a page and all its widgets from database
func (a *App) DeletePage(userID, pageID string) *PageResult {
	// 입력 유효성 검사
	if err := a.databaseService.validateUserInput(userID, pageID); err != nil {
		monitoring.LogWarn("Invalid input for DeletePage", "userID", userID, "pageID", pageID, "error", err)
		return &PageResult{
			UserID:  userID,
			PageID:  pageID,
			Pages:   []map[string]interface{}{},
			Success: false,
			Message: err.Error(),
		}
	}
	
	// 데이터베이스 초기화 확인
	if a.databaseService.db == nil {
		if err := a.databaseService.Initialize(); err != nil {
			monitoring.LogError("Failed to initialize database for DeletePage", "error", err)
			return &PageResult{
				UserID:  userID,
				PageID:  pageID,
				Pages:   []map[string]interface{}{},
				Success: false,
				Message: "Database initialization failed",
			}
		}
	}
	
	monitoring.LogInfo("Deleting page", "userID", userID, "pageID", pageID)
	
	// 데이터베이스에서 페이지 삭제 (관련 위젯도 함께 삭제됨)
	err := db.DeletePage(a.databaseService.db, userID, pageID)
	if err != nil {
		monitoring.LogError("Failed to delete page from database", "userID", userID, "pageID", pageID, "error", err)
		return &PageResult{
			UserID:  userID,
			PageID:  pageID,
			Pages:   []map[string]interface{}{},
			Success: false,
			Message: fmt.Sprintf("Failed to delete page: %v", err),
		}
	}
	
	monitoring.LogInfo("Page deleted successfully", "userID", userID, "pageID", pageID)
	
	return &PageResult{
		UserID:  userID,
		PageID:  pageID,
		Pages:   []map[string]interface{}{},
		Success: true,
		Message: "Page deleted successfully",
	}
}

// UpdatePageName updates page name in database
func (a *App) UpdatePageName(userID, pageID, newName string) *PageResult {
	// 입력 유효성 검사
	if err := a.databaseService.validateUserInput(userID, pageID); err != nil {
		monitoring.LogWarn("Invalid input for UpdatePageName", "userID", userID, "pageID", pageID, "error", err)
		return &PageResult{
			UserID:   userID,
			PageID:   pageID,
			PageName: newName,
			Pages:    []map[string]interface{}{},
			Success:  false,
			Message:  err.Error(),
		}
	}
	
	if newName == "" {
		monitoring.LogWarn("NewName cannot be empty", "userID", userID, "pageID", pageID)
		return &PageResult{
			UserID:   userID,
			PageID:   pageID,
			PageName: newName,
			Pages:    []map[string]interface{}{},
			Success:  false,
			Message:  "NewName cannot be empty",
		}
	}
	
	// 데이터베이스 초기화 확인
	if a.databaseService.db == nil {
		if err := a.databaseService.Initialize(); err != nil {
			monitoring.LogError("Failed to initialize database for UpdatePageName", "error", err)
			return &PageResult{
				UserID:   userID,
				PageID:   pageID,
				PageName: newName,
				Pages:    []map[string]interface{}{},
				Success:  false,
				Message:  "Database initialization failed",
			}
		}
	}
	
	monitoring.LogInfo("Updating page name", "userID", userID, "pageID", pageID, "newName", newName)
	
	// 데이터베이스에서 페이지 이름 업데이트
	err := db.UpdatePageName(a.databaseService.db, userID, pageID, newName)
	if err != nil {
		monitoring.LogError("Failed to update page name in database", "userID", userID, "pageID", pageID, "newName", newName, "error", err)
		return &PageResult{
			UserID:   userID,
			PageID:   pageID,
			PageName: newName,
			Pages:    []map[string]interface{}{},
			Success:  false,
			Message:  fmt.Sprintf("Failed to update page name: %v", err),
		}
	}
	
	monitoring.LogInfo("Page name updated successfully", "userID", userID, "pageID", pageID, "newName", newName)
	
	return &PageResult{
		UserID:   userID,
		PageID:   pageID,
		PageName: newName,
		Pages:    []map[string]interface{}{},
		Success:  true,
		Message:  "Page name updated successfully",
	}
}

// ====== Phase 4.1: Native UI Service Frontend Bindings ======

// GetWindowState returns the current window state for the frontend
func (a *App) GetWindowState() native.WindowState {
	if a.nativeUI != nil {
		return a.nativeUI.GetWindowState()
	}
	return native.WindowState{
		IsVisible:   true,
		IsMinimized: false,
		Title:       "HWnow - Hardware Monitor",
	}
}

// ShowWindow shows the application window
func (a *App) ShowWindow() {
	if a.nativeUI != nil {
		a.nativeUI.ShowWindow()
	}
}

// HideToTray hides the window to system tray
func (a *App) HideToTray() {
	if a.nativeUI != nil {
		a.nativeUI.HideToTray()
	}
}

// ShowNotification displays a system notification
func (a *App) ShowNotification(title, message string) error {
	if a.nativeUI != nil {
		return a.nativeUI.ShowNotification(native.NotificationOptions{
			Title:   title,
			Message: message,
			Type:    "info",
		})
	}
	return fmt.Errorf("native UI service not available")
}
