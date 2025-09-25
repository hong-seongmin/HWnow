package monitoring

import (
	"runtime"
)

// GPU 프로세스 제어 관련 함수들

// 중요한 시스템 프로세스 목록 (제어하면 안 되는 프로세스들)
var criticalProcesses = []string{
	// Windows 시스템 프로세스
	"dwm.exe",      // Desktop Window Manager
	"winlogon.exe", // Windows 로그온 프로세스
	"csrss.exe",    // Client Server Runtime Process
	"wininit.exe",  // Windows Initialization Process
	"services.exe", // Services Control Manager
	"lsass.exe",    // Local Security Authority Process
	"smss.exe",     // Session Manager
	"svchost.exe",  // Service Host Process
	"explorer.exe", // Windows Explorer
	"System",       // System process
	"Registry",     // Registry process
	"ntoskrnl.exe", // Windows Kernel
	"wininit.exe",  // Windows Initialization

	// NVIDIA 드라이버 및 시스템 프로세스
	"nvidia-container.exe",    // NVIDIA Container
	"nvdisplay.container.exe", // NVIDIA Display Container
	"nvcontainer.exe",         // NVIDIA Container Runtime
	"nvspcaps64.exe",          // NVIDIA Capture Server Proxy
	"nvwgf2umx.dll",           // NVIDIA OpenGL Driver

	// Linux/Unix 시스템 프로세스 (크로스 플랫폼 지원)
	"init",      // Init process (PID 1)
	"kthreadd",  // Kernel thread daemon
	"systemd",   // Systemd init system
	"kernel",    // Kernel threads
	"ksoftirqd", // Software interrupt daemon
	"migration", // CPU migration threads
	"rcu_",      // RCU (Read-Copy-Update) threads
	"watchdog",  // Hardware watchdog

	// 추가 보안 프로세스
	"audiodg.exe", // Windows Audio Device Graph Isolation
	"dllhost.exe", // COM+ surrogate process
	"spoolsv.exe", // Print Spooler service
}

// GetCurrentPlatform - 현재 운영체제 플랫폼 반환
func GetCurrentPlatform() string {
	return runtime.GOOS
}

// Enhanced critical process checking with protection service
func isCriticalProcessEnhanced(processName string, pid int32) (*CriticalProcessInfo, error) {
	pps := GetProcessProtectionService()
	if proc, isCritical := pps.IsCriticalProcess(processName, pid); isCritical {
		return proc, pps.CanControlProcess(processName, pid)
	}
	return nil, nil
}
