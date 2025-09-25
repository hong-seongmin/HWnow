package monitoring

import (
	"log"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
)

// cpuMonitor implements the CPUMonitor interface
type cpuMonitor struct {
	name string
}

// NewCPUMonitor creates a new CPU monitor
func NewCPUMonitor() CPUMonitor {
	return &cpuMonitor{
		name: "cpu_monitor",
	}
}

// Initialize initializes the CPU monitor
func (c *cpuMonitor) Initialize() error {
	return nil
}

// Cleanup performs cleanup operations
func (c *cpuMonitor) Cleanup() error {
	return nil
}

// GetName returns the monitor name
func (c *cpuMonitor) GetName() string {
	return c.name
}

// GetCPUCoreUsage returns per-core CPU usage
func (c *cpuMonitor) GetCPUCoreUsage() ([]float64, error) {
	// CPU 최적화 Phase 3: 코어별 측정 시간 단축 및 캐시 적용
	percentages, err := cpu.Percent(200*time.Millisecond, true) // CPU 최적화: 1초 → 200ms (5배 빨라짐)
	if err != nil {
		return nil, err
	}

	// CPU 정보 확인
	cpuInfo, err := cpu.Info()
	if err == nil && len(cpuInfo) > 0 {
		log.Printf("CPU Info - Model: %s, Cores: %d, Physical Cores: %d",
			cpuInfo[0].ModelName, cpuInfo[0].Cores, len(percentages))
	}

	return percentages, nil
}

// GetCPUCores returns the number of CPU cores
func (c *cpuMonitor) GetCPUCores() (int, error) {
	// 먼저 gopsutil을 시도
	cores, err := cpu.Counts(true) // 물리적 코어 수
	if err == nil && cores > 0 {
		return cores, nil
	}

	// Windows에서는 WMI를 사용
	if GetCurrentPlatform() == "windows" {
		wmiCores := c.getCPUCoresFromWMI()
		if wmiCores > 0 {
			return wmiCores, nil
		}
	}

	// 마지막 시도: 논리적 코어 수
	logicalCores, err := cpu.Counts(false)
	if err != nil {
		return 0, err
	}

	return logicalCores, nil
}

// getCPUCoresFromWMI gets CPU core count using Windows WMI
func (c *cpuMonitor) getCPUCoresFromWMI() int {
	cmd := exec.Command("wmic", "cpu", "get", "NumberOfCores", "/format:csv")
	output, err := cmd.Output()
	if err != nil {
		return 0
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, ",") {
			parts := strings.Split(line, ",")
			if len(parts) >= 2 && strings.TrimSpace(parts[1]) != "" {
				cores, err := strconv.Atoi(strings.TrimSpace(parts[1]))
				if err == nil && cores > 0 {
					return cores
				}
			}
		}
	}
	return 0
}

// GetCPUModelName returns the CPU model name
func (c *cpuMonitor) GetCPUModelName() (string, error) {
	// 먼저 gopsutil을 시도
	cpuInfo, err := cpu.Info()
	if err == nil && len(cpuInfo) > 0 && cpuInfo[0].ModelName != "" {
		return strings.TrimSpace(cpuInfo[0].ModelName), nil
	}

	// Windows에서는 WMI를 시도
	if GetCurrentPlatform() == "windows" {
		wmiModel := c.getCPUModelFromWMI()
		if wmiModel != "" {
			return wmiModel, nil
		}
	}

	return "Unknown CPU", nil
}

// getCPUModelFromWMI gets CPU model name using Windows WMI
func (c *cpuMonitor) getCPUModelFromWMI() string {
	cmd := exec.Command("wmic", "cpu", "get", "Name", "/format:csv")
	output, err := cmd.Output()
	if err != nil {
		return ""
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, ",") {
			parts := strings.Split(line, ",")
			if len(parts) >= 2 && strings.TrimSpace(parts[1]) != "" {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return ""
}

// GetCPUUsage returns overall CPU usage percentage
func (c *cpuMonitor) GetCPUUsage() (float64, error) {
	percentages, err := cpu.Percent(200*time.Millisecond, false)
	if err != nil {
		return 0, err
	}

	if len(percentages) > 0 {
		return percentages[0], nil
	}

	return 0, nil
}