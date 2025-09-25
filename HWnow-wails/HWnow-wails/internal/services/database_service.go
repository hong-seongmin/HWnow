package services

import (
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"HWnow-wails/internal/monitoring"
	db "HWnow-wails/internal/database"
)

// WidgetResult represents the result of widget operations
type WidgetResult struct {
	Success   bool        `json:"success"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
	ErrorCode int         `json:"error_code,omitempty"`
}

// PageResult represents the result of page operations
type PageResult struct {
	Success   bool                     `json:"success"`
	Message   string                   `json:"message"`
	Pages     []map[string]interface{} `json:"pages,omitempty"`
	ErrorCode int                      `json:"error_code,omitempty"`
}

// DatabaseService provides database functionality
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

// SetConfig sets the configuration for the database service
func (ds *DatabaseService) SetConfig(config *Config) {
	ds.mutex.Lock()
	defer ds.mutex.Unlock()
	ds.configCache = config
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
		monitoring.LogInfo("Database connection closed successfully")
	}

	return nil
}

// GetConnectionInfo returns database connection information for debugging
func (ds *DatabaseService) GetConnectionInfo() map[string]interface{} {
	ds.mutex.RLock()
	defer ds.mutex.RUnlock()

	info := map[string]interface{}{
		"initialized":       ds.isInitialized,
		"connection_string": ds.connectionString,
		"connected":         ds.db != nil,
	}

	if ds.db != nil {
		// 연결 상태 확인
		if err := ds.db.Ping(); err != nil {
			info["ping_error"] = err.Error()
		} else {
			info["ping_status"] = "success"
		}
	}

	return info
}

// GetWidgets retrieves widgets for a specific user and page with enhanced error handling and caching
func (ds *DatabaseService) GetWidgets(userID, pageID string) *WidgetResult {
	if err := ds.validateUserInput(userID, pageID); err != nil {
		return &WidgetResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}

	if err := ds.ensureInitialized(); err != nil {
		return &WidgetResult{
			Success:   false,
			Message:   fmt.Sprintf("Database initialization failed: %v", err),
			ErrorCode: 500,
		}
	}

	var widgets []db.WidgetState
	err := ds.executeWithRetry(func() error {
		var queryErr error
		widgets, queryErr = db.GetWidgets(ds.db, userID, pageID)
		return queryErr
	})

	if err != nil {
		monitoring.LogError("Failed to get widgets", "userID", userID, "pageID", pageID, "error", err)
		return &WidgetResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to retrieve widgets: %v", err),
			ErrorCode: 500,
		}
	}

	// Convert WidgetState to map for compatibility
	widgetMaps := make([]map[string]interface{}, len(widgets))
	for i, w := range widgets {
		widgetMaps[i] = map[string]interface{}{
			"widget_id":  w.WidgetID,
			"widget_type": w.WidgetType,
			"config":     w.Config,
			"layout":     w.Layout,
			"user_id":    w.UserID,
			"page_id":    w.PageID,
		}
	}

	monitoring.LogInfo("Retrieved widgets successfully", "userID", userID, "pageID", pageID, "count", len(widgets))
	return &WidgetResult{
		Success: true,
		Message: fmt.Sprintf("Successfully retrieved %d widgets", len(widgets)),
		Data:    widgetMaps,
	}
}

// SaveWidgets saves widgets for a specific user and page with transaction support and validation
func (ds *DatabaseService) SaveWidgets(userID, pageID string, widgets []map[string]interface{}) *WidgetResult {
	if err := ds.validateUserInput(userID, pageID); err != nil {
		return &WidgetResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}

	if len(widgets) == 0 {
		return &WidgetResult{
			Success:   false,
			Message:   "No widgets provided to save",
			ErrorCode: 400,
		}
	}

	if err := ds.ensureInitialized(); err != nil {
		return &WidgetResult{
			Success:   false,
			Message:   fmt.Sprintf("Database initialization failed: %v", err),
			ErrorCode: 500,
		}
	}

	// Convert map to WidgetState for database compatibility
	widgetStates := make([]db.WidgetState, len(widgets))
	for i, w := range widgets {
		widgetStates[i] = db.WidgetState{
			WidgetID:   getString(w, "widget_id"),
			WidgetType: getString(w, "widget_type"),
			Config:     getString(w, "config"),
			Layout:     getString(w, "layout"),
			UserID:     userID,
			PageID:     pageID,
		}
	}

	err := ds.executeWithRetry(func() error {
		return db.SaveWidgets(ds.db, widgetStates)
	})

	if err != nil {
		monitoring.LogError("Failed to save widgets", "userID", userID, "pageID", pageID, "widgetCount", len(widgets), "error", err)
		return &WidgetResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to save widgets: %v", err),
			ErrorCode: 500,
		}
	}

	monitoring.LogInfo("Saved widgets successfully", "userID", userID, "pageID", pageID, "count", len(widgets))
	return &WidgetResult{
		Success: true,
		Message: fmt.Sprintf("Successfully saved %d widgets", len(widgets)),
		Data:    len(widgets),
	}
}

// DeleteWidget deletes a specific widget with comprehensive validation
func (ds *DatabaseService) DeleteWidget(userID, pageID, widgetID string) *WidgetResult {
	if err := ds.validateUserInput(userID, pageID); err != nil {
		return &WidgetResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}

	if err := ds.validateWidgetInput(widgetID); err != nil {
		return &WidgetResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}

	if err := ds.ensureInitialized(); err != nil {
		return &WidgetResult{
			Success:   false,
			Message:   fmt.Sprintf("Database initialization failed: %v", err),
			ErrorCode: 500,
		}
	}

	err := ds.executeWithRetry(func() error {
		return db.DeleteWidget(ds.db, userID, pageID, widgetID)
	})

	if err != nil {
		monitoring.LogError("Failed to delete widget", "userID", userID, "pageID", pageID, "widgetID", widgetID, "error", err)
		return &WidgetResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to delete widget: %v", err),
			ErrorCode: 500,
		}
	}

	monitoring.LogInfo("Deleted widget successfully", "userID", userID, "pageID", pageID, "widgetID", widgetID)
	return &WidgetResult{
		Success: true,
		Message: "Widget deleted successfully",
	}
}


// GetPages retrieves all pages for a user
func (ds *DatabaseService) GetPages(userID string) *PageResult {
	if err := ds.validateUserID(userID); err != nil {
		return &PageResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}

	if err := ds.ensureInitialized(); err != nil {
		monitoring.LogError("Failed to initialize database when getting pages", "error", err)
		return &PageResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to initialize database: %v", err),
			ErrorCode: 500,
		}
	}

	var pages []db.Page
	err := ds.executeWithRetry(func() error {
		var queryErr error
		pages, queryErr = db.GetPages(ds.db, userID)
		return queryErr
	})
	if err != nil {
		monitoring.LogError("Failed to get pages", "userID", userID, "error", err)
		return &PageResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to retrieve pages: %v", err),
			ErrorCode: 500,
		}
	}

	pageMaps := make([]map[string]interface{}, 0, len(pages))
	for _, page := range pages {
		pageMaps = append(pageMaps, map[string]interface{}{
			"pageId":    page.PageID,
			"pageName":  page.PageName,
			"pageOrder": page.PageOrder,
		})
	}

	monitoring.LogInfo("Retrieved pages successfully", "userID", userID, "count", len(pageMaps))
	return &PageResult{
		Success: true,
		Message: fmt.Sprintf("Successfully retrieved %d pages", len(pageMaps)),
		Pages:   pageMaps,
	}
}

// CreatePage creates a new page for a user
func (ds *DatabaseService) CreatePage(userID, pageID, pageName string) *PageResult {
	if err := ds.validateUserInput(userID, pageID); err != nil {
		return &PageResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}
	if err := ds.validatePageName(pageName); err != nil {
		return &PageResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}

	if err := ds.ensureInitialized(); err != nil {
		monitoring.LogError("Failed to initialize database when creating page", "error", err)
		return &PageResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to initialize database: %v", err),
			ErrorCode: 500,
		}
	}

	err := ds.executeWithRetry(func() error {
		return db.CreatePage(ds.db, userID, pageID, pageName)
	})
	if err != nil {
		monitoring.LogError("Failed to create page", "userID", userID, "pageID", pageID, "error", err)
		return &PageResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to create page: %v", err),
			ErrorCode: 500,
		}
	}

	monitoring.LogInfo("Page created successfully", "userID", userID, "pageID", pageID)
	return &PageResult{
		Success: true,
		Message: "Page created successfully",
		Pages: []map[string]interface{}{
			{
				"pageId":   pageID,
				"pageName": pageName,
			},
		},
	}
}

// DeletePage removes a page and all its widgets
func (ds *DatabaseService) DeletePage(userID, pageID string) *PageResult {
	if err := ds.validateUserInput(userID, pageID); err != nil {
		return &PageResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}

	if err := ds.ensureInitialized(); err != nil {
		monitoring.LogError("Failed to initialize database when deleting page", "error", err)
		return &PageResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to initialize database: %v", err),
			ErrorCode: 500,
		}
	}

	err := ds.executeWithRetry(func() error {
		return db.DeletePage(ds.db, userID, pageID)
	})
	if err != nil {
		monitoring.LogError("Failed to delete page", "userID", userID, "pageID", pageID, "error", err)
		return &PageResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to delete page: %v", err),
			ErrorCode: 500,
		}
	}

	monitoring.LogInfo("Page deleted successfully", "userID", userID, "pageID", pageID)
	return &PageResult{
		Success: true,
		Message: "Page deleted successfully",
	}
}

// UpdatePageName updates the page name for a given page
func (ds *DatabaseService) UpdatePageName(userID, pageID, pageName string) *PageResult {
	if err := ds.validateUserInput(userID, pageID); err != nil {
		return &PageResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}
	if err := ds.validatePageName(pageName); err != nil {
		return &PageResult{
			Success:   false,
			Message:   err.Error(),
			ErrorCode: 400,
		}
	}

	if err := ds.ensureInitialized(); err != nil {
		monitoring.LogError("Failed to initialize database when updating page name", "error", err)
		return &PageResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to initialize database: %v", err),
			ErrorCode: 500,
		}
	}

	err := ds.executeWithRetry(func() error {
		return db.UpdatePageName(ds.db, userID, pageID, pageName)
	})
	if err != nil {
		monitoring.LogError("Failed to update page name", "userID", userID, "pageID", pageID, "error", err)
		return &PageResult{
			Success:   false,
			Message:   fmt.Sprintf("Failed to update page name: %v", err),
			ErrorCode: 500,
		}
	}

	monitoring.LogInfo("Page name updated successfully", "userID", userID, "pageID", pageID)
	return &PageResult{
		Success: true,
		Message: "Page name updated successfully",
		Pages: []map[string]interface{}{
			{
				"pageId":   pageID,
				"pageName": pageName,
			},
		},
	}
}

// Helper methods

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

// validateUserID validates only user identifier
func (ds *DatabaseService) validateUserID(userID string) error {
	if strings.TrimSpace(userID) == "" {
		return fmt.Errorf("userID cannot be empty")
	}
	if len(userID) > 100 {
		return fmt.Errorf("userID too long (max 100 characters)")
	}
	return nil
}

// validateUserInput validates user input parameters
func (ds *DatabaseService) validateUserInput(userID, pageID string) error {
	if strings.TrimSpace(userID) == "" {
		return fmt.Errorf("userID cannot be empty")
	}
	if strings.TrimSpace(pageID) == "" {
		return fmt.Errorf("pageID cannot be empty")
	}
	if len(userID) > 100 {
		return fmt.Errorf("userID too long (max 100 characters)")
	}
	if len(pageID) > 100 {
		return fmt.Errorf("pageID too long (max 100 characters)")
	}
	return nil
}

// validateWidgetInput validates widget input parameters
func (ds *DatabaseService) validateWidgetInput(widgetID string) error {
	if strings.TrimSpace(widgetID) == "" {
		return fmt.Errorf("widgetID cannot be empty")
	}
	if len(widgetID) > 100 {
		return fmt.Errorf("widgetID too long (max 100 characters)")
	}
	return nil
}

// validatePageName validates page name input
func (ds *DatabaseService) validatePageName(pageName string) error {
	if strings.TrimSpace(pageName) == "" {
		return fmt.Errorf("page name cannot be empty")
	}
	if len(pageName) > 100 {
		return fmt.Errorf("page name too long (max 100 characters)")
	}
	return nil
}

// ensureInitialized ensures the database is initialized
func (ds *DatabaseService) ensureInitialized() error {
	if !ds.isInitialized || ds.db == nil {
		return ds.Initialize()
	}
	return nil
}

// executeWithRetry executes a database operation with retry logic
func (ds *DatabaseService) executeWithRetry(operation func() error) error {
	const maxRetries = 3
	const retryDelay = 100 * time.Millisecond

	var lastErr error
	for i := 0; i < maxRetries; i++ {
		if err := operation(); err != nil {
			lastErr = err
			if i < maxRetries-1 {
				monitoring.LogWarn("Database operation failed, retrying", "attempt", i+1, "maxRetries", maxRetries, "error", err)
				time.Sleep(retryDelay * time.Duration(i+1)) // Exponential backoff
				continue
			}
		} else {
			return nil // Success
		}
	}

	return fmt.Errorf("operation failed after %d retries: %w", maxRetries, lastErr)
}

// getString safely extracts a string value from a map
func getString(m map[string]interface{}, key string) string {
	if val, ok := m[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}