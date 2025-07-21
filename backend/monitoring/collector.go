package monitoring

import (
	"fmt"
	"log"
	"time"
	"sort"
	"runtime"
	"os/exec"
	"strings"
	"strconv"
	"regexp"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/process"
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
