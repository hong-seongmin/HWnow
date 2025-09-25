package monitoring

import (
	"time"
)

// Metric은 단일 모니터링 지표를 나타냅니다.
type Metric struct {
	Type  string
	Value float64
	Info  string // CPU 모델명 등 추가 정보
}

// ResourceSnapshot은 특정 시점의 모든 자원 사용량 스냅샷입니다.
type ResourceSnapshot struct {
	Timestamp time.Time
	Metrics   []Metric
}

// 추가된 데이터 구조들
type DiskUsageInfo struct {
	Total       float64
	Used        float64
	Free        float64
	UsedPercent float64
}

type MemoryDetails struct {
	Physical float64
	Virtual  float64
	Swap     float64
}

type NetworkInterface struct {
	Name      string
	Status    float64 // 1.0 for up, 0.0 for down
	IpAddress string
}

type ProcessInfo struct {
	Name          string
	PID           int32
	CPUPercent    float64
	MemoryPercent float64
}

type BatteryInfo struct {
	Percent float64
	Plugged float64 // 1.0 for plugged, 0.0 for unplugged
}

type GPUInfo struct {
	Name        string
	Usage       float64 // GPU 사용률 (%)
	MemoryUsed  float64 // 사용된 GPU 메모리 (MB)
	MemoryTotal float64 // 총 GPU 메모리 (MB)
	Temperature float64 // GPU 온도 (°C)
	Power       float64 // GPU 전력 소모 (W)
}

type GPUProcess struct {
	PID       int32   `json:"pid"`        // 프로세스 ID
	Name      string  `json:"name"`       // 프로세스 이름
	GPUUsage  float64 `json:"gpu_usage"`  // GPU 사용률 (%)
	GPUMemory float64 `json:"gpu_memory"` // GPU 메모리 사용량 (MB)
	Type      string  `json:"type"`       // 프로세스 유형 (C: Compute, G: Graphics, C+G: Both)
	Command   string  `json:"command"`    // 실행 명령어 (선택적)
	Status    string  `json:"status"`     // 프로세스 상태 (running, suspended, etc.)
}
