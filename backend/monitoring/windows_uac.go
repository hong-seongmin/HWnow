package monitoring

import (
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

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

// isUACEnabled checks if UAC is enabled in Windows
func isUACEnabled() (bool, error) {
	// 레지스트리에서 UAC 설정 확인
	cmd := exec.Command("reg", "query",
		"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
		"/v", "EnableLUA")

	output, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("failed to query UAC registry: %v", err)
	}

	outputStr := string(output)
	// EnableLUA 값이 0x1이면 UAC 활성화
	return strings.Contains(outputStr, "0x1"), nil
}

// getUACLevel gets the current UAC level
func getUACLevel() (string, error) {
	// ConsentPromptBehaviorAdmin 레지스트리 값으로 UAC 레벨 확인
	cmd := exec.Command("reg", "query",
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

// hasSimpleAdminRights performs a simple admin rights check
func hasSimpleAdminRights() bool {
	// net session 명령으로 간단한 관리자 권한 확인
	cmd := exec.Command("net", "session")
	err := cmd.Run()
	return err == nil
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
