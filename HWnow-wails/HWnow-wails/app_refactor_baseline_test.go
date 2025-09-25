//go:build ignore
// +build ignore

package main

import (
	"context"
	"testing"
	"time"
)

// TestAppRefactorPreservation tests the functionality that must be preserved during refactoring
func TestAppRefactorPreservation(t *testing.T) {
	app := &App{}
	ctx := context.Background()

	// Startup the app for testing
	app.OnStartup(ctx)
	defer app.OnShutdown(ctx)

	t.Run("GetSystemInfo", func(t *testing.T) {
		info, err := app.GetSystemInfo()
		if err != nil {
			t.Fatalf("GetSystemInfo failed: %v", err)
		}

		if info.Platform == "" {
			t.Error("Platform should not be empty")
		}
		if info.CPUCores <= 0 {
			t.Error("CPU cores should be greater than 0")
		}
	})

	t.Run("GetRealTimeMetrics", func(t *testing.T) {
		metrics, err := app.GetRealTimeMetrics()
		if err != nil {
			t.Fatalf("GetRealTimeMetrics failed: %v", err)
		}

		if metrics.CPUUsage < 0 || metrics.CPUUsage > 100 {
			t.Errorf("Invalid CPU usage: %f", metrics.CPUUsage)
		}
	})

	t.Run("MonitoringLifecycle", func(t *testing.T) {
		// Test monitoring start
		err := app.StartMonitoring()
		if err != nil {
			t.Fatalf("StartMonitoring failed: %v", err)
		}

		// Check if monitoring is running
		if !app.IsMonitoringRunning() {
			t.Error("Monitoring should be running after start")
		}

		// Allow some time for monitoring to run
		time.Sleep(100 * time.Millisecond)

		// Test monitoring stop
		err = app.StopMonitoring()
		if err != nil {
			t.Fatalf("StopMonitoring failed: %v", err)
		}
	})
}
