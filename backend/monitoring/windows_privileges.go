package monitoring

import (
	"fmt"
	"os/exec"
	"strings"
)

// getWindowsProcessPrivileges gets Windows process privileges
func getWindowsProcessPrivileges() ([]ProcessPrivilege, error) {
	privileges := []ProcessPrivilege{}

	// 필요한 권한들 정의
	requiredPrivileges := map[string]string{
		"SeDebugPrivilege":                "프로세스 디버깅 권한 (프로세스 종료에 필요)",
		"SeIncreaseBasePriorityPrivilege": "프로세스 우선순위 변경 권한",
		"SeShutdownPrivilege":             "시스템 종료 권한",
		"SeTcbPrivilege":                  "운영체제의 일부로 작동 권한",
		"SeAssignPrimaryTokenPrivilege":   "토큰 할당 권한",
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
	cmd := exec.Command("whoami", "/priv")
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
