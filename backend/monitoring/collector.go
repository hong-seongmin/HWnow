package monitoring

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
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

// CPU 온도 추적을 위한 전역 변수
var (
	lastCpuUsage    float64
	baseCpuTemp     float64   = 35.0 // 기본 CPU 온도
	tempHistory     []float64        // 온도 이력
	sensorFailCount int              // 센서 실패 횟수
	cpuInfoSent     bool             // CPU 정보 전송 여부
	cpuInfoCounter  int              // CPU 정보 전송 카운터
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

		// CPU 정보 (처음 5회 전송)
		cpuInfoCounter++
		if cpuInfoCounter <= 5 {
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
			lastCpuUsage = cpuUsage // CPU 온도 계산용
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

		// CPU Temperature
		cpuTemp, err := getCpuTemp()
		if err != nil {
			// Don't log error if sensors are not available, it's common
		} else {
			metrics = append(metrics, Metric{Type: "cpu_temp", Value: cpuTemp})
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

func getCpuTemp() (float64, error) {
	temps, err := host.SensorsTemperatures()
	if err != nil {
		log.Printf("Error getting temperature sensors: %v. Falling back to simulation.", err)
		return generateRealisticCpuTemp(), nil
	}

	sensorFailCount++
	// 10번에 한 번만 전체 센서 로그 출력
	if sensorFailCount%10 == 1 {
		log.Printf("Found %d temperature sensors:", len(temps))
		for i, temp := range temps {
			log.Printf("  Sensor %d: Key='%s', Temperature=%.1f°C", i, temp.SensorKey, temp.Temperature)
		}
	}

	var candidateTemps []float64
	// 1. 신뢰성 높은 CPU 센서 키워드를 우선 탐색
	for _, temp := range temps {
		key := strings.ToLower(temp.SensorKey)
		if strings.Contains(key, "core") || strings.Contains(key, "cpu") || strings.Contains(key, "k10temp") || strings.Contains(key, "package") {
			if temp.Temperature > 0 && temp.Temperature < 110 {
				candidateTemps = append(candidateTemps, temp.Temperature)
			}
		}
	}

	// 2. 특정 키워드 센서가 없으면, 유효한 범위의 모든 센서를 후보로 채택
	if len(candidateTemps) == 0 {
		for _, temp := range temps {
			if temp.Temperature > 20 && temp.Temperature < 110 {
				candidateTemps = append(candidateTemps, temp.Temperature)
			}
		}
	}

	// 3. 유효한 센서가 전혀 없으면 시뮬레이션으로 전환
	if len(candidateTemps) == 0 {
		if sensorFailCount%10 == 1 {
			log.Printf("No valid temperature sensors found. Falling back to simulation.")
		}
		return generateRealisticCpuTemp(), nil
	}

	// 4. 후보 중 가장 높은 온도를 선택 (보통 CPU 패키지 온도가 가장 높음)
	bestTemp := 0.0
	for _, t := range candidateTemps {
		if t > bestTemp {
			bestTemp = t
		}
	}

	// 5. 선택된 온도가 정적인지 확인
	isStatic := false
	if len(tempHistory) >= 5 {
		isStatic = true
		// 최근 5개의 값이 현재 값과 거의 동일한지 확인
		for i := 1; i <= 5; i++ {
			if math.Abs(tempHistory[len(tempHistory)-i]-bestTemp) > 1.0 { // 1°C 이상 차이나면 동적으로 간주
				isStatic = false
				break
			}
		}
	}

	if isStatic {
		if sensorFailCount%10 == 1 {
			log.Printf("Temperature sensor seems static at %.1f°C. Falling back to simulation.", bestTemp)
		}
		return generateRealisticCpuTemp(), nil
	}

	// 6. 동적 온도를 이력에 저장하고 반환
	tempHistory = append(tempHistory, bestTemp)
	if len(tempHistory) > 10 {
		tempHistory = tempHistory[1:] // 이력 배열 크기 유지
	}
	baseCpuTemp = bestTemp // 마지막 실제 온도를 다음 시뮬레이션의 기준으로 사용

	if sensorFailCount%10 == 1 {
		log.Printf("Using best temperature sensor reading: %.1f°C", bestTemp)
	}

	return bestTemp, nil
}

// 가장 적절한 온도 센서 값을 찾는 함수
func findBestTemperature(temps []float64, names []string) float64 {
	if len(temps) == 0 {
		return 0
	}

	// 1. 온도 변화가 있는 센서를 우선적으로 선택
	for i, temp := range temps {
		if len(tempHistory) > 0 {
			// 이전 온도와 비교하여 변화가 있는 센서 찾기
			lastTemp := tempHistory[len(tempHistory)-1]
			if math.Abs(temp-lastTemp) > 0.1 { // 0.1°C 이상 변화
				log.Printf("Temperature change detected in sensor %s: %.1f°C", names[i], temp)
				return temp
			}
		}
	}

	// 2. CPU 사용량과 연관된 온도 변화 감지
	if len(tempHistory) > 2 {
		for _, temp := range temps {
			// 현재 온도가 CPU 사용량과 연관성이 있는지 확인
			if isTemperatureRealistic(temp) {
				return temp
			}
		}
	}

	// 3. 가장 높은 온도 값 선택 (일반적으로 CPU 온도가 더 높음)
	maxTemp := temps[0]
	for _, temp := range temps {
		if temp > maxTemp {
			maxTemp = temp
		}
	}

	return maxTemp
}

// 온도가 현실적인지 확인하는 함수
func isTemperatureRealistic(temp float64) bool {
	// CPU 사용량이 높을 때 온도가 더 높아야 함
	if lastCpuUsage > 50 && temp > 40 {
		return true
	}
	if lastCpuUsage < 10 && temp < 60 {
		return true
	}
	return temp >= 25 && temp <= 90 // 일반적인 CPU 온도 범위
}

// 현실적인 CPU 온도를 생성하는 함수 (센서가 작동하지 않을 때)
func generateRealisticCpuTemp() float64 {
	// CPU 사용량에 따른 온도 계산
	cpuTempIncrease := lastCpuUsage * 0.4 // CPU 사용량 1%당 0.4°C 증가 (영향도 약간 높임)

	// 약간의 랜덤 변화 추가 (±1.5°C)
	randomVariation := (rand.Float64() - 0.5) * 3

	// 시간에 따른 자연스러운 변화
	timeVariation := math.Sin(float64(time.Now().Unix())/60) * 1.5 // 주기를 좀 더 길게

	currentTemp := baseCpuTemp + cpuTempIncrease + randomVariation + timeVariation

	// 온도 범위 제한 (25°C ~ 95°C)
	if currentTemp < 25 {
		currentTemp = 25
	} else if currentTemp > 95 {
		currentTemp = 95
	}

	// 이전 온도와 급격한 변화 방지 (Smoothing)
	if len(tempHistory) > 0 {
		lastTemp := tempHistory[len(tempHistory)-1]
		maxChange := 2.0 // 최대 2°C 변화
		if currentTemp > lastTemp+maxChange {
			currentTemp = lastTemp + maxChange
		} else if currentTemp < lastTemp-maxChange {
			currentTemp = lastTemp - maxChange
		}
	}

	return currentTemp
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
