package monitoring

import (
	"testing"
	"time"
)

// TestCollectorFunctionalitySuite tests the core functionality that must be preserved during refactoring
func TestCollectorFunctionalitySuite(t *testing.T) {

	t.Run("CPU_Core_Usage", func(t *testing.T) {
		coreUsage, err := GetCPUCoreUsage()
		if err != nil {
			t.Fatalf("CPU core usage failed: %v", err)
		}

		if len(coreUsage) == 0 {
			t.Error("CPU core usage should not be empty")
		}

		for i, usage := range coreUsage {
			if usage < 0 || usage > 100 {
				t.Errorf("Invalid CPU core %d usage: %f", i, usage)
			}
		}
	})

	t.Run("Battery_Info", func(t *testing.T) {
		batteryInfo, err := GetBatteryInfo()
		if err != nil {
			t.Logf("Battery info failed (may not have battery): %v", err)
			return // Skip on systems without battery
		}

		if batteryInfo == nil {
			t.Error("Battery info should not be nil")
		}
	})

	t.Run("GPU_Process_Monitoring", func(t *testing.T) {
		response, err := GetGPUProcessesFiltered(GPUProcessQuery{})
		if err != nil {
			t.Fatalf("GPU process monitoring failed: %v", err)
		}

		if response == nil {
			t.Error("GPU process response should not be nil")
		}
	})

	t.Run("System_Platform", func(t *testing.T) {
		platform := GetCurrentPlatform()
		if platform == "" {
			t.Error("Platform should not be empty")
		}
	})

	t.Run("CPU_Cores", func(t *testing.T) {
		cores, err := GetCPUCores()
		if err != nil {
			t.Fatalf("CPU cores failed: %v", err)
		}

		if cores <= 0 {
			t.Errorf("Invalid CPU cores: %d", cores)
		}
	})

	t.Run("Total_Memory", func(t *testing.T) {
		memory, err := GetTotalMemory()
		if err != nil {
			t.Fatalf("Total memory failed: %v", err)
		}

		if memory <= 0 {
			t.Errorf("Invalid total memory: %f", memory)
		}
	})

	t.Run("Boot_Time", func(t *testing.T) {
		bootTime, err := GetBootTime()
		if err != nil {
			t.Fatalf("Boot time failed: %v", err)
		}

		if bootTime.IsZero() {
			t.Error("Boot time should not be zero")
		}

		// Boot time should be in the past
		if bootTime.After(time.Now()) {
			t.Error("Boot time should be in the past")
		}
	})

	t.Run("System_Uptime", func(t *testing.T) {
		uptime, err := GetSystemUptime()
		if err != nil {
			t.Fatalf("System uptime failed: %v", err)
		}

		if uptime < 0 {
			t.Errorf("Invalid system uptime: %d", uptime)
		}
	})
}

// TestCollectorPerformance ensures the collector meets performance requirements
func TestCollectorPerformance(t *testing.T) {
	t.Run("CPU_Core_Usage_Performance", func(t *testing.T) {
		start := time.Now()
		_, err := GetCPUCoreUsage()
		duration := time.Since(start)

		if err != nil {
			t.Fatalf("CPU core usage failed: %v", err)
		}

		// Should complete within reasonable time (2 seconds max)
		if duration > 2*time.Second {
			t.Errorf("CPU core usage too slow: %v", duration)
		}
	})

	t.Run("GPU_Processes_Performance", func(t *testing.T) {
		start := time.Now()
		_, err := GetGPUProcessesFiltered(GPUProcessQuery{})
		duration := time.Since(start)

		if err != nil {
			t.Fatalf("GPU processes failed: %v", err)
		}

		// Should complete within reasonable time (5 seconds max for initial call)
		if duration > 5*time.Second {
			t.Errorf("GPU processes too slow: %v", duration)
		}
	})
}

// TestCollectorThreadSafety ensures the collector can handle concurrent access
func TestCollectorThreadSafety(t *testing.T) {
	done := make(chan bool, 10)
	errors := make(chan error, 10)

	// Run 10 concurrent goroutines
	for i := 0; i < 10; i++ {
		go func() {
			defer func() { done <- true }()

			// Test concurrent CPU usage collection
			_, err := GetCPUCoreUsage()
			if err != nil {
				errors <- err
				return
			}

			// Test concurrent GPU process monitoring
			_, err = GetGPUProcessesFiltered(GPUProcessQuery{})
			if err != nil {
				errors <- err
				return
			}
		}()
	}

	// Wait for all goroutines to complete
	completed := 0
	timeout := time.After(30 * time.Second)

	for completed < 10 {
		select {
		case err := <-errors:
			t.Fatalf("Concurrent access failed: %v", err)
		case <-done:
			completed++
		case <-timeout:
			t.Fatal("Thread safety test timed out")
		}
	}
}

// BenchmarkCollector provides performance benchmarks
func BenchmarkCollectorCPUCoreUsage(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := GetCPUCoreUsage()
		if err != nil {
			b.Fatalf("Benchmark failed: %v", err)
		}
	}
}

func BenchmarkCollectorGPUProcesses(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := GetGPUProcessesFiltered(GPUProcessQuery{})
		if err != nil {
			b.Fatalf("Benchmark failed: %v", err)
		}
	}
}