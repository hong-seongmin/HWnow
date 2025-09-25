package monitoring

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Enhanced Unix/Linux Security Functions

// isRootUser checks if current user is root
func isRootUser() bool {
	// UID 0이면 root 사용자
	cmd := exec.Command("id", "-u")
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
	cmd := exec.Command("whoami")
	output, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("failed to get username: %v", err)
	}

	username := strings.TrimSpace(string(output))

	// groups 명령으로 사용자 그룹 확인
	cmd = exec.Command("groups", username)
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
	cmd := exec.Command("sudo", "-n", "true")
	err := cmd.Run()
	if err == nil {
		return true, nil
	}

	// 3. sudo -v로 sudo 권한 상태 확인
	cmd = exec.Command("sudo", "-v", "-n")
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
	cmd := exec.Command("capsh", "--print")
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
		"cap_kill",         // 프로세스 종료 권한
		"cap_sys_nice",     // 프로세스 우선순위 변경 권한
		"cap_sys_ptrace",   // 프로세스 추적 권한
		"cap_dac_override", // 파일 권한 무시
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
	cmd := exec.Command("getpcaps", fmt.Sprintf("%d", os.Getpid()))
	output, err := cmd.Output()
	if err != nil {
		// 두 명령 모두 실패하면 기본값만 반환
		return map[string]bool{
			"cap_kill":         false,
			"cap_sys_nice":     false,
			"cap_sys_ptrace":   false,
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
		"cap_kill",     // 프로세스 종료에 필요
		"cap_sys_nice", // 우선순위 변경에 필요
	}

	for _, required := range requiredCaps {
		if capName == required {
			return true
		}
	}

	return false
}
