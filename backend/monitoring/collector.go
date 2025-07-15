package monitoring

import (
	"fmt"
	"log"
	"time"
	"sort"
	"runtime"

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

		// TODO: GPU 모니터링 추가 (외부 라이브러리 필요, e.g., NVML for NVIDIA)

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
