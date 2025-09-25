package monitoring

import (
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
	"log"
	"runtime"
	"sort"
	"time"
)

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
	isPlugged := 1.0       // 기본값 (플러그인 상태)

	// 간단한 시뮬레이션 - 시간에 따라 배터리 상태 변화
	if runtime.GOOS == "windows" {
		// Windows에서는 WMI를 사용하여 실제 배터리 정보를 얻을 수 있음
		// 하지만 현재는 모의 데이터 사용
		batteryPercent = 60.0 + (float64(time.Now().Unix()%60)/60.0)*40.0
		if time.Now().Unix()%2 == 0 {
			isPlugged = 0.0 // 배터리 사용 중
		}
	}

	return &BatteryInfo{
		Percent: batteryPercent,
		Plugged: isPlugged,
	}, nil
}
