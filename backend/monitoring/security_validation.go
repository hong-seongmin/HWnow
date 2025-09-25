package monitoring

import (
	"fmt"
	"runtime"
)

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
