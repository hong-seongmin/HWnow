package monitoring

import (
	"fmt"
	"github.com/shirou/gopsutil/v3/process"
	"log"
	"os/exec"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

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
