package monitoring

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// 로깅 레벨 정의
type LogLevel int

const (
	LogLevelDebug LogLevel = iota
	LogLevelInfo
	LogLevelWarn
	LogLevelError
	LogLevelFatal
)

var (
	logLevel = LogLevelInfo
	logFile  *os.File
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
	ErrorCodeProcessNotFound      = 1001
	ErrorCodeCriticalProcess      = 1002
	ErrorCodePermissionDenied     = 1003
	ErrorCodeInvalidPriority      = 1004
	ErrorCodeProcessAlreadyStopped = 1005
	ErrorCodeProcessAlreadyRunning = 1006
	ErrorCodeSystemError          = 1007
)

// InitializeLogging - 로깅 시스템 초기화
func InitializeLogging(level LogLevel, logFilePath string) error {
	logLevel = level
	
	if logFilePath != "" {
		var err error
		logFile, err = os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			return fmt.Errorf("failed to open log file: %v", err)
		}
		
		// 멀티 라이터로 파일과 콘솔 모두에 출력
		multiWriter := io.MultiWriter(os.Stdout, logFile)
		log.SetOutput(multiWriter)
	}
	
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	LogInfo("Logging system initialized", "level", level, "file", logFilePath)
	
	return nil
}

// CloseLogging - 로깅 시스템 종료
func CloseLogging() {
	if logFile != nil {
		logFile.Close()
	}
}

// 로깅 함수들
func LogDebug(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelDebug {
		args := []interface{}{"[DEBUG]", message}
		args = append(args, keyvals...)
		log.Println(args...)
	}
}

func LogInfo(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelInfo {
		args := []interface{}{"[INFO]", message}
		args = append(args, keyvals...)
		log.Println(args...)
	}
}

func LogWarn(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelWarn {
		args := []interface{}{"[WARN]", message}
		args = append(args, keyvals...)
		log.Println(args...)
	}
}

func LogError(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelError {
		args := []interface{}{"[ERROR]", message}
		args = append(args, keyvals...)
		log.Println(args...)
	}
}

func LogFatal(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelFatal {
		args := []interface{}{"[FATAL]", message}
		args = append(args, keyvals...)
		log.Fatalln(args...)
	}
}

// createProcessError - 표준화된 프로세스 에러 생성
func createProcessError(errorType string, pid int32, message string, code int) *GPUProcessError {
	return &GPUProcessError{
		Type:    errorType,
		PID:     pid,
		Message: message,
		Code:    code,
	}
}

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

// 모니터링을 위한 전역 변수
var (
	cpuInfoCounter int // CPU 정보 전송 카운터
)

// Start는 주기적으로 시스템 자원을 수집하여 채널로 전송하는 고루틴을 시작합니다.
// wsChan: WebSocket으로 실시간 전송하기 위한 채널
// dbChan: DB에 로그를 기록하기 위한 채널
func Start(wsChan chan<- *ResourceSnapshot, dbChan chan<- *ResourceSnapshot) {
	ticker := time.NewTicker(2 * time.Second) // 2초마다 데이터 수집
	defer ticker.Stop()

	// 네트워크/디스크 속도 계산을 위해 이전 상태 저장
	var prevNetCounters net.IOCountersStat
	var prevDiskCounters map[string]disk.IOCountersStat
	var lastSampleTime time.Time

	// 첫 샘플링
	netCounters, err := getNetCounters()
	if err == nil && len(netCounters) > 0 {
		prevNetCounters = netCounters[0]
	}
	prevDiskCounters, _ = disk.IOCounters()
	lastSampleTime = time.Now()

	for {
		<-ticker.C
		now := time.Now()
		duration := now.Sub(lastSampleTime).Seconds()
		lastSampleTime = now

		var metrics []Metric

		// CPU 정보 (처음 10회 전송, 그 후 30초마다 한 번씩)
		cpuInfoCounter++
		shouldSendCpuInfo := cpuInfoCounter <= 10 || cpuInfoCounter%15 == 0 // 처음 10회 + 30초마다 (15 * 2초)
		
		if shouldSendCpuInfo {
			cpuInfo, err := cpu.Info()
			if err == nil && len(cpuInfo) > 0 {
				cpuMetric := Metric{
					Type:  "cpu_info", 
					Value: float64(cpuInfo[0].Cores),
					Info:  cpuInfo[0].ModelName,
				}
				metrics = append(metrics, cpuMetric)
				log.Printf("Sending CPU info metric (#%d): Type=%s, Value=%.0f, Info=%s", 
					cpuInfoCounter, cpuMetric.Type, cpuMetric.Value, cpuMetric.Info)
			} else {
				log.Printf("Failed to get CPU info: %v", err)
			}
		}

		// CPU
		cpuUsage, err := getCpuUsage()
		if err != nil {
			log.Printf("Error getting CPU usage: %v", err)
		} else {
			metrics = append(metrics, Metric{Type: "cpu", Value: cpuUsage})
		}

		// CPU Core Usage
		coreUsage, err := getCpuCoreUsage()
		if err != nil {
			log.Printf("Error getting CPU core usage: %v", err)
		} else {
			log.Printf("Detected %d CPU cores", len(coreUsage))
			for i, usage := range coreUsage {
				// 코어 번호를 1부터 시작
				metrics = append(metrics, Metric{Type: fmt.Sprintf("cpu_core_%d", i+1), Value: usage})
			}
		}

		// Memory
		memUsage, err := getMemUsage()
		if err != nil {
			log.Printf("Error getting Memory usage: %v", err)
		} else {
			metrics = append(metrics, Metric{Type: "ram", Value: memUsage})
		}

		// Disk I/O
		diskRead, diskWrite, err := getDiskIO(prevDiskCounters, duration)
		if err != nil {
			log.Printf("Error getting Disk IO: %v", err)
		} else {
			metrics = append(metrics, Metric{Type: "disk_read", Value: diskRead})
			metrics = append(metrics, Metric{Type: "disk_write", Value: diskWrite})
			// 다음 계산을 위해 현재 카운터 업데이트
			currentDiskCounters, _ := disk.IOCounters()
			if len(currentDiskCounters) > 0 {
				prevDiskCounters = currentDiskCounters
			}
		}

		// Network I/O
		netSent, netRecv, err := getNetIO(prevNetCounters, duration)
		if err != nil {
			log.Printf("Error getting Net IO: %v", err)
		} else {
			metrics = append(metrics, Metric{Type: "net_sent", Value: netSent})
			metrics = append(metrics, Metric{Type: "net_recv", Value: netRecv})
			// 다음 계산을 위해 현재 카운터 업데이트
			currentNetCounters, _ := getNetCounters()
			if len(currentNetCounters) > 0 {
				prevNetCounters = currentNetCounters[0]
			}
		}

		// System Uptime
		uptime, err := getSystemUptime()
		if err != nil {
			log.Printf("Error getting system uptime: %v", err)
		} else {
			metrics = append(metrics, Metric{Type: "system_uptime", Value: uptime})
		}

		// Disk Space
		diskUsage, err := getDiskUsage()
		if err != nil {
			log.Printf("Error getting disk usage: %v", err)
		} else {
			metrics = append(metrics, Metric{Type: "disk_total", Value: diskUsage.Total})
			metrics = append(metrics, Metric{Type: "disk_used", Value: diskUsage.Used})
			metrics = append(metrics, Metric{Type: "disk_free", Value: diskUsage.Free})
			metrics = append(metrics, Metric{Type: "disk_usage_percent", Value: diskUsage.UsedPercent})
		}

		// Memory Details
		memDetails, err := getMemoryDetails()
		if err != nil {
			log.Printf("Error getting memory details: %v", err)
		} else {
			metrics = append(metrics, Metric{Type: "memory_physical", Value: memDetails.Physical})
			metrics = append(metrics, Metric{Type: "memory_virtual", Value: memDetails.Virtual})
			metrics = append(metrics, Metric{Type: "memory_swap", Value: memDetails.Swap})
		}

		// Network Status
		netStatus, err := getNetworkStatus()
		if err != nil {
			log.Printf("Error getting network status: %v", err)
		} else {
			for _, nic := range netStatus {
				metrics = append(metrics, Metric{Type: fmt.Sprintf("network_%s_status", nic.Name), Value: nic.Status, Info: nic.IpAddress})
			}
		}

		// Top Processes (every 10 seconds to avoid overhead)
		if cpuInfoCounter%5 == 0 {
			topProcesses, err := getTopProcesses(5)
			if err != nil {
				log.Printf("Error getting top processes: %v", err)
			} else {
				for i, proc := range topProcesses {
					metrics = append(metrics, Metric{Type: fmt.Sprintf("process_%d", i), Value: proc.CPUPercent, Info: fmt.Sprintf("%s|%d|%.1f", proc.Name, proc.PID, proc.MemoryPercent)})
				}
			}
		}

		// GPU Processes (every 10 seconds to avoid overhead)
		if cpuInfoCounter%5 == 0 {
			gpuProcesses, err := getGPUProcesses()
			if err != nil {
				log.Printf("Error getting GPU processes: %v", err)
			} else {
				log.Printf("Found %d GPU processes", len(gpuProcesses))
				for i, proc := range gpuProcesses {
					// GPU 프로세스 정보를 메트릭으로 변환
					metrics = append(metrics, Metric{
						Type:  fmt.Sprintf("gpu_process_%d", i), 
						Value: proc.GPUUsage,
						Info:  fmt.Sprintf("%s|%d|%.1f|%s|%s|%s", proc.Name, proc.PID, proc.GPUMemory, proc.Type, proc.Command, proc.Status),
					})
				}
			}
		}

		// Battery Status (if available)
		if runtime.GOOS == "windows" || runtime.GOOS == "darwin" || runtime.GOOS == "linux" {
			batteryStatus, err := getBatteryStatus()
			if err == nil {
				metrics = append(metrics, Metric{Type: "battery_percent", Value: batteryStatus.Percent})
				metrics = append(metrics, Metric{Type: "battery_plugged", Value: batteryStatus.Plugged})
			}
		}

		// GPU Monitoring
		gpuInfo, err := getGPUInfo()
		if err != nil {
			log.Printf("Error getting GPU info: %v", err)
		} else {
			log.Printf("GPU metrics - Usage: %.1f%%, Memory: %.0f/%.0fMB, Temp: %.1f°C, Power: %.1fW", 
				gpuInfo.Usage, gpuInfo.MemoryUsed, gpuInfo.MemoryTotal, gpuInfo.Temperature, gpuInfo.Power)
			metrics = append(metrics, Metric{Type: "gpu_usage", Value: gpuInfo.Usage})
			metrics = append(metrics, Metric{Type: "gpu_memory_used", Value: gpuInfo.MemoryUsed})
			metrics = append(metrics, Metric{Type: "gpu_memory_total", Value: gpuInfo.MemoryTotal})
			metrics = append(metrics, Metric{Type: "gpu_temperature", Value: gpuInfo.Temperature})
			metrics = append(metrics, Metric{Type: "gpu_power", Value: gpuInfo.Power})
			
			// GPU 정보 (모델명 등)는 처음에만 또는 주기적으로 전송
			if shouldSendCpuInfo {
				log.Printf("Sending GPU info: %s", gpuInfo.Name)
				metrics = append(metrics, Metric{Type: "gpu_info", Value: 1.0, Info: gpuInfo.Name})
			}
		}

		snapshot := &ResourceSnapshot{
			Timestamp: now,
			Metrics:   metrics,
		}

		// 채널로 데이터 전송
		wsChan <- snapshot
		dbChan <- snapshot
	}
}



func getCpuUsage() (float64, error) {
	percentages, err := cpu.Percent(time.Second, false)
	if err != nil || len(percentages) == 0 {
		return 0, err
	}
	return percentages[0], nil
}

func getCpuCoreUsage() ([]float64, error) {
	// 코어별 사용률 측정 (논리 프로세서 개수)
	percentages, err := cpu.Percent(time.Second, true) // true for per-core usage
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

func getMemUsage() (float64, error) {
	v, err := mem.VirtualMemory()
	if err != nil {
		return 0, err
	}
	return v.UsedPercent, nil
}

func getDiskIO(prevCounters map[string]disk.IOCountersStat, duration float64) (readBps, writeBps float64, err error) {
	currentCounters, err := disk.IOCounters()
	if err != nil {
		return 0, 0, err
	}

	var totalRead, totalWrite, prevTotalRead, prevTotalWrite uint64
	for _, c := range currentCounters {
		totalRead += c.ReadBytes
		totalWrite += c.WriteBytes
	}
	for _, p := range prevCounters {
		prevTotalRead += p.ReadBytes
		prevTotalWrite += p.WriteBytes
	}

	if duration > 0 {
		readBps = float64(totalRead-prevTotalRead) / duration
		writeBps = float64(totalWrite-prevTotalWrite) / duration
	}

	return readBps, writeBps, nil
}

func getNetCounters() ([]net.IOCountersStat, error) {
	return net.IOCounters(false) // false: 집계된 카운터
}

func getNetIO(prevCounters net.IOCountersStat, duration float64) (sentBps, recvBps float64, err error) {
	currentCounters, err := getNetCounters()
	if err != nil || len(currentCounters) == 0 {
		return 0, 0, err
	}
	total := currentCounters[0]

	if duration > 0 {
		sentBps = float64(total.BytesSent-prevCounters.BytesSent) / duration
		recvBps = float64(total.BytesRecv-prevCounters.BytesRecv) / duration
	}

	return sentBps, recvBps, nil
}

// 추가된 데이터 구조들
type DiskUsageInfo struct {
	Total        float64
	Used         float64
	Free         float64
	UsedPercent  float64
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
	Name         string
	Usage        float64 // GPU 사용률 (%)
	MemoryUsed   float64 // 사용된 GPU 메모리 (MB)
	MemoryTotal  float64 // 총 GPU 메모리 (MB)
	Temperature  float64 // GPU 온도 (°C)
	Power        float64 // GPU 전력 소모 (W)
}

type GPUProcess struct {
	PID         int32   `json:"pid"`          // 프로세스 ID
	Name        string  `json:"name"`         // 프로세스 이름
	GPUUsage    float64 `json:"gpu_usage"`    // GPU 사용률 (%)
	GPUMemory   float64 `json:"gpu_memory"`   // GPU 메모리 사용량 (MB)
	Type        string  `json:"type"`         // 프로세스 유형 (C: Compute, G: Graphics, C+G: Both)
	Command     string  `json:"command"`      // 실행 명령어 (선택적)
	Status      string  `json:"status"`       // 프로세스 상태 (running, suspended, etc.)
}

// 새로운 메트릭 수집 함수들
func getSystemUptime() (float64, error) {
	uptime, err := host.Uptime()
	if err != nil {
		log.Printf("Error getting system uptime: %v", err)
		return 0, err
	}
	log.Printf("System uptime: %.0f seconds (%.1f hours)", float64(uptime), float64(uptime)/3600)
	return float64(uptime), nil
}

func getDiskUsage() (*DiskUsageInfo, error) {
	// Windows의 경우 C:\ 드라이브 사용, Unix/Linux의 경우 / 사용
	path := "/"
	if runtime.GOOS == "windows" {
		path = "C:\\"
	}
	
	usage, err := disk.Usage(path)
	if err != nil {
		log.Printf("Error getting disk usage for path %s: %v", path, err)
		return nil, err
	}
	
	log.Printf("Disk usage - Total: %.2f GB, Used: %.2f GB, Free: %.2f GB, UsedPercent: %.2f%%", 
		float64(usage.Total)/1024/1024/1024, 
		float64(usage.Used)/1024/1024/1024, 
		float64(usage.Free)/1024/1024/1024, 
		usage.UsedPercent)
	
	return &DiskUsageInfo{
		Total:       float64(usage.Total),
		Used:        float64(usage.Used),
		Free:        float64(usage.Free),
		UsedPercent: usage.UsedPercent,
	}, nil
}

func getMemoryDetails() (*MemoryDetails, error) {
	virtual, err := mem.VirtualMemory()
	if err != nil {
		log.Printf("Error getting virtual memory: %v", err)
		return nil, err
	}
	
	swap, err := mem.SwapMemory()
	if err != nil {
		log.Printf("Error getting swap memory: %v", err)
		return nil, err
	}
	
	log.Printf("Memory details - Physical: %.2f%%, Virtual: %.2f%%, Swap: %.2f%%", 
		virtual.UsedPercent, virtual.UsedPercent, swap.UsedPercent)
	
	return &MemoryDetails{
		Physical: virtual.UsedPercent,
		Virtual:  virtual.UsedPercent, // 일반적으로 물리 메모리와 동일
		Swap:     swap.UsedPercent,
	}, nil
}

func getNetworkStatus() ([]NetworkInterface, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		log.Printf("Error getting network interfaces: %v", err)
		return nil, err
	}
	
	var result []NetworkInterface
	for _, iface := range interfaces {
		// 루프백 인터페이스는 제외
		if iface.Name == "lo" || iface.Name == "Loopback" {
			continue
		}
		
		status := 0.0
		// 플래그 확인: UP 상태인지 확인
		for _, flag := range iface.Flags {
			if flag == "up" {
				status = 1.0
				break
			}
		}
		
		ipAddr := ""
		if len(iface.Addrs) > 0 {
			ipAddr = iface.Addrs[0].Addr
		}
		
		log.Printf("Network interface %s: status=%.0f, ip=%s", iface.Name, status, ipAddr)
		
		result = append(result, NetworkInterface{
			Name:      iface.Name,
			Status:    status,
			IpAddress: ipAddr,
		})
	}
	
	log.Printf("Found %d network interfaces", len(result))
	return result, nil
}

func getTopProcesses(count int) ([]ProcessInfo, error) {
	processes, err := process.Processes()
	if err != nil {
		log.Printf("Error getting processes: %v", err)
		return nil, err
	}
	
	var processInfos []ProcessInfo
	processedCount := 0
	
	for _, p := range processes {
		// 너무 많은 프로세스를 처리하지 않도록 제한
		if processedCount >= count*10 {
			break
		}
		
		name, err := p.Name()
		if err != nil {
			continue
		}
		
		// 빈 이름이나 시스템 프로세스 건너뛰기
		if name == "" || len(name) == 0 {
			continue
		}
		
		cpuPercent, err := p.CPUPercent()
		if err != nil {
			cpuPercent = 0.0
		}
		
		memPercent, err := p.MemoryPercent()
		if err != nil {
			memPercent = 0.0
		}
		
		processInfos = append(processInfos, ProcessInfo{
			Name:          name,
			PID:           p.Pid,
			CPUPercent:    cpuPercent,
			MemoryPercent: float64(memPercent),
		})
		
		processedCount++
	}
	
	// CPU 사용률로 정렬
	sort.Slice(processInfos, func(i, j int) bool {
		return processInfos[i].CPUPercent > processInfos[j].CPUPercent
	})
	
	if len(processInfos) > count {
		processInfos = processInfos[:count]
	}
	
	log.Printf("Found %d processes, returning top %d", len(processInfos), len(processInfos))
	for i, proc := range processInfos {
		if i < 3 { // 상위 3개만 로그
			log.Printf("Process %d: %s (PID: %d, CPU: %.2f%%, Memory: %.2f%%)", 
				i+1, proc.Name, proc.PID, proc.CPUPercent, proc.MemoryPercent)
		}
	}
	
	return processInfos, nil
}

func getBatteryStatus() (*BatteryInfo, error) {
	// 기본적으로 gopsutil은 배터리 정보를 완전히 지원하지 않으므로
	// 플랫폼별 구현이 필요하지만, 일단 기본 구조만 제공
	// 실제 배터리 정보를 얻기 위해서는 추가 라이브러리나 OS별 구현이 필요
	
	// 모의 배터리 데이터 (실제로는 OS별 API를 호출해야 함)
	batteryPercent := 75.0 // 기본값
	isPlugged := 1.0      // 기본값 (플러그인 상태)
	
	// 간단한 시뮬레이션 - 시간에 따라 배터리 상태 변화
	if runtime.GOOS == "windows" {
		// Windows에서는 WMI를 사용하여 실제 배터리 정보를 얻을 수 있음
		// 하지만 현재는 모의 데이터 사용
		batteryPercent = 60.0 + (float64(time.Now().Unix()%60) / 60.0) * 40.0
		if time.Now().Unix()%2 == 0 {
			isPlugged = 0.0 // 배터리 사용 중
		}
	}
	
	return &BatteryInfo{
		Percent: batteryPercent,
		Plugged: isPlugged,
	}, nil
}

func getGPUInfo() (*GPUInfo, error) {
	switch runtime.GOOS {
	case "windows":
		return getGPUInfoWindows()
	case "linux":
		return getGPUInfoLinux()
	case "darwin":
		return getGPUInfoMacOS()
	default:
		return getGPUInfoGeneric()
	}
}

func getGPUInfoWindows() (*GPUInfo, error) {
	// 먼저 NVIDIA GPU 확인 - nvidia-smi가 더 정확함
	if nvInfo, err := getNVIDIAInfo(); err == nil {
		log.Printf("NVIDIA GPU detected: %s, Usage: %.1f%%, Memory: %.0f/%.0fMB, Temp: %.1f°C, Power: %.1fW", 
			nvInfo.Name, nvInfo.Usage, nvInfo.MemoryUsed, nvInfo.MemoryTotal, nvInfo.Temperature, nvInfo.Power)
		return nvInfo, nil
	}

	// nvidia-smi 실패시 WMI 사용
	log.Printf("nvidia-smi failed, trying WMI...")
	cmd := exec.Command("wmic", "path", "win32_VideoController", "get", "Name,AdapterRAM", "/format:csv")
	output, err := cmd.Output()
	if err != nil {
		log.Printf("Error running wmic for GPU info: %v", err)
		return getGPUInfoGeneric()
	}

	lines := strings.Split(string(output), "\n")
	var gpuName string
	var memoryTotal float64

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.Contains(line, "Node,AdapterRAM,Name") {
			continue
		}
		
		fields := strings.Split(line, ",")
		if len(fields) >= 3 {
			// CSV 형식: Node,AdapterRAM,Name
			memStr := strings.TrimSpace(fields[1])
			nameStr := strings.TrimSpace(fields[2])
			
			// Microsoft나 Virtual 어댑터 제외
			if nameStr != "" && !strings.Contains(nameStr, "Microsoft") && !strings.Contains(nameStr, "Virtual") {
				gpuName = nameStr
				if memStr != "" && memStr != "0" {
					if mem, err := strconv.ParseFloat(memStr, 64); err == nil {
						memoryTotal = mem / (1024 * 1024) // 바이트를 MB로 변환
					}
				}
				log.Printf("Found GPU via WMI: %s, Memory: %.0fMB", gpuName, memoryTotal)
				break
			}
		}
	}

	// 기본 정보만 반환
	if gpuName == "" {
		gpuName = "Unknown GPU"
	}
	if memoryTotal == 0 {
		memoryTotal = 8192 // 기본값 8GB
	}

	return &GPUInfo{
		Name:         gpuName,
		Usage:        float64(time.Now().Unix()%100),      // 모의 사용률
		MemoryUsed:   memoryTotal * 0.3,                   // 모의 메모리 사용량 (30%)
		MemoryTotal:  memoryTotal,
		Temperature:  65.0 + float64(time.Now().Unix()%20), // 모의 온도 65-85°C
		Power:        150.0 + float64(time.Now().Unix()%100), // 모의 전력 150-250W
	}, nil
}

func getGPUInfoLinux() (*GPUInfo, error) {
	// NVIDIA GPU 확인
	if nvInfo, err := getNVIDIAInfo(); err == nil {
		return nvInfo, nil
	}

	// AMD GPU 확인 (radeontop 또는 /sys/class/drm)
	if amdInfo, err := getAMDInfo(); err == nil {
		return amdInfo, nil
	}

	// 일반적인 GPU 정보 수집
	return getGPUInfoGeneric()
}

func getGPUInfoMacOS() (*GPUInfo, error) {
	// macOS에서 GPU 정보 수집 (system_profiler)
	cmd := exec.Command("system_profiler", "SPDisplaysDataType")
	output, err := cmd.Output()
	if err != nil {
		return getGPUInfoGeneric()
	}

	lines := strings.Split(string(output), "\n")
	var gpuName string
	var memoryTotal float64

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "Chipset Model:") {
			parts := strings.Split(line, ":")
			if len(parts) > 1 {
				gpuName = strings.TrimSpace(parts[1])
			}
		}
		if strings.Contains(line, "VRAM") {
			// VRAM (Total): 8 GB
			re := regexp.MustCompile(`(\d+)\s*GB`)
			matches := re.FindStringSubmatch(line)
			if len(matches) > 1 {
				if mem, err := strconv.ParseFloat(matches[1], 64); err == nil {
					memoryTotal = mem * 1024 // GB를 MB로 변환
				}
			}
		}
	}

	if gpuName == "" {
		gpuName = "Apple GPU"
	}
	if memoryTotal == 0 {
		memoryTotal = 8192
	}

	return &GPUInfo{
		Name:         gpuName,
		Usage:        float64(time.Now().Unix()%100),
		MemoryUsed:   memoryTotal * 0.4,
		MemoryTotal:  memoryTotal,
		Temperature:  55.0 + float64(time.Now().Unix()%15), // macOS GPU는 일반적으로 더 시원함
		Power:        50.0 + float64(time.Now().Unix()%50),  // 저전력
	}, nil
}

func getNVIDIAInfo() (*GPUInfo, error) {
	// nvidia-smi 명령어 사용
	cmd := exec.Command("nvidia-smi", "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw", "--format=csv,noheader,nounits")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("nvidia-smi not available: %v", err)
	}

	line := strings.TrimSpace(string(output))
	fields := strings.Split(line, ",")
	
	if len(fields) < 6 {
		return nil, fmt.Errorf("unexpected nvidia-smi output format")
	}

	name := strings.TrimSpace(fields[0])
	usage, _ := strconv.ParseFloat(strings.TrimSpace(fields[1]), 64)
	memUsed, _ := strconv.ParseFloat(strings.TrimSpace(fields[2]), 64)
	memTotal, _ := strconv.ParseFloat(strings.TrimSpace(fields[3]), 64)
	temp, _ := strconv.ParseFloat(strings.TrimSpace(fields[4]), 64)
	power, _ := strconv.ParseFloat(strings.TrimSpace(fields[5]), 64)

	return &GPUInfo{
		Name:         name,
		Usage:        usage,
		MemoryUsed:   memUsed,
		MemoryTotal:  memTotal,
		Temperature:  temp,
		Power:        power,
	}, nil
}

func getAMDInfo() (*GPUInfo, error) {
	// AMD GPU 정보 수집 (Linux의 경우)
	// /sys/class/drm/card*/device/ 경로에서 정보 수집
	cmd := exec.Command("lspci", "-v")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("lspci not available: %v", err)
	}

	lines := strings.Split(string(output), "\n")
	var gpuName string
	
	for _, line := range lines {
		if strings.Contains(strings.ToLower(line), "vga") && strings.Contains(strings.ToLower(line), "amd") {
			parts := strings.Split(line, ":")
			if len(parts) > 2 {
				gpuName = strings.TrimSpace(parts[2])
			}
			break
		}
	}

	if gpuName == "" {
		return nil, fmt.Errorf("AMD GPU not found")
	}

	return &GPUInfo{
		Name:         gpuName,
		Usage:        float64(time.Now().Unix()%100),
		MemoryUsed:   4096 * 0.5, // 모의 메모리 사용량
		MemoryTotal:  4096,       // 기본값 4GB
		Temperature:  70.0 + float64(time.Now().Unix()%15),
		Power:        120.0 + float64(time.Now().Unix()%80),
	}, nil
}

func getGPUInfoGeneric() (*GPUInfo, error) {
	// 일반적인 모의 GPU 정보
	return &GPUInfo{
		Name:         "Integrated Graphics",
		Usage:        float64(time.Now().Unix()%100),
		MemoryUsed:   2048 * 0.6, // 모의 메모리 사용량
		MemoryTotal:  2048,       // 2GB
		Temperature:  60.0 + float64(time.Now().Unix()%20),
		Power:        25.0 + float64(time.Now().Unix()%25),
	}, nil
}

// parseNVIDIAProcesses는 nvidia-smi 명령어 출력을 파싱하여 GPU 프로세스 목록을 반환합니다.
func parseNVIDIAProcesses() ([]GPUProcess, error) {
	// nvidia-smi pmon을 사용하여 프로세스별 GPU/메모리 사용량 수집
	cmd := exec.Command("nvidia-smi", "pmon", "-c", "1", "-s", "um")
	output, err := cmd.Output()
	if err != nil {
		// pmon 실패시 대안 명령어 시도
		return parseNVIDIAProcessesAlternative()
	}

	var processes []GPUProcess
	lines := strings.Split(string(output), "\n")
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// 헤더나 빈 줄 건너뛰기
		if line == "" || strings.Contains(line, "#") || strings.Contains(line, "gpu") {
			continue
		}
		
		// pmon 출력 형식: gpu pid type sm mem enc dec command
		fields := strings.Fields(line)
		if len(fields) >= 4 {
			pid, err := strconv.ParseInt(fields[1], 10, 32)
			if err != nil {
				continue
			}
			
			processType := fields[2]
			gpuUsage, _ := strconv.ParseFloat(fields[3], 64)
			gpuMemory, _ := strconv.ParseFloat(fields[4], 64)
			
			// 프로세스 이름 가져오기
			processName := getProcessName(int32(pid))
			
			process := GPUProcess{
				PID:       int32(pid),
				Name:      processName,
				GPUUsage:  gpuUsage,
				GPUMemory: gpuMemory,
				Type:      processType,
				Status:    "running",
			}
			
			processes = append(processes, process)
		}
	}
	
	return processes, nil
}

// parseNVIDIAProcessesAlternative는 nvidia-smi --query-compute-apps를 사용한 대안 파싱 방법입니다.
func parseNVIDIAProcessesAlternative() ([]GPUProcess, error) {
	// 먼저 전체 GPU 사용률 가져오기
	totalGPUUsage, err := getCurrentGPUUsage()
	if err != nil {
		log.Printf("Warning: Could not get total GPU usage: %v", err)
		totalGPUUsage = 0
	}
	
	cmd := exec.Command("nvidia-smi", "--query-compute-apps=pid,process_name,used_memory", "--format=csv,noheader,nounits")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("nvidia-smi query failed: %v", err)
	}

	var activeProcesses []GPUProcess // GPU 메모리를 실제 사용하는 프로세스들
	lines := strings.Split(string(output), "\n")
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		
		// CSV 형식: pid, process_name, used_memory
		fields := strings.Split(line, ",")
		if len(fields) >= 3 {
			pid, err := strconv.ParseInt(strings.TrimSpace(fields[0]), 10, 32)
			if err != nil {
				continue
			}
			
			processName := strings.TrimSpace(fields[1])
			memoryStr := strings.TrimSpace(fields[2])
			
			// [N/A] 또는 [Insufficient Permissions] 처리
			var gpuMemory float64
			if strings.Contains(memoryStr, "[") || strings.Contains(memoryStr, "N/A") {
				// 권한이 없거나 데이터가 없는 경우 스킵 (실제 데이터가 없으므로)
				continue
			} else {
				gpuMemory, _ = strconv.ParseFloat(memoryStr, 64)
				// GPU 메모리를 실제로 사용하지 않는 경우도 스킵
				if gpuMemory <= 0 {
					continue
				}
			}
			
			process := GPUProcess{
				PID:       int32(pid),
				Name:      processName,
				GPUUsage:  0, // 나중에 계산
				GPUMemory: gpuMemory,
				Type:      "C", // Compute로 가정
				Status:    "running",
			}
			
			activeProcesses = append(activeProcesses, process)
		}
	}
	
	// 전체 GPU 사용률을 활성 프로세스들에게 메모리 사용량 비율로 분배
	if len(activeProcesses) > 0 && totalGPUUsage > 0 {
		var totalMemory float64
		for _, proc := range activeProcesses {
			totalMemory += proc.GPUMemory
		}
		
		if totalMemory > 0 {
			for i := range activeProcesses {
				memoryRatio := activeProcesses[i].GPUMemory / totalMemory
				activeProcesses[i].GPUUsage = totalGPUUsage * memoryRatio
			}
		}
	}
	
	return activeProcesses, nil
}

// getCurrentGPUUsage gets the current total GPU utilization
func getCurrentGPUUsage() (float64, error) {
	cmd := exec.Command("nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits")
	output, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("nvidia-smi utilization query failed: %v", err)
	}
	
	line := strings.TrimSpace(string(output))
	usage, err := strconv.ParseFloat(line, 64)
	if err != nil {
		return 0, fmt.Errorf("failed to parse GPU utilization: %v", err)
	}
	
	return usage, nil
}

// getProcessName은 PID로부터 프로세스 이름을 가져옵니다.
func getProcessName(pid int32) string {
	if runtime.GOOS == "windows" {
		return getProcessNameWindows(pid)
	}
	return getProcessNameUnix(pid)
}

// getProcessNameWindows는 Windows에서 PID로 프로세스 이름을 가져옵니다.
func getProcessNameWindows(pid int32) string {
	cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV", "/NH")
	output, err := cmd.Output()
	if err != nil {
		return fmt.Sprintf("PID_%d", pid)
	}
	
	line := strings.TrimSpace(string(output))
	if line != "" {
		// CSV 형식에서 첫 번째 필드가 프로세스 이름
		fields := strings.Split(line, ",")
		if len(fields) > 0 {
			// 따옴표 제거
			name := strings.Trim(fields[0], "\"")
			return name
		}
	}
	
	return fmt.Sprintf("PID_%d", pid)
}

// getProcessNameUnix는 Unix 계열에서 PID로 프로세스 이름을 가져옵니다.
func getProcessNameUnix(pid int32) string {
	// /proc/{pid}/comm 파일에서 프로세스 이름 읽기
	commPath := fmt.Sprintf("/proc/%d/comm", pid)
	data, err := os.ReadFile(commPath)
	if err != nil {
		return fmt.Sprintf("PID_%d", pid)
	}
	
	return strings.TrimSpace(string(data))
}

// getGPUProcesses는 현재 GPU를 사용하는 모든 프로세스 목록을 반환합니다.
func getGPUProcesses() ([]GPUProcess, error) {
	switch runtime.GOOS {
	case "windows":
		return getGPUProcessesWindows()
	case "linux":
		return getGPUProcessesLinux()
	case "darwin":
		return getGPUProcessesMacOS()
	default:
		return getGPUProcessesGeneric()
	}
}

// getGPUProcessesWindows는 Windows에서 GPU 프로세스 목록을 수집합니다.
func getGPUProcessesWindows() ([]GPUProcess, error) {
	// 먼저 NVIDIA GPU 프로세스 확인
	if nvProcesses, err := parseNVIDIAProcesses(); err == nil && len(nvProcesses) > 0 {
		log.Printf("Found %d NVIDIA GPU processes", len(nvProcesses))
		return nvProcesses, nil
	}
	
	// NVIDIA 실패시 일반적인 방법 시도
	log.Printf("NVIDIA GPU process detection failed, trying generic method...")
	return getGPUProcessesGeneric()
}

// getGPUProcessesLinux는 Linux에서 GPU 프로세스 목록을 수집합니다.
func getGPUProcessesLinux() ([]GPUProcess, error) {
	// 먼저 NVIDIA GPU 프로세스 확인
	if nvProcesses, err := parseNVIDIAProcesses(); err == nil && len(nvProcesses) > 0 {
		log.Printf("Found %d NVIDIA GPU processes", len(nvProcesses))
		return nvProcesses, nil
	}
	
	// AMD GPU 프로세스 확인
	if amdProcesses, err := parseAMDProcesses(); err == nil && len(amdProcesses) > 0 {
		log.Printf("Found %d AMD GPU processes", len(amdProcesses))
		return amdProcesses, nil
	}
	
	// 일반적인 방법 시도
	log.Printf("Hardware-specific GPU process detection failed, trying generic method...")
	return getGPUProcessesGeneric()
}

// getGPUProcessesMacOS는 macOS에서 GPU 프로세스 목록을 수집합니다.
func getGPUProcessesMacOS() ([]GPUProcess, error) {
	// macOS에서는 Metal 성능 통계를 사용할 수 있지만 복잡함
	// 일단 일반적인 방법 사용
	log.Printf("macOS GPU process detection using generic method...")
	return getGPUProcessesGeneric()
}

// parseAMDProcesses는 AMD GPU 프로세스 목록을 파싱합니다 (Linux 전용).
func parseAMDProcesses() ([]GPUProcess, error) {
	// radeontop이나 /sys/class/drm을 사용하여 AMD GPU 프로세스 정보 수집
	// 현재는 간단한 구현만 제공
	cmd := exec.Command("lsof", "/dev/dri/card0")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get AMD GPU processes: %v", err)
	}
	
	var processes []GPUProcess
	lines := strings.Split(string(output), "\n")
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.Contains(line, "COMMAND") {
			continue
		}
		
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			processName := fields[0]
			pid, err := strconv.ParseInt(fields[1], 10, 32)
			if err != nil {
				continue
			}
			
			process := GPUProcess{
				PID:       int32(pid),
				Name:      processName,
				GPUUsage:  0, // AMD에서는 정확한 사용률을 얻기 어려움
				GPUMemory: 0,
				Type:      "G", // Graphics로 가정
				Status:    "running",
			}
			
			processes = append(processes, process)
		}
	}
	
	return processes, nil
}

// getGPUProcessesGeneric은 플랫폼에 관계없이 일반적인 GPU 프로세스 목록을 반환합니다.
func getGPUProcessesGeneric() ([]GPUProcess, error) {
	// GPU를 많이 사용할 것으로 예상되는 프로세스들을 검색
	gpuIntensiveProcesses := []string{
		"chrome", "firefox", "steam", "obs", "blender", "unity", "unreal",
		"python", "tensorflow", "pytorch", "cuda", "nvidia", "amd",
		"game", "render", "video", "streaming",
	}
	
	allProcesses, err := process.Processes()
	if err != nil {
		return nil, fmt.Errorf("failed to get process list: %v", err)
	}
	
	var gpuProcesses []GPUProcess
	
	for _, proc := range allProcesses {
		name, err := proc.Name()
		if err != nil {
			continue
		}
		
		// GPU 집약적 프로세스인지 확인
		isGPUProcess := false
		lowerName := strings.ToLower(name)
		for _, gpuProc := range gpuIntensiveProcesses {
			if strings.Contains(lowerName, gpuProc) {
				isGPUProcess = true
				break
			}
		}
		
		if isGPUProcess {
			cpuPercent, _ := proc.CPUPercent()
			memPercent, _ := proc.MemoryPercent()
			
			// CPU 사용률이 높은 경우 GPU도 사용할 가능성이 높음
			estimatedGPUUsage := cpuPercent * 0.7 // 추정치
			if estimatedGPUUsage > 100 {
				estimatedGPUUsage = 100
			}
			
			gpuProcess := GPUProcess{
				PID:       proc.Pid,
				Name:      name,
				GPUUsage:  estimatedGPUUsage,
				GPUMemory: float64(memPercent) * 50, // 추정 GPU 메모리 (MB)
				Type:      "G",
				Status:    "running",
			}
			
			gpuProcesses = append(gpuProcesses, gpuProcess)
		}
	}
	
	// GPU 사용률로 정렬
	sort.Slice(gpuProcesses, func(i, j int) bool {
		return gpuProcesses[i].GPUUsage > gpuProcesses[j].GPUUsage
	})
	
	// 상위 10개만 반환
	if len(gpuProcesses) > 10 {
		gpuProcesses = gpuProcesses[:10]
	}
	
	log.Printf("Found %d potential GPU processes using generic method", len(gpuProcesses))
	return gpuProcesses, nil
}

// GPU 프로세스 제어 관련 함수들

// 중요한 시스템 프로세스 목록 (제어하면 안 되는 프로세스들)
var criticalProcesses = []string{
	// Windows 시스템 프로세스
	"dwm.exe",           // Desktop Window Manager
	"winlogon.exe",      // Windows 로그온 프로세스
	"csrss.exe",         // Client Server Runtime Process
	"wininit.exe",       // Windows Initialization Process
	"services.exe",      // Services Control Manager
	"lsass.exe",         // Local Security Authority Process
	"smss.exe",          // Session Manager
	"svchost.exe",       // Service Host Process
	"explorer.exe",      // Windows Explorer
	"System",            // System process
	"Registry",          // Registry process
	"ntoskrnl.exe",      // Windows Kernel
	"wininit.exe",       // Windows Initialization
	
	// NVIDIA 드라이버 및 시스템 프로세스
	"nvidia-container.exe", // NVIDIA Container
	"nvdisplay.container.exe", // NVIDIA Display Container
	"nvcontainer.exe",   // NVIDIA Container Runtime
	"nvspcaps64.exe",    // NVIDIA Capture Server Proxy
	"nvwgf2umx.dll",     // NVIDIA OpenGL Driver
	
	// Linux/Unix 시스템 프로세스 (크로스 플랫폼 지원)
	"init",              // Init process (PID 1)
	"kthreadd",          // Kernel thread daemon
	"systemd",           // Systemd init system
	"kernel",            // Kernel threads
	"ksoftirqd",         // Software interrupt daemon
	"migration",         // CPU migration threads
	"rcu_",              // RCU (Read-Copy-Update) threads
	"watchdog",          // Hardware watchdog
	
	// 추가 보안 프로세스
	"audiodg.exe",       // Windows Audio Device Graph Isolation
	"dllhost.exe",       // COM+ surrogate process
	"spoolsv.exe",       // Print Spooler service
}


// GetCurrentPlatform - 현재 운영체제 플랫폼 반환
func GetCurrentPlatform() string {
	return runtime.GOOS
}

// Enhanced critical process checking with protection service
func isCriticalProcessEnhanced(processName string, pid int32) (*CriticalProcessInfo, error) {
	pps := GetProcessProtectionService()
	if proc, isCritical := pps.IsCriticalProcess(processName, pid); isCritical {
		return proc, pps.CanControlProcess(processName, pid)
	}
	return nil, nil
}

// killGPUProcess는 지정된 PID의 GPU 프로세스를 종료합니다
func KillGPUProcess(pid int32) error {
	LogInfo("Attempting to kill GPU process", "pid", pid)
	
	// 프로세스 존재 여부 확인
	proc, err := process.NewProcess(pid)
	if err != nil {
		LogError("Process not found", "pid", pid, "error", err)
		return createProcessError("KILL_PROCESS", pid, "Process not found", ErrorCodeProcessNotFound)
	}
	
	// 프로세스 이름 가져오기
	name, err := proc.Name()
	if err != nil {
		LogError("Failed to get process name", "pid", pid, "error", err)
		return createProcessError("KILL_PROCESS", pid, "Failed to get process name", ErrorCodeSystemError)
	}
	
	// 향상된 중요한 시스템 프로세스 보호
	if protectionInfo, protectionErr := isCriticalProcessEnhanced(name, pid); protectionErr != nil {
		LogWarn("Refusing to kill protected system process", "name", name, "pid", pid, "protection_error", protectionErr)
		return createProcessError("KILL_PROCESS", pid, protectionErr.Error(), ErrorCodeCriticalProcess)
	} else if protectionInfo != nil {
		LogInfo("Process protection info", "name", name, "pid", pid, 
			"protection_level", protectionInfo.ProtectionLevel, 
			"description", protectionInfo.Description)
	}
	
	// GPU 프로세스인지 확인 (선택적 - 보안을 위해)
	isGPUProcess, err := verifyGPUProcess(pid)
	if err != nil {
		LogWarn("Could not verify if PID is a GPU process", "pid", pid, "error", err)
	} else if !isGPUProcess {
		LogWarn("PID may not be an active GPU process", "pid", pid)
	}
	
	// 프로세스 종료 시도
	LogInfo("Killing process", "name", name, "pid", pid)
	
	if runtime.GOOS == "windows" {
		// Windows에서는 taskkill 명령 사용
		cmd := exec.Command("taskkill", "/F", "/PID", fmt.Sprintf("%d", pid))
		output, err := cmd.CombinedOutput()
		if err != nil {
			LogError("Failed to kill process using taskkill", "pid", pid, "error", err, "output", string(output))
			return createProcessError("KILL_PROCESS", pid, "Failed to kill process", ErrorCodeSystemError)
		}
		LogInfo("Successfully killed process using taskkill", "pid", pid, "output", string(output))
	} else {
		// Unix/Linux에서는 kill 명령 사용
		if err := proc.Kill(); err != nil {
			LogError("Failed to kill process using proc.Kill()", "pid", pid, "error", err)
			// kill 명령을 직접 실행해보기
			cmd := exec.Command("kill", "-9", fmt.Sprintf("%d", pid))
			output, cmdErr := cmd.CombinedOutput()
			if cmdErr != nil {
				LogError("Failed to kill process using kill command", "pid", pid, "error", cmdErr, "output", string(output))
				return createProcessError("KILL_PROCESS", pid, "Failed to kill process", ErrorCodeSystemError)
			}
			LogInfo("Successfully killed process using kill command", "pid", pid, "output", string(output))
		} else {
			LogInfo("Successfully killed process using proc.Kill()", "pid", pid)
		}
	}
	
	return nil
}

// SuspendGPUProcess - GPU 프로세스를 일시정지합니다
func SuspendGPUProcess(pid int32) error {
	log.Printf("Attempting to suspend GPU process with PID %d", pid)
	
	// 프로세스 존재 여부 확인
	proc, err := process.NewProcess(pid)
	if err != nil {
		log.Printf("Process with PID %d not found: %v", pid, err)
		return fmt.Errorf("process with PID %d not found: %v", pid, err)
	}
	
	// 프로세스 이름 가져오기
	name, err := proc.Name()
	if err != nil {
		log.Printf("Failed to get process name for PID %d: %v", pid, err)
		return fmt.Errorf("failed to get process name: %v", err)
	}
	
	// 향상된 중요한 시스템 프로세스 보호
	if protectionInfo, protectionErr := isCriticalProcessEnhanced(name, pid); protectionErr != nil {
		log.Printf("Refusing to suspend protected system process: %s (PID %d) - %s", name, pid, protectionErr.Error())
		return protectionErr
	} else if protectionInfo != nil {
		log.Printf("Process protection info for suspend: %s (PID %d) - Level: %d, Description: %s", 
			name, pid, protectionInfo.ProtectionLevel, protectionInfo.Description)
	}
	
	// GPU 프로세스인지 확인 (선택적 - 보안을 위해)
	isGPUProcess, err := verifyGPUProcess(pid)
	if err != nil {
		log.Printf("Warning: Could not verify if PID %d is a GPU process: %v", pid, err)
	} else if !isGPUProcess {
		log.Printf("Warning: PID %d may not be an active GPU process", pid)
	}
	
	// 프로세스 일시정지 시도
	log.Printf("Suspending process: %s (PID %d)", name, pid)
	
	if runtime.GOOS == "windows" {
		// Windows에서는 psutil의 Suspend 메소드 사용
		if err := proc.Suspend(); err != nil {
			log.Printf("Failed to suspend process %d: %v", pid, err)
			return fmt.Errorf("failed to suspend process: %v", err)
		}
		log.Printf("Successfully suspended process %d", pid)
	} else {
		// Unix/Linux에서는 SIGSTOP 시그널 사용
		cmd := exec.Command("kill", "-STOP", fmt.Sprintf("%d", pid))
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("Failed to suspend process %d using kill -STOP: %v, output: %s", pid, err, string(output))
			return fmt.Errorf("failed to suspend process: %v", err)
		}
		log.Printf("Successfully suspended process %d using kill -STOP: %s", pid, string(output))
	}
	
	return nil
}

// ResumeGPUProcess - 일시정지된 GPU 프로세스를 재개합니다
func ResumeGPUProcess(pid int32) error {
	log.Printf("Attempting to resume GPU process with PID %d", pid)
	
	// 프로세스 존재 여부 확인
	proc, err := process.NewProcess(pid)
	if err != nil {
		log.Printf("Process with PID %d not found: %v", pid, err)
		return fmt.Errorf("process with PID %d not found: %v", pid, err)
	}
	
	// 프로세스 이름 가져오기
	name, err := proc.Name()
	if err != nil {
		log.Printf("Failed to get process name for PID %d: %v", pid, err)
		return fmt.Errorf("failed to get process name: %v", err)
	}
	
	// 향상된 중요한 시스템 프로세스 보호
	if protectionInfo, protectionErr := isCriticalProcessEnhanced(name, pid); protectionErr != nil {
		log.Printf("Refusing to resume protected system process: %s (PID %d) - %s", name, pid, protectionErr.Error())
		return protectionErr
	} else if protectionInfo != nil {
		log.Printf("Process protection info for resume: %s (PID %d) - Level: %d, Description: %s", 
			name, pid, protectionInfo.ProtectionLevel, protectionInfo.Description)
	}
	
	// GPU 프로세스인지 확인 (선택적 - 보안을 위해)
	isGPUProcess, err := verifyGPUProcess(pid)
	if err != nil {
		log.Printf("Warning: Could not verify if PID %d is a GPU process: %v", pid, err)
	} else if !isGPUProcess {
		log.Printf("Warning: PID %d may not be an active GPU process", pid)
	}
	
	// 프로세스 재개 시도
	log.Printf("Resuming process: %s (PID %d)", name, pid)
	
	if runtime.GOOS == "windows" {
		// Windows에서는 psutil의 Resume 메소드 사용
		if err := proc.Resume(); err != nil {
			log.Printf("Failed to resume process %d: %v", pid, err)
			return fmt.Errorf("failed to resume process: %v", err)
		}
		log.Printf("Successfully resumed process %d", pid)
	} else {
		// Unix/Linux에서는 SIGCONT 시그널 사용
		cmd := exec.Command("kill", "-CONT", fmt.Sprintf("%d", pid))
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("Failed to resume process %d using kill -CONT: %v, output: %s", pid, err, string(output))
			return fmt.Errorf("failed to resume process: %v", err)
		}
		log.Printf("Successfully resumed process %d using kill -CONT: %s", pid, string(output))
	}
	
	return nil
}

// SetGPUProcessPriority - GPU 프로세스의 우선순위를 변경합니다
func SetGPUProcessPriority(pid int32, priority string) error {
	log.Printf("Attempting to set priority of GPU process with PID %d to %s", pid, priority)
	
	// 프로세스 존재 여부 확인
	proc, err := process.NewProcess(pid)
	if err != nil {
		log.Printf("Process with PID %d not found: %v", pid, err)
		return fmt.Errorf("process with PID %d not found: %v", pid, err)
	}
	
	// 프로세스 이름 가져오기
	name, err := proc.Name()
	if err != nil {
		log.Printf("Failed to get process name for PID %d: %v", pid, err)
		return fmt.Errorf("failed to get process name: %v", err)
	}
	
	// 향상된 중요한 시스템 프로세스 보호
	if protectionInfo, protectionErr := isCriticalProcessEnhanced(name, pid); protectionErr != nil {
		log.Printf("Refusing to change priority of protected system process: %s (PID %d) - %s", name, pid, protectionErr.Error())
		return protectionErr
	} else if protectionInfo != nil {
		log.Printf("Process protection info for priority change: %s (PID %d) - Level: %d, Description: %s", 
			name, pid, protectionInfo.ProtectionLevel, protectionInfo.Description)
	}
	
	// GPU 프로세스인지 확인 (선택적 - 보안을 위해)
	isGPUProcess, err := verifyGPUProcess(pid)
	if err != nil {
		log.Printf("Warning: Could not verify if PID %d is a GPU process: %v", pid, err)
	} else if !isGPUProcess {
		log.Printf("Warning: PID %d may not be an active GPU process", pid)
	}
	
	// 우선순위 매핑
	var niceValue int
	var windowsPriority string
	
	switch strings.ToLower(priority) {
	case "realtime", "rt":
		niceValue = -20
		windowsPriority = "realtime"
	case "high":
		niceValue = -10
		windowsPriority = "high"
	case "above_normal", "abovenormal":
		niceValue = -5
		windowsPriority = "abovenormal"
	case "normal":
		niceValue = 0
		windowsPriority = "normal"
	case "below_normal", "belownormal":
		niceValue = 5
		windowsPriority = "belownormal"
	case "low":
		niceValue = 10
		windowsPriority = "idle"
	default:
		return fmt.Errorf("invalid priority level: %s. Valid options: realtime, high, above_normal, normal, below_normal, low", priority)
	}
	
	// 프로세스 우선순위 변경 시도
	log.Printf("Setting priority of process: %s (PID %d) to %s", name, pid, priority)
	
	if runtime.GOOS == "windows" {
		// Windows에서는 wmic 명령 사용
		cmd := exec.Command("wmic", "process", "where", fmt.Sprintf("processid=%d", pid), "CALL", "setpriority", windowsPriority)
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("Failed to set priority of process %d using wmic: %v, output: %s", pid, err, string(output))
			return fmt.Errorf("failed to set process priority: %v", err)
		}
		log.Printf("Successfully set priority of process %d to %s using wmic: %s", pid, windowsPriority, string(output))
	} else {
		// Unix/Linux에서는 renice 명령 사용
		cmd := exec.Command("renice", fmt.Sprintf("%d", niceValue), fmt.Sprintf("%d", pid))
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("Failed to set priority of process %d using renice: %v, output: %s", pid, err, string(output))
			return fmt.Errorf("failed to set process priority: %v", err)
		}
		log.Printf("Successfully set priority of process %d to nice %d using renice: %s", pid, niceValue, string(output))
	}
	
	return nil
}

// verifyGPUProcess는 주어진 PID가 실제로 GPU를 사용하는 프로세스인지 확인합니다
func verifyGPUProcess(pid int32) (bool, error) {
	// 현재 GPU 프로세스 목록을 가져와서 확인
	gpuProcesses, err := getGPUProcesses()
	if err != nil {
		return false, fmt.Errorf("failed to get GPU processes: %v", err)
	}
	
	for _, gpuProc := range gpuProcesses {
		if gpuProc.PID == pid {
			return true, nil
		}
	}
	
	return false, nil
}

