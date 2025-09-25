package monitoring

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

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
