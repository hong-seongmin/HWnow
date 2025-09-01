// Native UI Service for Wails desktop integration
// Provides system tray, native menus, and window lifecycle management

package native

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// UIService handles native desktop UI integration
type UIService struct {
	ctx           context.Context
	mutex         sync.RWMutex
	isVisible     bool
	isMinimized   bool
	systemTray    *SystemTrayManager
	menuManager   *MenuManager
	shortcuts     *ShortcutManager
	notifications *NotificationManager
}

// SystemTrayManager handles system tray integration
type SystemTrayManager struct {
	isEnabled bool
	menuItems []*menu.MenuItem
}

// MenuManager handles native application menus
type MenuManager struct {
	applicationMenu *menu.Menu
	contextMenu     *menu.Menu
}

// ShortcutManager handles keyboard shortcuts
type ShortcutManager struct {
	shortcuts map[string]func()
}

// NotificationManager handles system notifications
type NotificationManager struct {
	enabled bool
}

// WindowState represents the current window state
type WindowState struct {
	IsVisible   bool   `json:"isVisible"`
	IsMinimized bool   `json:"isMinimized"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	X           int    `json:"x"`
	Y           int    `json:"y"`
	Title       string `json:"title"`
}

// NotificationOptions represents notification configuration
type NotificationOptions struct {
	Title    string `json:"title"`
	Message  string `json:"message"`
	Icon     string `json:"icon,omitempty"`
	Duration int    `json:"duration,omitempty"` // milliseconds
	Type     string `json:"type,omitempty"`     // info, warning, error, success
}

// NewUIService creates a new native UI service
func NewUIService() *UIService {
	return &UIService{
		isVisible:     true,
		isMinimized:   false,
		systemTray:    &SystemTrayManager{isEnabled: false},
		menuManager:   &MenuManager{},
		shortcuts:     &ShortcutManager{shortcuts: make(map[string]func())},
		notifications: &NotificationManager{enabled: true},
	}
}

// Initialize initializes the native UI service
func (ui *UIService) Initialize(ctx context.Context) error {
	ui.mutex.Lock()
	defer ui.mutex.Unlock()

	ui.ctx = ctx
	log.Println("[NativeUI] Initializing native UI service...")

	// Initialize system tray
	if err := ui.initializeSystemTray(); err != nil {
		log.Printf("[NativeUI] Failed to initialize system tray: %v", err)
		// Don't fail if system tray is not available
	}

	// Initialize application menu
	if err := ui.initializeApplicationMenu(); err != nil {
		log.Printf("[NativeUI] Failed to initialize application menu: %v", err)
		return fmt.Errorf("failed to initialize application menu: %w", err)
	}

	// Initialize keyboard shortcuts
	if err := ui.initializeShortcuts(); err != nil {
		log.Printf("[NativeUI] Failed to initialize shortcuts: %v", err)
		// Don't fail if shortcuts are not available
	}

	log.Println("[NativeUI] Native UI service initialized successfully")
	return nil
}

// initializeSystemTray sets up the system tray
func (ui *UIService) initializeSystemTray() error {
	// Create system tray menu items
	showItem := menu.Text("Show HWnow", nil, func(_ *menu.CallbackData) {
		ui.ShowWindow()
	})

	hideItem := menu.Text("Hide to Tray", nil, func(_ *menu.CallbackData) {
		ui.HideToTray()
	})

	separator1 := menu.Separator()

	settingsItem := menu.Text("Settings", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		ui.ShowSettings()
	})

	separator2 := menu.Separator()

	quitItem := menu.Text("Quit HWnow", keys.CmdOrCtrl("Q"), func(_ *menu.CallbackData) {
		ui.QuitApplication()
	})

	ui.systemTray.menuItems = []*menu.MenuItem{
		showItem,
		hideItem,
		separator1,
		settingsItem,
		separator2,
		quitItem,
	}

	ui.systemTray.isEnabled = true
	log.Println("[NativeUI] System tray initialized")
	return nil
}

// initializeApplicationMenu sets up the native application menu
func (ui *UIService) initializeApplicationMenu() error {
	// File Menu
	fileMenu := menu.NewMenu()
	fileMenu.Append(menu.Text("New Dashboard", keys.CmdOrCtrl("N"), func(_ *menu.CallbackData) {
		ui.CreateNewDashboard()
	}))
	fileMenu.Append(menu.Text("Save Dashboard", keys.CmdOrCtrl("S"), func(_ *menu.CallbackData) {
		ui.SaveDashboard()
	}))
	fileMenu.Append(menu.Separator())
	fileMenu.Append(menu.Text("Settings", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		ui.ShowSettings()
	}))
	fileMenu.Append(menu.Separator())
	fileMenu.Append(menu.Text("Quit", keys.CmdOrCtrl("Q"), func(_ *menu.CallbackData) {
		ui.QuitApplication()
	}))

	// Edit Menu
	editMenu := menu.NewMenu()
	editMenu.Append(menu.Text("Undo", keys.CmdOrCtrl("Z"), func(_ *menu.CallbackData) {
		ui.UndoAction()
	}))
	editMenu.Append(menu.Text("Redo", keys.CmdOrCtrl("Y"), func(_ *menu.CallbackData) {
		ui.RedoAction()
	}))
	editMenu.Append(menu.Separator())
	editMenu.Append(menu.Text("Add Widget", keys.CmdOrCtrl("A"), func(_ *menu.CallbackData) {
		ui.ShowAddWidgetDialog()
	}))

	// View Menu
	viewMenu := menu.NewMenu()
	viewMenu.Append(menu.Text("Show/Hide Sidebar", keys.CmdOrCtrl("B"), func(_ *menu.CallbackData) {
		ui.ToggleSidebar()
	}))
	viewMenu.Append(menu.Text("Full Screen", keys.Key("F11"), func(_ *menu.CallbackData) {
		ui.ToggleFullscreen()
	}))
	viewMenu.Append(menu.Separator())
	viewMenu.Append(menu.Text("Zoom In", keys.CmdOrCtrl("="), func(_ *menu.CallbackData) {
		ui.ZoomIn()
	}))
	viewMenu.Append(menu.Text("Zoom Out", keys.CmdOrCtrl("-"), func(_ *menu.CallbackData) {
		ui.ZoomOut()
	}))
	viewMenu.Append(menu.Text("Reset Zoom", keys.CmdOrCtrl("0"), func(_ *menu.CallbackData) {
		ui.ResetZoom()
	}))

	// Tools Menu
	toolsMenu := menu.NewMenu()
	toolsMenu.Append(menu.Text("Start Monitoring", keys.CmdOrCtrl("M"), func(_ *menu.CallbackData) {
		ui.StartMonitoring()
	}))
	toolsMenu.Append(menu.Text("Stop Monitoring", keys.CmdOrCtrl("T"), func(_ *menu.CallbackData) {
		ui.StopMonitoring()
	}))
	toolsMenu.Append(menu.Separator())
	toolsMenu.Append(menu.Text("Export Data", keys.CmdOrCtrl("E"), func(_ *menu.CallbackData) {
		ui.ExportData()
	}))

	// Help Menu
	helpMenu := menu.NewMenu()
	helpMenu.Append(menu.Text("About HWnow", nil, func(_ *menu.CallbackData) {
		ui.ShowAbout()
	}))
	helpMenu.Append(menu.Text("User Guide", keys.Key("F1"), func(_ *menu.CallbackData) {
		ui.ShowUserGuide()
	}))
	helpMenu.Append(menu.Text("Report Issue", nil, func(_ *menu.CallbackData) {
		ui.ReportIssue()
	}))

	// Main Menu
	mainMenu := menu.NewMenu()
	mainMenu.Append(menu.SubMenu("File", fileMenu))
	mainMenu.Append(menu.SubMenu("Edit", editMenu))
	mainMenu.Append(menu.SubMenu("View", viewMenu))
	mainMenu.Append(menu.SubMenu("Tools", toolsMenu))
	mainMenu.Append(menu.SubMenu("Help", helpMenu))

	ui.menuManager.applicationMenu = mainMenu
	log.Println("[NativeUI] Application menu initialized")
	return nil
}

// initializeShortcuts sets up keyboard shortcuts
func (ui *UIService) initializeShortcuts() error {
	ui.shortcuts.shortcuts = map[string]func(){
		"Escape": func() {
			ui.HideToTray()
		},
		"F5": func() {
			ui.RefreshData()
		},
		"F12": func() {
			ui.ToggleDevTools()
		},
	}

	log.Println("[NativeUI] Keyboard shortcuts initialized")
	return nil
}

// Window Management Methods

// ShowWindow shows the application window
func (ui *UIService) ShowWindow() {
	ui.mutex.Lock()
	defer ui.mutex.Unlock()

	if ui.ctx != nil {
		runtime.Show(ui.ctx)
		runtime.WindowUnminimise(ui.ctx)
		ui.isVisible = true
		ui.isMinimized = false
		log.Println("[NativeUI] Window shown")
	} else {
		// For testing or when context is not available
		ui.isVisible = true
		ui.isMinimized = false
		log.Println("[NativeUI] Window state set to visible (context not available)")
	}
}

// HideToTray hides the window to system tray
func (ui *UIService) HideToTray() {
	ui.mutex.Lock()
	defer ui.mutex.Unlock()

	if ui.ctx != nil && ui.systemTray.isEnabled {
		runtime.Hide(ui.ctx)
		ui.isVisible = false
		log.Println("[NativeUI] Window hidden to tray")

		// Show notification
		ui.ShowNotification(NotificationOptions{
			Title:   "HWnow",
			Message: "Application minimized to system tray",
			Type:    "info",
		})
	} else {
		// For testing or when context is not available
		ui.isVisible = false
		log.Println("[NativeUI] Window state set to hidden (context not available)")
	}
}

// QuitApplication quits the application
func (ui *UIService) QuitApplication() {
	log.Println("[NativeUI] Application quit requested")
	if ui.ctx != nil {
		runtime.Quit(ui.ctx)
	}
}

// GetWindowState returns the current window state
func (ui *UIService) GetWindowState() WindowState {
	ui.mutex.RLock()
	defer ui.mutex.RUnlock()

	return WindowState{
		IsVisible:   ui.isVisible,
		IsMinimized: ui.isMinimized,
		Title:       "HWnow - Hardware Monitor",
	}
}

// Notification Methods

// ShowNotification shows a system notification
func (ui *UIService) ShowNotification(options NotificationOptions) error {
	if !ui.notifications.enabled {
		return nil
	}

	log.Printf("[NativeUI] Showing notification: %s - %s", options.Title, options.Message)

	// Set default duration if not specified
	if options.Duration == 0 {
		options.Duration = 5000 // 5 seconds
	}

	// In a real implementation, you would use a notification library
	// For now, we'll log it and potentially use Wails events to show in the UI
	if ui.ctx != nil {
		runtime.EventsEmit(ui.ctx, "native:notification", options)
	} else {
		// For testing or when context is not available
		log.Printf("[NativeUI] Notification would be shown: %s - %s", options.Title, options.Message)
	}

	return nil
}

// Helper method to emit events safely
func (ui *UIService) emitEvent(eventName string, data ...interface{}) {
	if ui.ctx != nil {
		runtime.EventsEmit(ui.ctx, eventName, data...)
	} else {
		log.Printf("[NativeUI] Event would be emitted: %s", eventName)
	}
}

// Action Methods - These would interact with the application state

// CreateNewDashboard creates a new dashboard
func (ui *UIService) CreateNewDashboard() {
	log.Println("[NativeUI] Create new dashboard requested")
	ui.emitEvent("native:new-dashboard")
}

// SaveDashboard saves the current dashboard
func (ui *UIService) SaveDashboard() {
	log.Println("[NativeUI] Save dashboard requested")
	ui.emitEvent("native:save-dashboard")
}

// ShowSettings shows the settings dialog
func (ui *UIService) ShowSettings() {
	log.Println("[NativeUI] Show settings requested")
	ui.emitEvent("native:show-settings")
}

// UndoAction triggers undo
func (ui *UIService) UndoAction() {
	log.Println("[NativeUI] Undo action requested")
	ui.emitEvent("native:undo")
}

// RedoAction triggers redo
func (ui *UIService) RedoAction() {
	log.Println("[NativeUI] Redo action requested")
	ui.emitEvent("native:redo")
}

// ShowAddWidgetDialog shows add widget dialog
func (ui *UIService) ShowAddWidgetDialog() {
	log.Println("[NativeUI] Show add widget dialog requested")
	ui.emitEvent("native:add-widget")
}

// ToggleSidebar toggles sidebar visibility
func (ui *UIService) ToggleSidebar() {
	log.Println("[NativeUI] Toggle sidebar requested")
	ui.emitEvent("native:toggle-sidebar")
}

// ToggleFullscreen toggles fullscreen mode
func (ui *UIService) ToggleFullscreen() {
	log.Println("[NativeUI] Toggle fullscreen requested")
	if ui.ctx != nil {
		runtime.WindowToggleMaximise(ui.ctx)
	}
}

// ZoomIn increases UI zoom
func (ui *UIService) ZoomIn() {
	log.Println("[NativeUI] Zoom in requested")
	ui.emitEvent("native:zoom-in")
}

// ZoomOut decreases UI zoom
func (ui *UIService) ZoomOut() {
	log.Println("[NativeUI] Zoom out requested")
	ui.emitEvent("native:zoom-out")
}

// ResetZoom resets UI zoom to default
func (ui *UIService) ResetZoom() {
	log.Println("[NativeUI] Reset zoom requested")
	ui.emitEvent("native:reset-zoom")
}

// StartMonitoring starts system monitoring
func (ui *UIService) StartMonitoring() {
	log.Println("[NativeUI] Start monitoring requested")
	ui.emitEvent("native:start-monitoring")
}

// StopMonitoring stops system monitoring
func (ui *UIService) StopMonitoring() {
	log.Println("[NativeUI] Stop monitoring requested")
	ui.emitEvent("native:stop-monitoring")
}

// ExportData exports monitoring data
func (ui *UIService) ExportData() {
	log.Println("[NativeUI] Export data requested")
	ui.emitEvent("native:export-data")
}

// ShowAbout shows about dialog
func (ui *UIService) ShowAbout() {
	log.Println("[NativeUI] Show about requested")
	ui.emitEvent("native:show-about")
}

// ShowUserGuide opens user guide
func (ui *UIService) ShowUserGuide() {
	log.Println("[NativeUI] Show user guide requested")
	ui.emitEvent("native:show-user-guide")
}

// ReportIssue opens issue reporting
func (ui *UIService) ReportIssue() {
	log.Println("[NativeUI] Report issue requested")
	ui.emitEvent("native:report-issue")
}

// RefreshData refreshes monitoring data
func (ui *UIService) RefreshData() {
	log.Println("[NativeUI] Refresh data requested")
	ui.emitEvent("native:refresh-data")
}

// ToggleDevTools toggles developer tools
func (ui *UIService) ToggleDevTools() {
	log.Println("[NativeUI] Toggle dev tools requested")
	// Dev tools toggle would be handled by Wails runtime
}

// GetApplicationMenu returns the native application menu
func (ui *UIService) GetApplicationMenu() *menu.Menu {
	ui.mutex.RLock()
	defer ui.mutex.RUnlock()
	
	if ui.menuManager.applicationMenu != nil {
		return ui.menuManager.applicationMenu
	}
	
	// Return empty menu if not initialized yet
	return menu.NewMenu()
}

// Cleanup cleans up native UI resources
func (ui *UIService) Cleanup() {
	ui.mutex.Lock()
	defer ui.mutex.Unlock()

	log.Println("[NativeUI] Cleaning up native UI service")
	ui.systemTray.isEnabled = false
	ui.notifications.enabled = false
	ui.ctx = nil
}