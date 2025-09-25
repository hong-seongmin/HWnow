//go:build ignore
// +build ignore

package main

import (
	"context"
	"testing"
	"time"

	"HWnow-wails/internal/services"
)

// TestAppServiceIntegration tests that the new services architecture produces
// identical results to the current App struct methods
func TestAppServiceIntegration(t *testing.T) {
	// Arrange: Create both old App and new AppService
	oldApp := NewApp()
	ctx := context.Background()
	oldApp.OnStartup(ctx)
	defer oldApp.OnShutdown(ctx)

	// Create new AppService
	appService := services.NewAppService("config.json")
	err := appService.Initialize(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize AppService: %v", err)
	}
	defer appService.Shutdown()

	// Act & Assert: Compare critical methods
	t.Run("GetSystemInfo", func(t *testing.T) {
		oldResult, oldErr := oldApp.GetSystemInfo()
		newResult, newErr := appService.GetSystemInfo()

		// Both should succeed or both should fail
		if (oldErr == nil) != (newErr == nil) {
			t.Errorf("Error mismatch - old: %v, new: %v", oldErr, newErr)
		}

		if oldErr == nil && newErr == nil {
			// Compare critical fields
			if oldResult.Platform != newResult.Platform {
				t.Errorf("Platform mismatch - old: %s, new: %s", oldResult.Platform, newResult.Platform)
			}
			if oldResult.CPUCores != newResult.CPUCores {
				t.Errorf("CPUCores mismatch - old: %d, new: %d", oldResult.CPUCores, newResult.CPUCores)
			}
			if oldResult.TotalMemory != newResult.TotalMemory {
				t.Errorf("TotalMemory mismatch - old: %f, new: %f", oldResult.TotalMemory, newResult.TotalMemory)
			}
		}
	})

	t.Run("GetGPUProcesses", func(t *testing.T) {
		oldResult, oldErr := oldApp.GetGPUProcesses()
		newResult, newErr := appService.GetGPUProcesses()

		// Both should succeed or both should fail
		if (oldErr == nil) != (newErr == nil) {
			t.Errorf("Error mismatch - old: %v, new: %v", oldErr, newErr)
		}

		if oldErr == nil && newErr == nil {
			// Compare result count (should be identical)
			if len(oldResult) != len(newResult) {
				t.Errorf("GPU processes count mismatch - old: %d, new: %d", len(oldResult), len(newResult))
			}
		}
	})
}

// TestAppMethodsCompatibility ensures all App struct method signatures
// are preserved after refactoring
func TestAppMethodsCompatibility(t *testing.T) {
	// This test will be expanded as we implement the new service architecture
	// For now, just ensure current App still works

	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	defer app.OnShutdown(ctx)

	// Test basic method availability
	t.Run("BasicMethods", func(t *testing.T) {
		// These methods should always be available
		greeting := app.Greet("Test")
		if greeting == "" {
			t.Error("Greet method should return non-empty string")
		}

		systemInfo, err := app.GetSystemInfo()
		if err != nil {
			t.Errorf("GetSystemInfo should not error: %v", err)
		}
		if systemInfo == nil {
			t.Error("GetSystemInfo should return non-nil result")
		}
	})
}

// TestAppInitializationWithServices tests that App can be initialized
// with the new services architecture without breaking existing functionality
func TestAppInitializationWithServices(t *testing.T) {
	// Test new App struct that uses AppService
	app := NewApp()
	ctx := context.Background()

	// Ensure AppService is initialized
	if app.appService == nil {
		t.Fatal("App should have initialized AppService")
	}

	// Test startup with services
	app.OnStartup(ctx)
	defer app.OnShutdown(ctx)

	// Verify that basic functionality still works
	systemInfo, err := app.GetSystemInfo()
	if err != nil {
		t.Errorf("GetSystemInfo should work with services: %v", err)
	}
	if systemInfo == nil {
		t.Error("GetSystemInfo should return valid data")
	}
}

// TestAppShutdownWithServices tests proper cleanup when using services
func TestAppShutdownWithServices(t *testing.T) {
	// Test proper shutdown of all services
	app := NewApp()
	ctx := context.Background()

	// Start the app
	app.OnStartup(ctx)

	// Test shutdown - should not panic or error
	app.OnShutdown(ctx)

	// Verify basic functionality still works after shutdown
	// (should be graceful, no crashes)
	_, _ = app.GetSystemInfo() // Don't require this to work after shutdown
}

// TestRealTimeMetricsCompatibility tests that RealTimeMetrics output remains identical
func TestRealTimeMetricsCompatibility(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	defer app.OnShutdown(ctx)

	// Get metrics twice with short interval
	metrics1, err1 := app.GetRealTimeMetrics()
	time.Sleep(100 * time.Millisecond)
	metrics2, err2 := app.GetRealTimeMetrics()

	// Both calls should succeed
	if err1 != nil {
		t.Errorf("First GetRealTimeMetrics call failed: %v", err1)
	}
	if err2 != nil {
		t.Errorf("Second GetRealTimeMetrics call failed: %v", err2)
	}

	// Both should return valid metrics
	if metrics1 == nil || metrics2 == nil {
		t.Error("GetRealTimeMetrics should return non-nil results")
	}

	// Timestamps should be different (proving they're fresh)
	if metrics1 != nil && metrics2 != nil {
		if metrics1.Timestamp.Equal(metrics2.Timestamp) {
			t.Error("Metrics should have different timestamps when called separately")
		}
	}
}

// TestGPUProcessControlCompatibility tests GPU process control operations
func TestGPUProcessControlCompatibility(t *testing.T) {
	app := NewApp()
	ctx := context.Background()
	app.OnStartup(ctx)
	defer app.OnShutdown(ctx)

	// Test GPU process validation (safe operation)
	t.Run("GPUProcessValidation", func(t *testing.T) {
		// Use a PID that's likely to be invalid (very high number)
		result := app.ValidateGPUProcess(99999)
		if result == nil {
			t.Error("ValidateGPUProcess should return non-nil result")
		}
		// This should be invalid, but method should not crash
		if result.IsValid {
			t.Log("Warning: PID 99999 was reported as valid (unexpected but not an error)")
		}
	})
}