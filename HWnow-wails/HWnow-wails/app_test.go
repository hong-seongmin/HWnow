package main

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestApp_NewApp_ShouldCreateAppInstance - App 인스턴스 생성 테스트
func TestApp_NewApp_ShouldCreateAppInstance(t *testing.T) {
	// Red Phase: 먼저 실패하는 테스트 작성
	app := NewApp()
	
	assert.NotNil(t, app, "App 인스턴스가 nil이면 안됨")
	assert.NotNil(t, app.config, "App.config가 초기화되어야 함")
	assert.Nil(t, app.ctx, "App.ctx는 OnStartup 전까지 nil이어야 함")
}

// TestApp_OnStartup_ShouldInitializeContext - OnStartup 초기화 테스트
func TestApp_OnStartup_ShouldInitializeContext(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	
	// OnStartup 호출
	app.OnStartup(ctx)
	
	// 컨텍스트가 설정되어야 함
	assert.Equal(t, ctx, app.ctx, "컨텍스트가 올바르게 설정되어야 함")
	assert.NotNil(t, app.config, "설정이 초기화되어야 함")
}

// TestApp_OnShutdown_ShouldCleanupResources - OnShutdown 정리 테스트
func TestApp_OnShutdown_ShouldCleanupResources(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	
	// 먼저 시작
	app.OnStartup(ctx)
	
	// 종료 테스트
	app.OnShutdown(ctx)
	
	// 리소스가 정리되었는지 확인
	// 현재는 특별한 정리 작업이 없지만, 향후 DB 연결 등이 추가되면 확인
	assert.NotNil(t, app, "앱 인스턴스는 여전히 존재해야 함")
}

// TestConfig_LoadConfig_ShouldLoadDefaultConfig - 기본 설정 로드 테스트
func TestConfig_LoadConfig_ShouldLoadDefaultConfig(t *testing.T) {
	config, err := LoadConfig("nonexistent.json")
	
	assert.NoError(t, err, "존재하지 않는 설정 파일에 대해 기본 설정을 반환해야 함")
	assert.NotNil(t, config, "설정이 nil이면 안됨")
	assert.Equal(t, 8080, config.Server.Port, "기본 포트가 8080이어야 함")
	assert.Equal(t, "localhost", config.Server.Host, "기본 호스트가 localhost여야 함")
}

// TestConfig_LoadConfig_ShouldLoadCustomConfig - 커스텀 설정 로드 테스트
func TestConfig_LoadConfig_ShouldLoadCustomConfig(t *testing.T) {
	// 테스트용 임시 설정 파일 내용
	testConfigContent := `{
		"server": {
			"port": 9090,
			"host": "127.0.0.1"
		},
		"database": {
			"filename": "test.db"
		},
		"monitoring": {
			"interval_seconds": 5,
			"enable_cpu_monitoring": true,
			"enable_memory_monitoring": true,
			"enable_disk_monitoring": false,
			"enable_network_monitoring": true
		},
		"ui": {
			"auto_open_browser": true,
			"theme": "dark"
		}
	}`
	
	// 임시 파일 생성
	tmpFile := createTempConfigFile(t, testConfigContent)
	defer removeTempFile(tmpFile)
	
	config, err := LoadConfig(tmpFile)
	
	assert.NoError(t, err, "유효한 설정 파일 로드에서 에러가 발생하면 안됨")
	assert.Equal(t, 9090, config.Server.Port, "커스텀 포트가 올바르게 로드되어야 함")
	assert.Equal(t, "127.0.0.1", config.Server.Host, "커스텀 호스트가 올바르게 로드되어야 함")
	assert.Equal(t, "test.db", config.Database.Filename, "커스텀 DB 파일명이 올바르게 로드되어야 함")
	assert.Equal(t, 5, config.Monitoring.IntervalSeconds, "커스텀 모니터링 간격이 올바르게 로드되어야 함")
	assert.Equal(t, "dark", config.UI.Theme, "커스텀 테마가 올바르게 로드되어야 함")
}

// 헬퍼 함수들
func createTempConfigFile(t *testing.T, content string) string {
	tmpFile := "test_config.json"
	err := os.WriteFile(tmpFile, []byte(content), 0644)
	assert.NoError(t, err, "임시 설정 파일 생성에 실패하면 안됨")
	return tmpFile
}

func removeTempFile(filename string) {
	os.Remove(filename)
}

// ====== Phase 2.1 TDD Red Phase: 모니터링 서비스 Wails 바인딩 테스트 ======

// TestApp_GetSystemInfo_ShouldReturnSystemInfo - 시스템 정보 조회 테스트
func TestApp_GetSystemInfo_ShouldReturnSystemInfo(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// Wails 바인딩으로 노출될 GetSystemInfo 메서드 테스트
	systemInfo, err := app.GetSystemInfo()
	
	assert.NoError(t, err, "시스템 정보 조회에서 에러가 발생하면 안됨")
	assert.NotNil(t, systemInfo, "시스템 정보가 nil이면 안됨")
	assert.NotEmpty(t, systemInfo.Platform, "플랫폼 정보가 있어야 함")
	assert.Greater(t, systemInfo.CPUCores, 0, "CPU 코어 수가 0보다 커야 함")
	assert.Greater(t, systemInfo.TotalMemory, float64(0), "총 메모리가 0보다 커야 함")
}

// TestApp_GetRealTimeMetrics_ShouldReturnMetrics - 실시간 메트릭 조회 테스트
func TestApp_GetRealTimeMetrics_ShouldReturnMetrics(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// Wails 바인딩으로 노출될 GetRealTimeMetrics 메서드 테스트
	metrics, err := app.GetRealTimeMetrics()
	
	assert.NoError(t, err, "실시간 메트릭 조회에서 에러가 발생하면 안됨")
	assert.NotNil(t, metrics, "메트릭이 nil이면 안됨")
	assert.GreaterOrEqual(t, metrics.CPUUsage, float64(0), "CPU 사용률이 0 이상이어야 함")
	assert.LessOrEqual(t, metrics.CPUUsage, float64(100), "CPU 사용률이 100 이하여야 함")
	assert.GreaterOrEqual(t, metrics.MemoryUsage, float64(0), "메모리 사용률이 0 이상이어야 함")
	assert.LessOrEqual(t, metrics.MemoryUsage, float64(100), "메모리 사용률이 100 이하여야 함")
}

// TestApp_GetGPUInfo_ShouldReturnGPUInfo - GPU 정보 조회 테스트
func TestApp_GetGPUInfo_ShouldReturnGPUInfo(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// Wails 바인딩으로 노출될 GetGPUInfo 메서드 테스트
	gpuInfo, err := app.GetGPUInfo()
	
	assert.NoError(t, err, "GPU 정보 조회에서 에러가 발생하면 안됨")
	assert.NotNil(t, gpuInfo, "GPU 정보가 nil이면 안됨")
	// GPU가 없는 시스템에서도 정상적으로 응답해야 함
	assert.NotEmpty(t, gpuInfo.Name, "GPU 이름이 있어야 함 (없으면 'N/A' 등)")
	assert.GreaterOrEqual(t, gpuInfo.Usage, float64(0), "GPU 사용률이 0 이상이어야 함")
}

// TestApp_GetGPUProcesses_ShouldReturnProcessList - GPU 프로세스 목록 조회 테스트
func TestApp_GetGPUProcesses_ShouldReturnProcessList(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// Wails 바인딩으로 노출될 GetGPUProcesses 메서드 테스트
	processes, err := app.GetGPUProcesses()
	
	assert.NoError(t, err, "GPU 프로세스 목록 조회에서 에러가 발생하면 안됨")
	assert.NotNil(t, processes, "GPU 프로세스 목록이 nil이면 안됨")
	// 프로세스가 없어도 빈 배열로 반환되어야 함
	for _, proc := range processes {
		assert.Greater(t, proc.PID, int32(0), "프로세스 PID가 0보다 커야 함")
		assert.NotEmpty(t, proc.Name, "프로세스 이름이 비어있으면 안됨")
		assert.GreaterOrEqual(t, proc.GPUUsage, float64(0), "GPU 사용률이 0 이상이어야 함")
		assert.GreaterOrEqual(t, proc.GPUMemory, float64(0), "GPU 메모리 사용량이 0 이상이어야 함")
	}
}

// TestApp_GetTopProcesses_ShouldReturnProcessList - 상위 프로세스 목록 조회 테스트
func TestApp_GetTopProcesses_ShouldReturnProcessList(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// Wails 바인딩으로 노출될 GetTopProcesses 메서드 테스트
	processes, err := app.GetTopProcesses(10)
	
	assert.NoError(t, err, "상위 프로세스 목록 조회에서 에러가 발생하면 안됨")
	assert.NotNil(t, processes, "프로세스 목록이 nil이면 안됨")
	assert.LessOrEqual(t, len(processes), 10, "요청한 개수 이하여야 함")
	
	for _, proc := range processes {
		assert.Greater(t, proc.PID, int32(0), "프로세스 PID가 0보다 커야 함")
		assert.NotEmpty(t, proc.Name, "프로세스 이름이 비어있으면 안됨")
		assert.GreaterOrEqual(t, proc.CPUPercent, float64(0), "CPU 사용률이 0 이상이어야 함")
		assert.GreaterOrEqual(t, proc.MemoryPercent, float64(0), "메모리 사용률이 0 이상이어야 함")
	}
}

// TestApp_StartMonitoring_ShouldInitializeMonitoring - 모니터링 시작 테스트
func TestApp_StartMonitoring_ShouldInitializeMonitoring(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// Wails 바인딩으로 노출될 StartMonitoring 메서드 테스트
	err := app.StartMonitoring()
	
	assert.NoError(t, err, "모니터링 시작에서 에러가 발생하면 안됨")
	
	// 모니터링이 시작되었는지 확인
	isRunning := app.IsMonitoringRunning()
	assert.True(t, isRunning, "모니터링이 시작되어야 함")
}

// TestApp_StopMonitoring_ShouldStopMonitoring - 모니터링 중지 테스트
func TestApp_StopMonitoring_ShouldStopMonitoring(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// 먼저 모니터링 시작
	app.StartMonitoring()
	
	// Wails 바인딩으로 노출될 StopMonitoring 메서드 테스트
	err := app.StopMonitoring()
	
	assert.NoError(t, err, "모니터링 중지에서 에러가 발생하면 안됨")
	
	// 모니터링이 중지되었는지 확인
	isRunning := app.IsMonitoringRunning()
	assert.False(t, isRunning, "모니터링이 중지되어야 함")
}

// ====== Phase 2.2 TDD Red Phase: GPU 프로세스 제어 Wails 바인딩 테스트 ======

// TestApp_KillGPUProcess_ShouldKillProcess - GPU 프로세스 종료 테스트
func TestApp_KillGPUProcess_ShouldKillProcess(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// 유효하지 않은 PID로 테스트 (실제 프로세스를 종료하지 않기 위해)
	invalidPID := int32(999999)
	
	// Wails 바인딩으로 노출될 KillGPUProcess 메서드 테스트
	result := app.KillGPUProcess(invalidPID)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.False(t, result.Success, "유효하지 않은 PID는 성공하면 안됨")
	assert.Equal(t, invalidPID, result.PID, "PID가 일치해야 함")
}

// TestApp_SuspendGPUProcess_ShouldSuspendProcess - GPU 프로세스 일시정지 테스트
func TestApp_SuspendGPUProcess_ShouldSuspendProcess(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// 유효하지 않은 PID로 테스트
	invalidPID := int32(999999)
	
	// Wails 바인딩으로 노출될 SuspendGPUProcess 메서드 테스트
	result := app.SuspendGPUProcess(invalidPID)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.False(t, result.Success, "유효하지 않은 PID는 성공하면 안됨")
	assert.Equal(t, invalidPID, result.PID, "PID가 일치해야 함")
}

// TestApp_ResumeGPUProcess_ShouldResumeProcess - GPU 프로세스 재개 테스트
func TestApp_ResumeGPUProcess_ShouldResumeProcess(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// 유효하지 않은 PID로 테스트
	invalidPID := int32(999999)
	
	// Wails 바인딩으로 노출될 ResumeGPUProcess 메서드 테스트
	result := app.ResumeGPUProcess(invalidPID)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.False(t, result.Success, "유효하지 않은 PID는 성공하면 안됨")
	assert.Equal(t, invalidPID, result.PID, "PID가 일치해야 함")
}

// TestApp_SetGPUProcessPriority_ShouldSetPriority - GPU 프로세스 우선순위 변경 테스트
func TestApp_SetGPUProcessPriority_ShouldSetPriority(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// 유효하지 않은 PID로 테스트
	invalidPID := int32(999999)
	priority := "high"
	
	// Wails 바인딩으로 노출될 SetGPUProcessPriority 메서드 테스트
	result := app.SetGPUProcessPriority(invalidPID, priority)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.False(t, result.Success, "유효하지 않은 PID는 성공하면 안됨")
	assert.Equal(t, invalidPID, result.PID, "PID가 일치해야 함")
	assert.Equal(t, priority, result.Priority, "우선순위가 일치해야 함")
}

// TestApp_ValidateGPUProcess_ShouldValidateProcess - GPU 프로세스 검증 테스트
func TestApp_ValidateGPUProcess_ShouldValidateProcess(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	// 유효하지 않은 PID로 테스트
	invalidPID := int32(999999)
	
	// Wails 바인딩으로 노출될 ValidateGPUProcess 메서드 테스트
	result := app.ValidateGPUProcess(invalidPID)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.False(t, result.IsValid, "유효하지 않은 PID는 검증에 실패해야 함")
	assert.Equal(t, invalidPID, result.PID, "PID가 일치해야 함")
}

// ===== Phase 2.3: Database System Tests =====

// TestApp_GetWidgets_ShouldReturnWidgetList - 위젯 목록 조회 테스트
func TestApp_GetWidgets_ShouldReturnWidgetList(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	userID := "test-user"
	pageID := "main-page"
	
	// Wails 바인딩으로 노출될 GetWidgets 메서드 테스트
	result := app.GetWidgets(userID, pageID)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.NotNil(t, result.Widgets, "위젯 목록이 nil이면 안됨")
	assert.True(t, result.Success, "위젯 조회는 성공해야 함")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.Equal(t, userID, result.UserID, "사용자 ID가 일치해야 함")
	assert.Equal(t, pageID, result.PageID, "페이지 ID가 일치해야 함")
}

// TestApp_SaveWidgets_ShouldSaveWidgets - 위젯 저장 테스트
func TestApp_SaveWidgets_ShouldSaveWidgets(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	userID := "test-user"
	pageID := "main-page"
	widgets := []map[string]interface{}{
		{
			"widgetId":   "test-widget-1",
			"widgetType": "cpu",
			"config":     "{\"refreshRate\": 1000}",
			"layout":     "{\"x\": 0, \"y\": 0, \"w\": 2, \"h\": 2}",
		},
	}
	
	// Wails 바인딩으로 노출될 SaveWidgets 메서드 테스트
	result := app.SaveWidgets(userID, pageID, widgets)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.True(t, result.Success, "위젯 저장은 성공해야 함")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.Equal(t, userID, result.UserID, "사용자 ID가 일치해야 함")
	assert.Equal(t, pageID, result.PageID, "페이지 ID가 일치해야 함")
	assert.Equal(t, len(widgets), result.Count, "저장된 위젯 개수가 일치해야 함")
}

// TestApp_DeleteWidget_ShouldDeleteWidget - 위젯 삭제 테스트
func TestApp_DeleteWidget_ShouldDeleteWidget(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	userID := "test-user"
	pageID := "main-page"
	widgetID := "test-widget-1"
	
	// Wails 바인딩으로 노출될 DeleteWidget 메서드 테스트
	result := app.DeleteWidget(userID, pageID, widgetID)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.True(t, result.Success, "위젯 삭제는 성공해야 함")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.Equal(t, userID, result.UserID, "사용자 ID가 일치해야 함")
	assert.Equal(t, pageID, result.PageID, "페이지 ID가 일치해야 함")
	assert.Equal(t, widgetID, result.WidgetID, "위젯 ID가 일치해야 함")
}

// TestApp_GetPages_ShouldReturnPageList - 페이지 목록 조회 테스트
func TestApp_GetPages_ShouldReturnPageList(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	userID := "test-user"
	
	// Wails 바인딩으로 노출될 GetPages 메서드 테스트
	result := app.GetPages(userID)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.NotNil(t, result.Pages, "페이지 목록이 nil이면 안됨")
	assert.True(t, result.Success, "페이지 조회는 성공해야 함")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.Equal(t, userID, result.UserID, "사용자 ID가 일치해야 함")
}

// TestApp_CreatePage_ShouldCreatePage - 페이지 생성 테스트
func TestApp_CreatePage_ShouldCreatePage(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	userID := "test-user"
	pageID := "test-page-1"
	pageName := "Test Page"
	
	// Wails 바인딩으로 노출될 CreatePage 메서드 테스트
	result := app.CreatePage(userID, pageID, pageName)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.True(t, result.Success, "페이지 생성은 성공해야 함")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.Equal(t, userID, result.UserID, "사용자 ID가 일치해야 함")
	assert.Equal(t, pageID, result.PageID, "페이지 ID가 일치해야 함")
	assert.Equal(t, pageName, result.PageName, "페이지 이름이 일치해야 함")
}

// TestApp_DeletePage_ShouldDeletePage - 페이지 삭제 테스트
func TestApp_DeletePage_ShouldDeletePage(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	userID := "test-user"
	pageID := "test-page-1"
	
	// Wails 바인딩으로 노출될 DeletePage 메서드 테스트
	result := app.DeletePage(userID, pageID)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.True(t, result.Success, "페이지 삭제는 성공해야 함")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.Equal(t, userID, result.UserID, "사용자 ID가 일치해야 함")
	assert.Equal(t, pageID, result.PageID, "페이지 ID가 일치해야 함")
}

// TestApp_UpdatePageName_ShouldUpdatePageName - 페이지 이름 업데이트 테스트
func TestApp_UpdatePageName_ShouldUpdatePageName(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	
	userID := "test-user"
	pageID := "main-page"
	newName := "Updated Main Page"
	
	// Wails 바인딩으로 노출될 UpdatePageName 메서드 테스트
	result := app.UpdatePageName(userID, pageID, newName)
	
	assert.NotNil(t, result, "결과가 nil이면 안됨")
	assert.True(t, result.Success, "페이지 이름 업데이트는 성공해야 함")
	assert.NotEmpty(t, result.Message, "결과 메시지가 있어야 함")
	assert.Equal(t, userID, result.UserID, "사용자 ID가 일치해야 함")
	assert.Equal(t, pageID, result.PageID, "페이지 ID가 일치해야 함")
	assert.Equal(t, newName, result.PageName, "페이지 이름이 일치해야 함")
}