package monitoring

import (
	"fmt"
)

// 에러 타입 정의
type GPUProcessError struct {
	Type    string
	PID     int32
	Message string
	Code    int
}

func (e *GPUProcessError) Error() string {
	if e.PID != 0 {
		return fmt.Sprintf("[%s] PID %d: %s (Code: %d)", e.Type, e.PID, e.Message, e.Code)
	}
	return fmt.Sprintf("[%s] %s (Code: %d)", e.Type, e.Message, e.Code)
}

// 에러 코드 상수
const (
	ErrorCodeProcessNotFound       = 1001
	ErrorCodeCriticalProcess       = 1002
	ErrorCodePermissionDenied      = 1003
	ErrorCodeInvalidPriority       = 1004
	ErrorCodeProcessAlreadyStopped = 1005
	ErrorCodeProcessAlreadyRunning = 1006
	ErrorCodeSystemError           = 1007
)

// createProcessError - 표준화된 프로세스 에러 생성
func createProcessError(errorType string, pid int32, message string, code int) *GPUProcessError {
	return &GPUProcessError{
		Type:    errorType,
		PID:     pid,
		Message: message,
		Code:    code,
	}
}
