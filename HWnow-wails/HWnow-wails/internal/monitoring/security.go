package monitoring

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

// CachedResult represents a cached security check result
type CachedResult struct {
	Value     interface{}
	Timestamp time.Time
}

// SecurityCache provides caching for expensive security operations
type SecurityCache struct {
	mu            sync.RWMutex
	uacStatus     *CachedResult
	adminRights   *CachedResult
	registryData  map[string]*CachedResult
	cacheDuration time.Duration
}

// Global security cache instance
var securityCache = &SecurityCache{
	registryData:  make(map[string]*CachedResult),
	cacheDuration: 30 * time.Second, // Default cache duration
}

// SetCacheDuration sets the cache duration for security checks
func SetCacheDuration(duration time.Duration) {
	securityCache.mu.Lock()
	defer securityCache.mu.Unlock()
	securityCache.cacheDuration = duration
}

// executeBatchPowerShell executes multiple commands in a single PowerShell session
func executeBatchPowerShell(commands []string) (string, error) {
	if runtime.GOOS != "windows" {
		return "", fmt.Errorf("batch PowerShell execution only supported on Windows")
	}
	
	// Combine commands into a single PowerShell script
	scriptContent := strings.Join(commands, "; ")
	
	cmd := createHiddenCommand("powershell", "-WindowStyle", "Hidden", "-NonInteractive", "-Command", scriptContent)
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("batch PowerShell execution failed: %v", err)
	}
	
	return string(output), nil
}

// Helper function to create exec.Command with hidden window for Windows
func createHiddenCommand(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	
	// CMD 창 숨기기 설정 (Windows 전용)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
		
		// 추가적인 창 숨기기 설정
		cmd.SysProcAttr.CreationFlags |= 0x00000010 // DETACHED_PROCESS
		
		// StartupInfo 설정으로 창 완전히 숨기기
		cmd.SysProcAttr.CreationFlags |= 0x00000200 // CREATE_NO_WINDOW 강화
		
		// 환경 변수로 콘솔 출력 억제
		if cmd.Env == nil {
			cmd.Env = os.Environ()
		}
		cmd.Env = append(cmd.Env, "TERM=dumb") // 터미널 출력 최소화
	}
	
	return cmd
}

// Windows UAC 및 권한 관리 시스템

// UACStatus represents the current UAC (User Access Control) status
type UACStatus struct {
	IsEnabled    bool   `json:"is_enabled"`    // UAC가 활성화되었는지
	IsElevated   bool   `json:"is_elevated"`   // 현재 프로세스가 관리자 권한으로 실행 중인지
	Level        string `json:"level"`         // UAC 레벨 (Always, Consent, Prompt)
	RequiredFor  string `json:"required_for"`  // 무엇을 위해 권한이 필요한지
	CanElevate   bool   `json:"can_elevate"`   // 권한 상승이 가능한지
	ErrorMessage string `json:"error_message"` // 에러 메시지 (있는 경우)
}

// ProcessPrivilege represents process privilege information
type ProcessPrivilege struct {
	Name        string `json:"name"`        // 권한 이름
	Description string `json:"description"` // 권한 설명
	Enabled     bool   `json:"enabled"`     // 권한이 활성화되었는지
	Required    bool   `json:"required"`    // GPU 프로세스 제어를 위해 필요한 권한인지
}

// SecurityContext provides comprehensive security information
type SecurityContext struct {
	Platform         string             `json:"platform"`          // 운영체제
	UACStatus        UACStatus          `json:"uac_status"`         // UAC 상태
	ProcessPrivileges []ProcessPrivilege `json:"process_privileges"` // 프로세스 권한 목록
	IsSecureMode     bool               `json:"is_secure_mode"`     // 보안 모드 여부
	Recommendations  []string           `json:"recommendations"`    // 보안 권장사항
}

// Windows API 상수 및 구조체 정의
const (
	TOKEN_QUERY = 0x0008
	TokenElevationType = 18
	TokenElevationTypeDefault = 1
	TokenElevationTypeFull = 2
	TokenElevationTypeLimited = 3
)

// GetSecurityContext returns comprehensive security context information
func GetSecurityContext() (*SecurityContext, error) {
	ctx := &SecurityContext{
		Platform:          runtime.GOOS,
		ProcessPrivileges: []ProcessPrivilege{},
		Recommendations:   []string{},
	}
	
	if runtime.GOOS == "windows" {
		return getWindowsSecurityContext(ctx)
	} else if runtime.GOOS == "linux" || runtime.GOOS == "darwin" {
		return getUnixSecurityContext(ctx)
	}
	
	return ctx, fmt.Errorf("unsupported platform: %s", runtime.GOOS)
}

// getWindowsSecurityContext builds security context for Windows systems
func getWindowsSecurityContext(ctx *SecurityContext) (*SecurityContext, error) {
	// UAC 상태 확인
	uacStatus, err := getWindowsUACStatus()
	if err != nil {
		LogError("Failed to get UAC status", "error", err)
		uacStatus = &UACStatus{
			ErrorMessage: err.Error(),
		}
	}
	ctx.UACStatus = *uacStatus
	
	// 프로세스 권한 확인
	privileges, err := getWindowsProcessPrivileges()
	if err != nil {
		LogError("Failed to get process privileges", "error", err)
		ctx.Recommendations = append(ctx.Recommendations, 
			"프로세스 권한을 확인할 수 없습니다. 관리자 권한으로 재실행하세요.")
	} else {
		ctx.ProcessPrivileges = privileges
	}
	
	// 보안 모드 결정
	ctx.IsSecureMode = ctx.UACStatus.IsEnabled && ctx.UACStatus.IsElevated
	
	// 권장사항 생성
	ctx.Recommendations = generateWindowsRecommendations(ctx)
	
	return ctx, nil
}

// getUnixSecurityContext builds security context for Unix-like systems  
func getUnixSecurityContext(ctx *SecurityContext) (*SecurityContext, error) {
	// Unix sudo 상태 확인
	sudoStatus, err := getUnixSudoStatus()
	if err != nil {
		LogError("Failed to get Unix sudo status", "error", err)
		sudoStatus = &UACStatus{
			ErrorMessage: err.Error(),
		}
	}
	ctx.UACStatus = *sudoStatus
	
	// Unix 프로세스 권한 확인
	privileges, err := getUnixProcessPrivileges()
	if err != nil {
		LogError("Failed to get Unix process privileges", "error", err)
		ctx.Recommendations = append(ctx.Recommendations, 
			"프로세스 권한을 확인할 수 없습니다. sudo 권한으로 재실행하세요.")
	} else {
		ctx.ProcessPrivileges = privileges
	}
	
	// 보안 모드 결정
	ctx.IsSecureMode = ctx.UACStatus.IsElevated
	
	// 권장사항 생성
	ctx.Recommendations = generateUnixRecommendations(ctx)
	
	return ctx, nil
}

// getWindowsUACStatus checks Windows UAC (User Access Control) status
func getWindowsUACStatus() (*UACStatus, error) {
	status := &UACStatus{
		RequiredFor: "GPU 프로세스 제어 작업",
		CanElevate:  true,
	}
	
	// UAC 활성화 여부 확인
	enabled, err := isUACEnabled()
	if err != nil {
		LogError("Failed to check if UAC is enabled", "error", err)
		status.ErrorMessage = fmt.Sprintf("UAC 상태 확인 실패: %v", err)
	}
	status.IsEnabled = enabled
	
	// UAC 레벨 확인
	level, err := getUACLevel()
	if err != nil {
		LogError("Failed to get UAC level", "error", err)
		status.Level = "Unknown"
	} else {
		status.Level = level
	}
	
	// 현재 프로세스 권한 상승 여부 확인
	elevated, err := isProcessElevated()
	if err != nil {
		LogError("Failed to check process elevation", "error", err)
		status.ErrorMessage = fmt.Sprintf("프로세스 권한 확인 실패: %v", err)
	}
	status.IsElevated = elevated
	
	LogInfo("Windows UAC Status", 
		"enabled", status.IsEnabled, 
		"elevated", status.IsElevated, 
		"level", status.Level)
	
	return status, nil
}

// isUACEnabled checks if UAC is enabled in Windows with caching
func isUACEnabled() (bool, error) {
	cacheKey := "UAC_EnableLUA"
	
	// Check cache first
	securityCache.mu.RLock()
	if cached, exists := securityCache.registryData[cacheKey]; exists {
		if time.Since(cached.Timestamp) < securityCache.cacheDuration {
			securityCache.mu.RUnlock()
			return cached.Value.(bool), nil
		}
	}
	securityCache.mu.RUnlock()
	
	// 레지스트리에서 UAC 설정 확인
	cmd := createHiddenCommand("reg", "query", 
		"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", 
		"/v", "EnableLUA")
	
	output, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("failed to query UAC registry: %v", err)
	}
	
	outputStr := string(output)
	// EnableLUA 값이 0x1이면 UAC 활성화
	result := strings.Contains(outputStr, "0x1")
	
	// Cache the result
	securityCache.mu.Lock()
	securityCache.registryData[cacheKey] = &CachedResult{
		Value:     result,
		Timestamp: time.Now(),
	}
	securityCache.mu.Unlock()
	
	return result, nil
}

// getUACLevel gets the current UAC level
func getUACLevel() (string, error) {
	// ConsentPromptBehaviorAdmin 레지스트리 값으로 UAC 레벨 확인
	cmd := createHiddenCommand("reg", "query", 
		"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", 
		"/v", "ConsentPromptBehaviorAdmin")
	
	output, err := cmd.Output()
	if err != nil {
		return "Unknown", fmt.Errorf("failed to query UAC level: %v", err)
	}
	
	outputStr := string(output)
	
	if strings.Contains(outputStr, "0x0") {
		return "Never notify", nil
	} else if strings.Contains(outputStr, "0x1") {
		return "Prompt for credentials on secure desktop", nil
	} else if strings.Contains(outputStr, "0x2") {
		return "Prompt for consent on secure desktop", nil
	} else if strings.Contains(outputStr, "0x5") {
		return "Prompt for consent for non-Windows binaries", nil
	}
	
	return "Default", nil
}

// isProcessElevated checks if current process is running with elevated privileges
func isProcessElevated() (bool, error) {
	// 먼저 간단한 방법으로 확인
	if hasSimpleAdminRights() {
		return true, nil
	}
	
	// Windows API를 사용한 정확한 권한 확인
	return checkTokenElevation()
}

// hasSimpleAdminRights performs a simple admin rights check with caching
func hasSimpleAdminRights() bool {
	// Check cache first
	securityCache.mu.RLock()
	if securityCache.adminRights != nil {
		if time.Since(securityCache.adminRights.Timestamp) < securityCache.cacheDuration {
			securityCache.mu.RUnlock()
			return securityCache.adminRights.Value.(bool)
		}
	}
	securityCache.mu.RUnlock()
	
	// net session 명령으로 간단한 관리자 권한 확인
	cmd := createHiddenCommand("net", "session")
	err := cmd.Run()
	result := err == nil
	
	// Cache the result
	securityCache.mu.Lock()
	securityCache.adminRights = &CachedResult{
		Value:     result,
		Timestamp: time.Now(),
	}
	securityCache.mu.Unlock()
	
	return result
}

// checkTokenElevation uses Windows API to check token elevation
func checkTokenElevation() (bool, error) {
	// Windows API 호출을 위한 DLL 로드
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getCurrentProcess := kernel32.NewProc("GetCurrentProcess")
	
	advapi32 := syscall.NewLazyDLL("advapi32.dll")
	openProcessToken := advapi32.NewProc("OpenProcessToken")
	getTokenInformation := advapi32.NewProc("GetTokenInformation")
	
	// 현재 프로세스 핸들 가져오기
	processHandle, _, _ := getCurrentProcess.Call()
	
	// 프로세스 토큰 열기
	var tokenHandle syscall.Handle
	ret, _, err := openProcessToken.Call(
		processHandle,
		TOKEN_QUERY,
		uintptr(unsafe.Pointer(&tokenHandle)),
	)
	
	if ret == 0 {
		return false, fmt.Errorf("OpenProcessToken failed: %v", err)
	}
	defer syscall.CloseHandle(tokenHandle)
	
	// 토큰 권한 정보 가져오기
	var elevationType uint32
	var returnedLen uint32
	
	ret, _, err = getTokenInformation.Call(
		uintptr(tokenHandle),
		TokenElevationType,
		uintptr(unsafe.Pointer(&elevationType)),
		unsafe.Sizeof(elevationType),
		uintptr(unsafe.Pointer(&returnedLen)),
	)
	
	if ret == 0 {
		return false, fmt.Errorf("GetTokenInformation failed: %v", err)
	}
	
	// 권한 상승 타입 확인
	return elevationType == TokenElevationTypeFull, nil
}

// getWindowsProcessPrivileges gets Windows process privileges
func getWindowsProcessPrivileges() ([]ProcessPrivilege, error) {
	privileges := []ProcessPrivilege{}
	
	// 필요한 권한들 정의
	requiredPrivileges := map[string]string{
		"SeDebugPrivilege":         "프로세스 디버깅 권한 (프로세스 종료에 필요)",
		"SeIncreaseBasePriorityPrivilege": "프로세스 우선순위 변경 권한",
		"SeShutdownPrivilege":      "시스템 종료 권한",
		"SeTcbPrivilege":          "운영체제의 일부로 작동 권한",
		"SeAssignPrimaryTokenPrivilege": "토큰 할당 권한",
	}
	
	for privName, description := range requiredPrivileges {
		enabled, err := checkWindowsPrivilege(privName)
		if err != nil {
			LogError("Failed to check privilege", "privilege", privName, "error", err)
		}
		
		privilege := ProcessPrivilege{
			Name:        privName,
			Description: description,
			Enabled:     enabled,
			Required:    isPrivilegeRequired(privName),
		}
		
		privileges = append(privileges, privilege)
	}
	
	return privileges, nil
}

// checkWindowsPrivilege checks if a specific Windows privilege is enabled
func checkWindowsPrivilege(privilegeName string) (bool, error) {
	// whoami /priv 명령으로 권한 확인
	cmd := createHiddenCommand("whoami", "/priv")
	output, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("failed to run whoami /priv: %v", err)
	}
	
	outputStr := string(output)
	lines := strings.Split(outputStr, "\n")
	
	for _, line := range lines {
		if strings.Contains(line, privilegeName) {
			// "Enabled" 상태인지 확인
			return strings.Contains(line, "Enabled"), nil
		}
	}
	
	return false, nil
}

// isPrivilegeRequired determines if a privilege is required for GPU process control
func isPrivilegeRequired(privilegeName string) bool {
	requiredPrivileges := []string{
		"SeDebugPrivilege",
		"SeIncreaseBasePriorityPrivilege",
	}
	
	for _, required := range requiredPrivileges {
		if privilegeName == required {
			return true
		}
	}
	
	return false
}

// generateWindowsRecommendations generates security recommendations for Windows
func generateWindowsRecommendations(ctx *SecurityContext) []string {
	recommendations := []string{}
	
	if !ctx.UACStatus.IsEnabled {
		recommendations = append(recommendations, 
			"보안을 위해 UAC(사용자 계정 컨트롤)를 활성화하는 것을 권장합니다.")
	}
	
	if !ctx.UACStatus.IsElevated {
		recommendations = append(recommendations, 
			"GPU 프로세스 제어를 위해 관리자 권한으로 애플리케이션을 실행하세요.")
		recommendations = append(recommendations, 
			"마우스 우클릭 후 '관리자 권한으로 실행'을 선택하거나, PowerShell에서 'Start-Process -Verb RunAs' 명령을 사용하세요.")
	}
	
	if ctx.UACStatus.Level == "Never notify" {
		recommendations = append(recommendations, 
			"보안상 UAC 레벨을 'Default' 또는 'Always notify'로 설정하는 것을 권장합니다.")
	}
	
	// 필수 권한 확인
	missingPrivileges := []string{}
	for _, priv := range ctx.ProcessPrivileges {
		if priv.Required && !priv.Enabled {
			missingPrivileges = append(missingPrivileges, priv.Name)
		}
	}
	
	if len(missingPrivileges) > 0 {
		recommendations = append(recommendations, 
			fmt.Sprintf("다음 권한이 부족합니다: %s. 관리자 권한으로 재실행하거나 그룹 정책을 확인하세요.", 
				strings.Join(missingPrivileges, ", ")))
	}
	
	if ctx.IsSecureMode {
		recommendations = append(recommendations, 
			"보안 모드가 활성화되었습니다. GPU 프로세스 제어가 안전하게 수행됩니다.")
	}
	
	return recommendations
}

// generateUnixRecommendations generates security recommendations for Unix-like systems
func generateUnixRecommendations(ctx *SecurityContext) []string {
	recommendations := []string{}
	
	if !ctx.UACStatus.IsElevated {
		recommendations = append(recommendations, 
			"GPU 프로세스 제어를 위해 sudo 권한이 필요합니다.")
		recommendations = append(recommendations, 
			"'sudo ./your-app' 명령으로 실행하거나, sudoers 파일에 사용자를 추가하세요.")
	}
	
	if ctx.IsSecureMode {
		recommendations = append(recommendations, 
			"sudo 권한이 확인되었습니다. GPU 프로세스 제어가 가능합니다.")
	}
	
	return recommendations
}

// RequestElevation attempts to request elevation for the current process
func RequestElevation() error {
	if runtime.GOOS == "windows" {
		return requestWindowsElevation()
	} else {
		return fmt.Errorf("elevation request not supported on %s", runtime.GOOS)
	}
}

// requestWindowsElevation requests Windows UAC elevation
func requestWindowsElevation() error {
	// 현재 실행 파일 경로 가져오기
	currentExe, err := exec.LookPath("monitoring-app.exe")
	if err != nil {
		return fmt.Errorf("failed to get current executable path: %v", err)
	}
	
	// PowerShell을 사용하여 관리자 권한으로 재실행
	cmd := createHiddenCommand("powershell", 
		"-Command", 
		fmt.Sprintf("Start-Process -FilePath '%s' -Verb RunAs", currentExe))
	
	err = cmd.Start()
	if err != nil {
		return fmt.Errorf("failed to request elevation: %v", err)
	}
	
	LogInfo("Elevation requested", "executable", currentExe)
	return nil
}

// Enhanced HasAdminPrivileges function with detailed checking
func HasAdminPrivileges() (bool, error) {
	if runtime.GOOS == "windows" {
		return hasWindowsAdminPrivileges()
	}
	return hasUnixSudoRights()
}

// hasWindowsAdminPrivileges performs comprehensive Windows admin privilege check
func hasWindowsAdminPrivileges() (bool, error) {
	// 1. 간단한 확인 먼저
	if hasSimpleAdminRights() {
		// 2. API를 통한 정확한 확인
		elevated, err := checkTokenElevation()
		if err != nil {
			LogWarn("Token elevation check failed, using simple check result", "error", err)
			return true, nil // 간단한 확인이 성공했으므로 true 반환
		}
		return elevated, nil
	}
	
	return false, nil
}

// ValidateSecurityContext validates current security context for GPU operations
func ValidateSecurityContext() error {
	ctx, err := GetSecurityContext()
	if err != nil {
		return fmt.Errorf("failed to get security context: %v", err)
	}
	
	if !ctx.IsSecureMode {
		return fmt.Errorf("insufficient privileges for GPU process control operations")
	}
	
	if runtime.GOOS == "windows" {
		// Windows 특별 검증
		if !ctx.UACStatus.IsEnabled {
			LogWarn("UAC is disabled - operations may be less secure")
		}
		
		if !ctx.UACStatus.IsElevated {
			return fmt.Errorf("administrator privileges required for GPU process control")
		}
		
		// 필수 권한 확인
		for _, priv := range ctx.ProcessPrivileges {
			if priv.Required && !priv.Enabled {
				return fmt.Errorf("required privilege not enabled: %s", priv.Name)
			}
		}
	}
	
	LogInfo("Security context validated successfully", 
		"platform", ctx.Platform,
		"secure_mode", ctx.IsSecureMode,
		"elevated", ctx.UACStatus.IsElevated)
	
	return nil
}

// Enhanced Unix/Linux Security Functions

// isRootUser checks if current user is root
func isRootUser() bool {
	// UID 0이면 root 사용자
	cmd := createHiddenCommand("id", "-u")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	
	uid := strings.TrimSpace(string(output))
	return uid == "0"
}

// isUserInSudoGroup checks if current user is in sudo/wheel group
func isUserInSudoGroup() (bool, error) {
	// 현재 사용자 이름 가져오기
	cmd := createHiddenCommand("whoami")
	output, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("failed to get username: %v", err)
	}
	
	username := strings.TrimSpace(string(output))
	
	// groups 명령으로 사용자 그룹 확인
	cmd = createHiddenCommand("groups", username)
	output, err = cmd.Output()
	if err != nil {
		return false, fmt.Errorf("failed to get user groups: %v", err)
	}
	
	groups := strings.ToLower(string(output))
	
	// sudo, wheel, admin 그룹 중 하나에 속해있는지 확인
	sudoGroups := []string{"sudo", "wheel", "admin"}
	for _, group := range sudoGroups {
		if strings.Contains(groups, group) {
			return true, nil
		}
	}
	
	return false, nil
}

// Enhanced hasUnixSudoRights with comprehensive checking
func hasUnixSudoRights() (bool, error) {
	// 1. 현재 사용자가 root인지 확인
	if isRootUser() {
		return true, nil
	}
	
	// 2. sudo -n true 명령으로 비밀번호 없이 sudo 실행 가능한지 확인
	cmd := createHiddenCommand("sudo", "-n", "true")
	err := cmd.Run()
	if err == nil {
		return true, nil
	}
	
	// 3. sudo -v로 sudo 권한 상태 확인
	cmd = createHiddenCommand("sudo", "-v", "-n")
	err = cmd.Run()
	if err == nil {
		return true, nil
	}
	
	// 4. 사용자가 sudo 그룹에 속해있는지 확인
	inSudoGroup, err := isUserInSudoGroup()
	if err != nil {
		LogWarn("Failed to check sudo group membership", "error", err)
	}
	
	return inSudoGroup, nil
}

// getUnixSudoStatus gets detailed sudo status on Unix systems
func getUnixSudoStatus() (*UACStatus, error) {
	status := &UACStatus{
		IsEnabled:   true, // Unix는 기본적으로 권한 시스템 활성화
		RequiredFor: "GPU 프로세스 제어 작업",
		CanElevate:  true,
		Level:       "sudo",
	}
	
	// Root 사용자 확인
	if isRootUser() {
		status.IsElevated = true
		status.Level = "root"
		return status, nil
	}
	
	// sudo 권한 확인
	hasSudo, err := hasUnixSudoRights()
	if err != nil {
		LogError("Failed to check sudo rights", "error", err)
		status.ErrorMessage = fmt.Sprintf("sudo 권한 확인 실패: %v", err)
	}
	status.IsElevated = hasSudo
	
	// sudo 그룹 멤버십 확인
	inSudoGroup, err := isUserInSudoGroup()
	if err != nil {
		LogWarn("Failed to check sudo group membership", "error", err)
	} else if !inSudoGroup && !hasSudo {
		status.ErrorMessage = "사용자가 sudo 그룹에 속해있지 않습니다."
		status.CanElevate = false
	}
	
	return status, nil
}

// getUnixProcessPrivileges gets Unix process privileges
func getUnixProcessPrivileges() ([]ProcessPrivilege, error) {
	privileges := []ProcessPrivilege{}
	
	// Root 권한 확인
	isRoot := isRootUser()
	privileges = append(privileges, ProcessPrivilege{
		Name:        "root",
		Description: "Root 사용자 권한",
		Enabled:     isRoot,
		Required:    false, // root는 선택사항, sudo로도 충분
	})
	
	// sudo 권한 확인
	hasSudo, err := hasUnixSudoRights()
	if err != nil {
		LogError("Failed to check sudo rights", "error", err)
	}
	
	privileges = append(privileges, ProcessPrivilege{
		Name:        "sudo",
		Description: "Superuser 권한 (sudo)",
		Enabled:     hasSudo,
		Required:    true,
	})
	
	// 특정 권한들 확인
	capabilities, err := getUnixCapabilities()
	if err != nil {
		LogWarn("Failed to get capabilities", "error", err)
	} else {
		for name, enabled := range capabilities {
			privileges = append(privileges, ProcessPrivilege{
				Name:        name,
				Description: getCapabilityDescription(name),
				Enabled:     enabled,
				Required:    isCapabilityRequired(name),
			})
		}
	}
	
	return privileges, nil
}

// getUnixCapabilities gets Unix process capabilities
func getUnixCapabilities() (map[string]bool, error) {
	capabilities := make(map[string]bool)
	
	// capsh 명령으로 현재 프로세스 capabilities 확인
	cmd := createHiddenCommand("capsh", "--print")
	output, err := cmd.Output()
	if err != nil {
		// capsh가 없는 경우 getpcaps 시도
		return getUnixCapabilitiesAlternative()
	}
	
	outputStr := string(output)
	lines := strings.Split(outputStr, "\n")
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Current: ") {
			// Current: = 형태에서 capabilities 추출
			capsStr := strings.TrimPrefix(line, "Current: ")
			capsStr = strings.TrimPrefix(capsStr, "=")
			
			if capsStr == "" {
				break
			}
			
			caps := strings.Split(capsStr, ",")
			for _, cap := range caps {
				cap = strings.TrimSpace(cap)
				if cap != "" {
					capabilities[cap] = true
				}
			}
		}
	}
	
	// 주요 capabilities 확인 (없으면 false로 설정)
	importantCaps := []string{
		"cap_kill",           // 프로세스 종료 권한
		"cap_sys_nice",       // 프로세스 우선순위 변경 권한
		"cap_sys_ptrace",     // 프로세스 추적 권한
		"cap_dac_override",   // 파일 권한 무시
	}
	
	for _, cap := range importantCaps {
		if _, exists := capabilities[cap]; !exists {
			capabilities[cap] = false
		}
	}
	
	return capabilities, nil
}

// getUnixCapabilitiesAlternative gets capabilities using alternative method
func getUnixCapabilitiesAlternative() (map[string]bool, error) {
	capabilities := make(map[string]bool)
	
	// getpcaps로 현재 프로세스 ID의 capabilities 확인
	cmd := createHiddenCommand("getpcaps", fmt.Sprintf("%d", os.Getpid()))
	output, err := cmd.Output()
	if err != nil {
		// 두 명령 모두 실패하면 기본값만 반환
		return map[string]bool{
			"cap_kill":        false,
			"cap_sys_nice":    false,
			"cap_sys_ptrace":  false,
			"cap_dac_override": false,
		}, nil
	}
	
	outputStr := string(output)
	
	// getpcaps 출력 파싱
	if strings.Contains(outputStr, "cap_kill") {
		capabilities["cap_kill"] = true
	}
	if strings.Contains(outputStr, "cap_sys_nice") {
		capabilities["cap_sys_nice"] = true
	}
	if strings.Contains(outputStr, "cap_sys_ptrace") {
		capabilities["cap_sys_ptrace"] = true
	}
	if strings.Contains(outputStr, "cap_dac_override") {
		capabilities["cap_dac_override"] = true
	}
	
	return capabilities, nil
}

// getCapabilityDescription returns description for Unix capability
func getCapabilityDescription(capName string) string {
	descriptions := map[string]string{
		"cap_kill":         "프로세스 종료 권한",
		"cap_sys_nice":     "프로세스 우선순위 변경 권한", 
		"cap_sys_ptrace":   "프로세스 디버깅/추적 권한",
		"cap_dac_override": "파일 액세스 권한 무시",
	}
	
	if desc, exists := descriptions[capName]; exists {
		return desc
	}
	return fmt.Sprintf("시스템 권한: %s", capName)
}

// isCapabilityRequired determines if a capability is required
func isCapabilityRequired(capName string) bool {
	requiredCaps := []string{
		"cap_kill",      // 프로세스 종료에 필요
		"cap_sys_nice",  // 우선순위 변경에 필요
	}
	
	for _, required := range requiredCaps {
		if capName == required {
			return true
		}
	}
	
	return false
}