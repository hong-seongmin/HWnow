package monitoring

import (
	"fmt"
	"log"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

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
		Name:        gpuName,
		Usage:       float64(time.Now().Unix() % 100), // 모의 사용률
		MemoryUsed:  memoryTotal * 0.3,                // 모의 메모리 사용량 (30%)
		MemoryTotal: memoryTotal,
		Temperature: 65.0 + float64(time.Now().Unix()%20),   // 모의 온도 65-85°C
		Power:       150.0 + float64(time.Now().Unix()%100), // 모의 전력 150-250W
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
		Name:        gpuName,
		Usage:       float64(time.Now().Unix() % 100),
		MemoryUsed:  memoryTotal * 0.4,
		MemoryTotal: memoryTotal,
		Temperature: 55.0 + float64(time.Now().Unix()%15), // macOS GPU는 일반적으로 더 시원함
		Power:       50.0 + float64(time.Now().Unix()%50), // 저전력
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
		Name:        name,
		Usage:       usage,
		MemoryUsed:  memUsed,
		MemoryTotal: memTotal,
		Temperature: temp,
		Power:       power,
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
		Name:        gpuName,
		Usage:       float64(time.Now().Unix() % 100),
		MemoryUsed:  4096 * 0.5, // 모의 메모리 사용량
		MemoryTotal: 4096,       // 기본값 4GB
		Temperature: 70.0 + float64(time.Now().Unix()%15),
		Power:       120.0 + float64(time.Now().Unix()%80),
	}, nil
}

func getGPUInfoGeneric() (*GPUInfo, error) {
	// 일반적인 모의 GPU 정보
	return &GPUInfo{
		Name:        "Integrated Graphics",
		Usage:       float64(time.Now().Unix() % 100),
		MemoryUsed:  2048 * 0.6, // 모의 메모리 사용량
		MemoryTotal: 2048,       // 2GB
		Temperature: 60.0 + float64(time.Now().Unix()%20),
		Power:       25.0 + float64(time.Now().Unix()%25),
	}, nil
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
