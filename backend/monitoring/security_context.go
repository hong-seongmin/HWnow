package monitoring

import (
	"fmt"
	"runtime"
	"strings"
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
