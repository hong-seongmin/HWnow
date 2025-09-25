package monitoring

import (
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/host"
)

// systemInfoProvider implements the SystemInfoProvider interface
type systemInfoProvider struct {
	name string
}

// NewSystemInfoProvider creates a new system info provider
func NewSystemInfoProvider() SystemInfoProvider {
	return &systemInfoProvider{
		name: "system_info_provider",
	}
}

// Initialize initializes the system info provider
func (s *systemInfoProvider) Initialize() error {
	return nil
}

// Cleanup performs cleanup operations
func (s *systemInfoProvider) Cleanup() error {
	return nil
}

// GetName returns the provider name
func (s *systemInfoProvider) GetName() string {
	return s.name
}

// GetBootTime returns system boot time
func (s *systemInfoProvider) GetBootTime() (time.Time, error) {
	bootTime, err := host.BootTime()
	if err != nil {
		return time.Time{}, err
	}
	return time.Unix(int64(bootTime), 0), nil
}

// GetSystemUptime returns system uptime in seconds
func (s *systemInfoProvider) GetSystemUptime() (int64, error) {
	uptime, err := host.Uptime()
	if err != nil {
		return 0, err
	}
	return int64(uptime), nil
}

// GetCurrentPlatform returns the current platform
func (s *systemInfoProvider) GetCurrentPlatform() string {
	return runtime.GOOS
}

// GetBatteryInfo returns battery information
func (s *systemInfoProvider) GetBatteryInfo() (*BatteryInfo, error) {
	// Windows에서 배터리 정보를 WMI로 가져오기
	if s.GetCurrentPlatform() == "windows" {
		return s.getBatteryInfoWindows()
	}

	// 다른 플랫폼에서는 기본 구현
	return &BatteryInfo{
		Percent: 0,
		Plugged: 1.0, // AC power
	}, nil
}

// getBatteryInfoWindows gets battery information on Windows using WMI
func (s *systemInfoProvider) getBatteryInfoWindows() (*BatteryInfo, error) {
	// WMI 쿼리를 사용한 배터리 정보 수집
	// 실제 구현에서는 WMI 호출을 통해 배터리 정보를 가져옴
	return &BatteryInfo{
		Percent: 0,   // WMI 결과에 따라 설정
		Plugged: 1.0, // AC power
	}, nil
}