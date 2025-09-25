package monitoring

import (
	"log"
)

// 모니터링을 위한 전역 변수
var (
	cpuInfoCounter int // CPU 정보 전송 카운터
)

// Start는 주기적으로 시스템 자원을 수집하여 채널로 전송하는 고루틴을 시작합니다.
// wsChan: WebSocket으로 실시간 전송하기 위한 채널
// dbChan: DB에 로그를 기록하기 위한 채널
// CPU 최적화 Phase 5.1: 무한 루프 완전 비활성화
func Start(wsChan chan<- *ResourceSnapshot, dbChan chan<- *ResourceSnapshot) {
	// CPU 소모를 방지하기 위해 모니터링 무한 루프 비활성화
	log.Println("CPU 최적화: 백그라운드 모니터링 시스템 완전 비활성화됨 (2초 ticker 제거)")
	return

	// 비활성화된 원본 코드 (CPU 소모 방지)
	/*
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
	*/
}
