package monitoring

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
	Platform          string             `json:"platform"`           // 운영체제
	UACStatus         UACStatus          `json:"uac_status"`         // UAC 상태
	ProcessPrivileges []ProcessPrivilege `json:"process_privileges"` // 프로세스 권한 목록
	IsSecureMode      bool               `json:"is_secure_mode"`     // 보안 모드 여부
	Recommendations   []string           `json:"recommendations"`    // 보안 권장사항
}

// Windows API 상수 및 구조체 정의
const (
	TOKEN_QUERY               = 0x0008
	TokenElevationType        = 18
	TokenElevationTypeDefault = 1
	TokenElevationTypeFull    = 2
	TokenElevationTypeLimited = 3
)
