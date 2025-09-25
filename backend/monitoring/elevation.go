package monitoring

import (
	"fmt"
	"os/exec"
	"runtime"
)

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
	cmd := exec.Command("powershell",
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
