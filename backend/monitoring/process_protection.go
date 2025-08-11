package monitoring

import (
	"fmt"
	"runtime"
	"strings"
	"sync"

	"github.com/shirou/gopsutil/v3/process"
)

// ProcessProtectionLevel defines different levels of process protection
type ProcessProtectionLevel int

const (
	ProtectionNone ProcessProtectionLevel = iota
	ProtectionLow                         // 일반 시스템 프로세스
	ProtectionMedium                      // 중요한 서비스 프로세스
	ProtectionHigh                        // 핵심 시스템 프로세스
	ProtectionCritical                    // 절대 건드리면 안 되는 프로세스
)

// CriticalProcessInfo contains information about a critical process
type CriticalProcessInfo struct {
	Name            string                 `json:"name"`
	Description     string                 `json:"description"`
	ProtectionLevel ProcessProtectionLevel `json:"protection_level"`
	Platform        string                 `json:"platform"`        // windows, linux, darwin, all
	IsKernelProcess bool                   `json:"is_kernel"`       // 커널 프로세스인지
	MinPID          int32                  `json:"min_pid"`         // 최소 PID (0이면 제한 없음)
	MaxPID          int32                  `json:"max_pid"`         // 최대 PID (0이면 제한 없음)
	ParentProcess   string                 `json:"parent_process"`  // 부모 프로세스 이름 (선택적)
	IsService       bool                   `json:"is_service"`      // Windows 서비스인지
	MatchPattern    string                 `json:"match_pattern"`   // 정규식 패턴 매칭
}

// ProcessProtectionService manages critical process protection
type ProcessProtectionService struct {
	criticalProcesses map[string]*CriticalProcessInfo
	mutex             sync.RWMutex
	currentPlatform   string
}

var (
	protectionService *ProcessProtectionService
	protectionOnce    sync.Once
)

// GetProcessProtectionService returns singleton instance
func GetProcessProtectionService() *ProcessProtectionService {
	protectionOnce.Do(func() {
		protectionService = &ProcessProtectionService{
			criticalProcesses: make(map[string]*CriticalProcessInfo),
			currentPlatform:   runtime.GOOS,
		}
		protectionService.initializeCriticalProcesses()
	})
	return protectionService
}

// initializeCriticalProcesses initializes the critical process database
func (pps *ProcessProtectionService) initializeCriticalProcesses() {
	// Windows Critical Processes
	windowsProcesses := []*CriticalProcessInfo{
		// 절대 건드리면 안 되는 Windows 핵심 프로세스
		{Name: "System", Description: "Windows 시스템 프로세스", ProtectionLevel: ProtectionCritical, Platform: "windows", IsKernelProcess: true, MinPID: 0, MaxPID: 10},
		{Name: "Registry", Description: "Windows 레지스트리 프로세스", ProtectionLevel: ProtectionCritical, Platform: "windows", IsKernelProcess: true},
		{Name: "smss.exe", Description: "세션 매니저", ProtectionLevel: ProtectionCritical, Platform: "windows"},
		{Name: "csrss.exe", Description: "클라이언트/서버 런타임 프로세스", ProtectionLevel: ProtectionCritical, Platform: "windows"},
		{Name: "wininit.exe", Description: "Windows 초기화 프로세스", ProtectionLevel: ProtectionCritical, Platform: "windows"},
		{Name: "winlogon.exe", Description: "Windows 로그온 프로세스", ProtectionLevel: ProtectionCritical, Platform: "windows"},
		{Name: "services.exe", Description: "서비스 제어 관리자", ProtectionLevel: ProtectionCritical, Platform: "windows"},
		{Name: "lsass.exe", Description: "로컬 보안 기관 프로세스", ProtectionLevel: ProtectionCritical, Platform: "windows"},
		{Name: "ntoskrnl.exe", Description: "Windows 커널", ProtectionLevel: ProtectionCritical, Platform: "windows", IsKernelProcess: true},
		
		// 높은 보호 수준 - 중요하지만 특정 상황에서는 재시작 가능
		{Name: "explorer.exe", Description: "Windows 탐색기", ProtectionLevel: ProtectionHigh, Platform: "windows"},
		{Name: "dwm.exe", Description: "데스크톱 윈도우 관리자", ProtectionLevel: ProtectionHigh, Platform: "windows"},
		{Name: "svchost.exe", Description: "서비스 호스트 프로세스", ProtectionLevel: ProtectionHigh, Platform: "windows", IsService: true},
		
		// 중간 보호 수준 - 시스템 서비스
		{Name: "audiodg.exe", Description: "Windows 오디오 장치 그래프 격리", ProtectionLevel: ProtectionMedium, Platform: "windows"},
		{Name: "spoolsv.exe", Description: "프린트 스풀러 서비스", ProtectionLevel: ProtectionMedium, Platform: "windows", IsService: true},
		{Name: "dllhost.exe", Description: "COM+ 대리 프로세스", ProtectionLevel: ProtectionMedium, Platform: "windows"},
		{Name: "conhost.exe", Description: "콘솔 윈도우 호스트", ProtectionLevel: ProtectionMedium, Platform: "windows"},
		{Name: "RuntimeBroker.exe", Description: "런타임 브로커", ProtectionLevel: ProtectionMedium, Platform: "windows"},
		
		// NVIDIA 관련 프로세스 (GPU 드라이버)
		{Name: "nvcontainer.exe", Description: "NVIDIA 컨테이너", ProtectionLevel: ProtectionMedium, Platform: "windows"},
		{Name: "nvidia-container.exe", Description: "NVIDIA 컨테이너", ProtectionLevel: ProtectionMedium, Platform: "windows"},
		{Name: "nvdisplay.container.exe", Description: "NVIDIA 디스플레이 컨테이너", ProtectionLevel: ProtectionMedium, Platform: "windows"},
		{Name: "nvspcaps64.exe", Description: "NVIDIA 캡처 서버 프록시", ProtectionLevel: ProtectionLow, Platform: "windows"},
		
		// Windows 보안 관련
		{Name: "MsMpEng.exe", Description: "Microsoft Defender 안티말웨어 서비스", ProtectionLevel: ProtectionHigh, Platform: "windows"},
		{Name: "SecurityHealthService.exe", Description: "Windows 보안 상태 서비스", ProtectionLevel: ProtectionMedium, Platform: "windows"},
	}
	
	// Linux/Unix Critical Processes
	unixProcesses := []*CriticalProcessInfo{
		// 절대 건드리면 안 되는 Linux 핵심 프로세스
		{Name: "init", Description: "Init 프로세스 (PID 1)", ProtectionLevel: ProtectionCritical, Platform: "linux", MinPID: 1, MaxPID: 1},
		{Name: "systemd", Description: "Systemd init 시스템", ProtectionLevel: ProtectionCritical, Platform: "linux", MinPID: 1, MaxPID: 1},
		{Name: "kernel", Description: "Linux 커널", ProtectionLevel: ProtectionCritical, Platform: "linux", IsKernelProcess: true, MaxPID: 100},
		{Name: "kthreadd", Description: "커널 스레드 데몬", ProtectionLevel: ProtectionCritical, Platform: "linux", IsKernelProcess: true, MinPID: 2, MaxPID: 10},
		
		// 높은 보호 수준 - 중요한 커널 스레드들
		{Name: "ksoftirqd", Description: "소프트웨어 인터럽트 데몬", ProtectionLevel: ProtectionHigh, Platform: "linux", IsKernelProcess: true},
		{Name: "migration", Description: "CPU 마이그레이션 스레드", ProtectionLevel: ProtectionHigh, Platform: "linux", IsKernelProcess: true},
		{Name: "rcu_", Description: "RCU (Read-Copy-Update) 스레드", ProtectionLevel: ProtectionHigh, Platform: "linux", IsKernelProcess: true, MatchPattern: "^rcu_"},
		{Name: "watchdog", Description: "하드웨어 워치독", ProtectionLevel: ProtectionHigh, Platform: "linux", IsKernelProcess: true},
		{Name: "swapper", Description: "스와퍼/아이들 프로세스", ProtectionLevel: ProtectionHigh, Platform: "linux", IsKernelProcess: true},
		
		// 중간 보호 수준 - 시스템 데몬들
		{Name: "systemd-", Description: "Systemd 관련 데몬들", ProtectionLevel: ProtectionMedium, Platform: "linux", MatchPattern: "^systemd-"},
		{Name: "NetworkManager", Description: "네트워크 관리자", ProtectionLevel: ProtectionMedium, Platform: "linux"},
		{Name: "dbus", Description: "D-Bus 시스템 메시지 버스", ProtectionLevel: ProtectionMedium, Platform: "linux"},
		{Name: "sshd", Description: "SSH 데몬", ProtectionLevel: ProtectionMedium, Platform: "linux"},
		{Name: "chronyd", Description: "NTP 클라이언트/서버", ProtectionLevel: ProtectionMedium, Platform: "linux"},
		
		// GPU 관련 프로세스 (Linux)
		{Name: "nvidia-", Description: "NVIDIA 관련 프로세스", ProtectionLevel: ProtectionMedium, Platform: "linux", MatchPattern: "^nvidia-"},
		{Name: "Xorg", Description: "X 윈도우 서버", ProtectionLevel: ProtectionMedium, Platform: "linux"},
		{Name: "gdm", Description: "GNOME 디스플레이 관리자", ProtectionLevel: ProtectionMedium, Platform: "linux"},
	}
	
	// macOS Critical Processes
	macosProcesses := []*CriticalProcessInfo{
		// 절대 건드리면 안 되는 macOS 핵심 프로세스
		{Name: "kernel_task", Description: "macOS 커널 태스크", ProtectionLevel: ProtectionCritical, Platform: "darwin", IsKernelProcess: true},
		{Name: "launchd", Description: "macOS init 프로세스", ProtectionLevel: ProtectionCritical, Platform: "darwin", MinPID: 1, MaxPID: 1},
		
		// 높은 보호 수준
		{Name: "WindowServer", Description: "macOS 윈도우 서버", ProtectionLevel: ProtectionHigh, Platform: "darwin"},
		{Name: "Finder", Description: "macOS Finder", ProtectionLevel: ProtectionHigh, Platform: "darwin"},
		{Name: "Dock", Description: "macOS Dock", ProtectionLevel: ProtectionHigh, Platform: "darwin"},
		
		// 중간 보호 수준
		{Name: "com.apple.", Description: "Apple 시스템 서비스들", ProtectionLevel: ProtectionMedium, Platform: "darwin", MatchPattern: "^com\\.apple\\."},
		{Name: "syslogd", Description: "시스템 로그 데몬", ProtectionLevel: ProtectionMedium, Platform: "darwin"},
		{Name: "mds", Description: "Spotlight 메타데이터 서버", ProtectionLevel: ProtectionMedium, Platform: "darwin"},
	}
	
	// Register all processes
	pps.mutex.Lock()
	defer pps.mutex.Unlock()
	
	allProcesses := append(windowsProcesses, unixProcesses...)
	allProcesses = append(allProcesses, macosProcesses...)
	
	for _, proc := range allProcesses {
		key := fmt.Sprintf("%s_%s", proc.Platform, strings.ToLower(proc.Name))
		pps.criticalProcesses[key] = proc
	}
	
	LogInfo("Initialized critical process protection", 
		"total_processes", len(pps.criticalProcesses),
		"platform", pps.currentPlatform)
}

// IsCriticalProcess checks if a process is critical and returns protection info
func (pps *ProcessProtectionService) IsCriticalProcess(processName string, pid int32) (*CriticalProcessInfo, bool) {
	pps.mutex.RLock()
	defer pps.mutex.RUnlock()
	
	processName = strings.ToLower(processName)
	
	// 1. 정확한 이름 매칭 확인
	key := fmt.Sprintf("%s_%s", pps.currentPlatform, processName)
	if proc, exists := pps.criticalProcesses[key]; exists {
		if pps.matchesPIDRange(proc, pid) && pps.matchesPattern(proc, processName) {
			return proc, true
		}
	}
	
	// 2. 크로스 플랫폼 프로세스 확인
	key = fmt.Sprintf("all_%s", processName)
	if proc, exists := pps.criticalProcesses[key]; exists {
		if pps.matchesPIDRange(proc, pid) && pps.matchesPattern(proc, processName) {
			return proc, true
		}
	}
	
	// 3. 패턴 매칭 확인
	for _, proc := range pps.criticalProcesses {
		if (proc.Platform == pps.currentPlatform || proc.Platform == "all") && 
		   pps.matchesPattern(proc, processName) &&
		   pps.matchesPIDRange(proc, pid) {
			return proc, true
		}
	}
	
	// 4. 동적 검사 (PID 기반)
	if pps.isDynamicallyCritical(processName, pid) {
		return &CriticalProcessInfo{
			Name:            processName,
			Description:     "동적으로 감지된 중요 프로세스",
			ProtectionLevel: ProtectionMedium,
			Platform:        pps.currentPlatform,
		}, true
	}
	
	return nil, false
}

// matchesPIDRange checks if PID is within allowed range
func (pps *ProcessProtectionService) matchesPIDRange(proc *CriticalProcessInfo, pid int32) bool {
	if proc.MinPID > 0 && pid < proc.MinPID {
		return false
	}
	if proc.MaxPID > 0 && pid > proc.MaxPID {
		return false
	}
	return true
}

// matchesPattern checks if process name matches pattern
func (pps *ProcessProtectionService) matchesPattern(proc *CriticalProcessInfo, processName string) bool {
	if proc.MatchPattern == "" {
		return strings.Contains(processName, strings.ToLower(proc.Name))
	}
	
	// 간단한 패턴 매칭 (정규식 대신 prefix/suffix 검사)
	pattern := proc.MatchPattern
	if strings.HasPrefix(pattern, "^") {
		pattern = strings.TrimPrefix(pattern, "^")
		return strings.HasPrefix(processName, strings.ToLower(pattern))
	}
	if strings.HasSuffix(pattern, "$") {
		pattern = strings.TrimSuffix(pattern, "$")
		return strings.HasSuffix(processName, strings.ToLower(pattern))
	}
	
	return strings.Contains(processName, strings.ToLower(pattern))
}

// isDynamicallyCritical performs dynamic critical process detection
func (pps *ProcessProtectionService) isDynamicallyCritical(processName string, pid int32) bool {
	// PID 1은 항상 critical (init/systemd)
	if pid == 1 {
		return true
	}
	
	// PID 2-10은 보통 커널 스레드들
	if pid >= 2 && pid <= 10 && pps.currentPlatform == "linux" {
		return true
	}
	
	// Windows에서 PID 4는 System 프로세스
	if pid == 4 && pps.currentPlatform == "windows" {
		return true
	}
	
	// 부모 프로세스가 중요한 프로세스인지 확인
	if pps.hasKriticalParent(pid) {
		return true
	}
	
	return false
}

// hasKriticalParent checks if process has a critical parent
func (pps *ProcessProtectionService) hasKriticalParent(pid int32) bool {
	proc, err := process.NewProcess(pid)
	if err != nil {
		return false
	}
	
	ppid, err := proc.Ppid()
	if err != nil {
		return false
	}
	
	// 부모 프로세스 정보 가져오기
	parentProc, err := process.NewProcess(ppid)
	if err != nil {
		return false
	}
	
	parentName, err := parentProc.Name()
	if err != nil {
		return false
	}
	
	// 부모가 중요한 프로세스인지 확인
	_, isCritical := pps.IsCriticalProcess(parentName, ppid)
	return isCritical
}

// CanControlProcess determines if a process can be controlled
func (pps *ProcessProtectionService) CanControlProcess(processName string, pid int32) error {
	if proc, isCritical := pps.IsCriticalProcess(processName, pid); isCritical {
		switch proc.ProtectionLevel {
		case ProtectionCritical:
			return fmt.Errorf("critical system process cannot be controlled: %s (PID: %d) - %s", 
				processName, pid, proc.Description)
		case ProtectionHigh:
			return fmt.Errorf("highly protected process should not be controlled: %s (PID: %d) - %s", 
				processName, pid, proc.Description)
		case ProtectionMedium:
			LogWarn("Controlling medium-protected process", 
				"process", processName, "pid", pid, "description", proc.Description)
			// 경고만 하고 허용
			return nil
		case ProtectionLow:
			// 낮은 보호 수준은 경고 없이 허용
			return nil
		}
	}
	
	return nil // 중요하지 않은 프로세스는 제어 허용
}

// GetCriticalProcesses returns list of critical processes for current platform
func (pps *ProcessProtectionService) GetCriticalProcesses() []*CriticalProcessInfo {
	pps.mutex.RLock()
	defer pps.mutex.RUnlock()
	
	var result []*CriticalProcessInfo
	for _, proc := range pps.criticalProcesses {
		if proc.Platform == pps.currentPlatform || proc.Platform == "all" {
			result = append(result, proc)
		}
	}
	
	return result
}

// AddCustomCriticalProcess allows adding custom critical processes
func (pps *ProcessProtectionService) AddCustomCriticalProcess(proc *CriticalProcessInfo) {
	pps.mutex.Lock()
	defer pps.mutex.Unlock()
	
	if proc.Platform == "" {
		proc.Platform = pps.currentPlatform
	}
	
	key := fmt.Sprintf("%s_%s", proc.Platform, strings.ToLower(proc.Name))
	pps.criticalProcesses[key] = proc
	
	LogInfo("Added custom critical process", 
		"name", proc.Name, 
		"level", proc.ProtectionLevel,
		"platform", proc.Platform)
}

// GetProcessProtectionLevel returns the protection level for a process
func (pps *ProcessProtectionService) GetProcessProtectionLevel(processName string, pid int32) ProcessProtectionLevel {
	if proc, isCritical := pps.IsCriticalProcess(processName, pid); isCritical {
		return proc.ProtectionLevel
	}
	return ProtectionNone
}


// Enhanced critical process checking with PID support
func IsCriticalProcessWithPID(processName string, pid int32) bool {
	pps := GetProcessProtectionService()
	_, isCritical := pps.IsCriticalProcess(processName, pid)
	return isCritical
}

// CanKillProcess checks if a specific process can be killed
func CanKillProcess(processName string, pid int32) error {
	pps := GetProcessProtectionService()
	return pps.CanControlProcess(processName, pid)
}