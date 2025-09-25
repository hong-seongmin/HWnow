package monitoring

import (
	"fmt"
	"github.com/shirou/gopsutil/v3/process"
	"log"
	"os/exec"
	"runtime"
	"strings"
)

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
