// Native UI Service Tests
// TDD implementation for native desktop UI integration

package native

import (
	"context"
	"testing"
	"time"
)

// Mock context for testing
type mockContext struct{}

func TestUIService_Creation(t *testing.T) {
	ui := NewUIService()
	
	if ui == nil {
		t.Fatal("NewUIService should not return nil")
	}
	
	if !ui.isVisible {
		t.Error("New UI service should be visible by default")
	}
	
	if ui.isMinimized {
		t.Error("New UI service should not be minimized by default")
	}
	
	if ui.systemTray == nil {
		t.Error("System tray manager should be initialized")
	}
	
	if ui.menuManager == nil {
		t.Error("Menu manager should be initialized")
	}
	
	if ui.shortcuts == nil {
		t.Error("Shortcut manager should be initialized")
	}
	
	if ui.notifications == nil {
		t.Error("Notification manager should be initialized")
	}
}

func TestUIService_Initialize(t *testing.T) {
	ui := NewUIService()
	ctx := context.Background()
	
	err := ui.Initialize(ctx)
	if err != nil {
		t.Errorf("Initialize should not return error: %v", err)
	}
	
	if ui.ctx != ctx {
		t.Error("Context should be stored")
	}
	
	if ui.systemTray == nil || !ui.systemTray.isEnabled {
		t.Error("System tray should be enabled after initialization")
	}
	
	if ui.menuManager.applicationMenu == nil {
		t.Error("Application menu should be initialized")
	}
	
	if len(ui.shortcuts.shortcuts) == 0 {
		t.Error("Shortcuts should be initialized")
	}
}

func TestUIService_WindowManagement(t *testing.T) {
	ui := NewUIService()
	// Don't initialize with context for testing window state changes
	// This tests the graceful handling of missing Wails context
	
	// Test initial state
	state := ui.GetWindowState()
	if !state.IsVisible {
		t.Error("Window should be visible initially")
	}
	
	if state.IsMinimized {
		t.Error("Window should not be minimized initially")
	}
	
	// Test hiding to tray (without actual Wails runtime)
	ui.HideToTray()
	state = ui.GetWindowState()
	if state.IsVisible {
		t.Error("Window should be hidden after HideToTray")
	}
	
	// Test showing window
	ui.ShowWindow()
	state = ui.GetWindowState()
	if !state.IsVisible {
		t.Error("Window should be visible after ShowWindow")
	}
	
	if state.IsMinimized {
		t.Error("Window should not be minimized after ShowWindow")
	}
}

func TestUIService_SystemTrayInitialization(t *testing.T) {
	ui := NewUIService()
	
	err := ui.initializeSystemTray()
	if err != nil {
		t.Errorf("System tray initialization should not fail: %v", err)
	}
	
	if !ui.systemTray.isEnabled {
		t.Error("System tray should be enabled after initialization")
	}
	
	if len(ui.systemTray.menuItems) == 0 {
		t.Error("System tray should have menu items")
	}
	
	// Check for expected menu items
	expectedItems := []string{"Show HWnow", "Hide to Tray", "Settings", "Quit HWnow"}
	actualItemCount := 0
	
	for _, item := range ui.systemTray.menuItems {
		if item.Label != "" {
			actualItemCount++
		}
	}
	
	if actualItemCount < len(expectedItems) {
		t.Errorf("Expected at least %d menu items, got %d", len(expectedItems), actualItemCount)
	}
}

func TestUIService_ApplicationMenuInitialization(t *testing.T) {
	ui := NewUIService()
	
	err := ui.initializeApplicationMenu()
	if err != nil {
		t.Errorf("Application menu initialization should not fail: %v", err)
	}
	
	if ui.menuManager.applicationMenu == nil {
		t.Error("Application menu should be created")
	}
	
	// Test that main menu has expected submenus
	// Note: This is a basic test as we can't easily inspect Wails menu structure
	// In a real implementation, we might need menu inspection utilities
}

func TestUIService_ShortcutInitialization(t *testing.T) {
	ui := NewUIService()
	
	err := ui.initializeShortcuts()
	if err != nil {
		t.Errorf("Shortcut initialization should not fail: %v", err)
	}
	
	expectedShortcuts := []string{"Escape", "F5", "F12"}
	
	for _, shortcut := range expectedShortcuts {
		if _, exists := ui.shortcuts.shortcuts[shortcut]; !exists {
			t.Errorf("Expected shortcut %s not found", shortcut)
		}
	}
}

func TestUIService_NotificationSystem(t *testing.T) {
	ui := NewUIService()
	// Don't initialize with context for testing notifications
	// This tests the graceful handling of missing Wails context
	
	// Test notification with all options
	options := NotificationOptions{
		Title:    "Test Title",
		Message:  "Test Message",
		Icon:     "info",
		Duration: 3000,
		Type:     "info",
	}
	
	err := ui.ShowNotification(options)
	if err != nil {
		t.Errorf("ShowNotification should not return error: %v", err)
	}
	
	// Test notification with minimal options
	minimalOptions := NotificationOptions{
		Title:   "Test",
		Message: "Test",
	}
	
	err = ui.ShowNotification(minimalOptions)
	if err != nil {
		t.Errorf("ShowNotification with minimal options should not return error: %v", err)
	}
	
	// Test with notifications disabled
	ui.notifications.enabled = false
	err = ui.ShowNotification(options)
	if err != nil {
		t.Errorf("ShowNotification should not fail when disabled: %v", err)
	}
}

func TestUIService_ActionMethods(t *testing.T) {
	ui := NewUIService()
	// Don't initialize with context for testing action methods
	// This tests the graceful handling of missing Wails context
	
	// Test all action methods don't panic
	actionMethods := []func(){
		ui.CreateNewDashboard,
		ui.SaveDashboard,
		ui.ShowSettings,
		ui.UndoAction,
		ui.RedoAction,
		ui.ShowAddWidgetDialog,
		ui.ToggleSidebar,
		ui.ToggleFullscreen,
		ui.ZoomIn,
		ui.ZoomOut,
		ui.ResetZoom,
		ui.StartMonitoring,
		ui.StopMonitoring,
		ui.ExportData,
		ui.ShowAbout,
		ui.ShowUserGuide,
		ui.ReportIssue,
		ui.RefreshData,
		ui.ToggleDevTools,
	}
	
	for i, method := range actionMethods {
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Errorf("Action method %d panicked: %v", i, r)
				}
			}()
			method()
		}()
	}
}

func TestUIService_ThreadSafety(t *testing.T) {
	ui := NewUIService()
	// Don't initialize with context for testing thread safety
	// This tests the graceful handling of missing Wails context in concurrent access
	
	// Test concurrent access to window state
	done := make(chan bool, 10)
	
	// Start multiple goroutines to test thread safety
	for i := 0; i < 10; i++ {
		go func() {
			defer func() { done <- true }()
			
			for j := 0; j < 100; j++ {
				ui.ShowWindow()
				ui.HideToTray()
				ui.GetWindowState()
			}
		}()
	}
	
	// Wait for all goroutines to complete
	timeout := time.After(5 * time.Second)
	completed := 0
	
	for completed < 10 {
		select {
		case <-done:
			completed++
		case <-timeout:
			t.Error("Thread safety test timed out")
			return
		}
	}
}

func TestUIService_Cleanup(t *testing.T) {
	ui := NewUIService()
	ctx := context.Background()
	ui.Initialize(ctx)
	
	// Verify initial state
	if ui.ctx == nil {
		t.Error("Context should be set before cleanup")
	}
	
	if !ui.systemTray.isEnabled {
		t.Error("System tray should be enabled before cleanup")
	}
	
	// Perform cleanup
	ui.Cleanup()
	
	// Verify cleanup
	if ui.ctx != nil {
		t.Error("Context should be nil after cleanup")
	}
	
	if ui.systemTray.isEnabled {
		t.Error("System tray should be disabled after cleanup")
	}
	
	if ui.notifications.enabled {
		t.Error("Notifications should be disabled after cleanup")
	}
}

func TestUIService_WindowStateProperties(t *testing.T) {
	ui := NewUIService()
	
	state := ui.GetWindowState()
	
	if state.Title == "" {
		t.Error("Window state should have a title")
	}
	
	expectedTitle := "HWnow - Hardware Monitor"
	if state.Title != expectedTitle {
		t.Errorf("Expected title %s, got %s", expectedTitle, state.Title)
	}
}

func TestUIService_ErrorHandling(t *testing.T) {
	ui := NewUIService()
	
	// Test operations without context (should not panic)
	ui.ShowWindow()
	ui.HideToTray()
	ui.QuitApplication()
	
	// Test notification without context
	err := ui.ShowNotification(NotificationOptions{
		Title:   "Test",
		Message: "Test",
	})
	
	if err != nil {
		t.Errorf("Notification without context should not error: %v", err)
	}
}

// Benchmark tests for performance
func BenchmarkUIService_GetWindowState(b *testing.B) {
	ui := NewUIService()
	ctx := context.Background()
	ui.Initialize(ctx)
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ui.GetWindowState()
	}
}

func BenchmarkUIService_ShowHide(b *testing.B) {
	ui := NewUIService()
	ctx := context.Background()
	ui.Initialize(ctx)
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ui.ShowWindow()
		ui.HideToTray()
	}
}

func BenchmarkUIService_Notification(b *testing.B) {
	ui := NewUIService()
	ctx := context.Background()
	ui.Initialize(ctx)
	
	options := NotificationOptions{
		Title:   "Benchmark",
		Message: "Benchmark notification",
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ui.ShowNotification(options)
	}
}