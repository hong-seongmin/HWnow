package services

import (
	"fmt"
	"strings"

	"HWnow-wails/internal/monitoring"
)

// GPUProcessControlResult represents the result of GPU process control operations
type GPUProcessControlResult struct {
	PID       int32  `json:"pid"`
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	Operation string `json:"operation"`
	Priority  string `json:"priority,omitempty"`
}

// GPUProcessValidationResult represents GPU process validation results
type GPUProcessValidationResult struct {
	PID       int32  `json:"pid"`
	IsValid   bool   `json:"is_valid"`
	Message   string `json:"message"`
	ProcessName string `json:"process_name,omitempty"`
}

// GPUProcessControlService provides GPU process control functionality
type GPUProcessControlService struct{}

// NewGPUProcessControlService creates a new GPU process control service
func NewGPUProcessControlService() *GPUProcessControlService {
	return &GPUProcessControlService{}
}

// KillProcess kills a GPU process
func (g *GPUProcessControlService) KillProcess(pid int32) *GPUProcessControlResult {
	return g.executeProcessControl(pid, "kill", "", monitoring.KillGPUProcess)
}

// SuspendProcess suspends a GPU process
func (g *GPUProcessControlService) SuspendProcess(pid int32) *GPUProcessControlResult {
	return g.executeProcessControl(pid, "suspend", "", monitoring.SuspendGPUProcess)
}

// ResumeProcess resumes a GPU process
func (g *GPUProcessControlService) ResumeProcess(pid int32) *GPUProcessControlResult {
	return g.executeProcessControl(pid, "resume", "", monitoring.ResumeGPUProcess)
}

// SetProcessPriority sets the priority of a GPU process
func (g *GPUProcessControlService) SetProcessPriority(pid int32, priority string) *GPUProcessControlResult {
	if err := g.validatePriority(priority); err != nil {
		return g.createControlResult(pid, false, err.Error(), "priority", priority)
	}

	priorityFunc := func(pid int32) error {
		return monitoring.SetGPUProcessPriority(pid, priority)
	}

	return g.executeProcessControl(pid, "priority", priority, priorityFunc)
}

// ValidateProcess validates if a process is a valid GPU process
func (g *GPUProcessControlService) ValidateProcess(pid int32) *GPUProcessValidationResult {
	if err := g.validatePID(pid); err != nil {
		return &GPUProcessValidationResult{
			PID:     pid,
			IsValid: false,
			Message: err.Error(),
		}
	}

	// Use monitoring module to verify GPU process
	isValid, processName, err := monitoring.VerifyGPUProcess(pid)
	if err != nil {
		return &GPUProcessValidationResult{
			PID:     pid,
			IsValid: false,
			Message: fmt.Sprintf("Validation failed: %v", err),
		}
	}

	var message string
	if isValid {
		message = "Process is a valid GPU process"
		if processName != "" {
			message += fmt.Sprintf(" (%s)", processName)
		}
	} else {
		message = "Process is not a GPU process or not found"
		if processName != "" {
			message += fmt.Sprintf(" (found process: %s)", processName)
		}
	}

	return &GPUProcessValidationResult{
		PID:         pid,
		IsValid:     isValid,
		Message:     message,
		ProcessName: processName,
	}
}

// SetGPUProcessMonitoring enables or disables GPU process monitoring
func (g *GPUProcessControlService) SetGPUProcessMonitoring(enabled bool) {
	monitoring.SetGPUProcessMonitoringEnabled(enabled)
}

// IsGPUProcessMonitoring checks if GPU process monitoring is enabled
func (g *GPUProcessControlService) IsGPUProcessMonitoring() bool {
	return monitoring.IsGPUProcessMonitoringEnabled()
}

// validatePID validates if a PID is valid
func (g *GPUProcessControlService) validatePID(pid int32) error {
	if pid <= 0 {
		return fmt.Errorf("invalid PID: %d", pid)
	}
	return nil
}

// validatePriority validates if the priority string is valid
func (g *GPUProcessControlService) validatePriority(priority string) error {
	validPriorities := []string{"low", "below_normal", "normal", "above_normal", "high", "realtime"}
	priority = strings.ToLower(priority)

	for _, valid := range validPriorities {
		if priority == valid {
			return nil
		}
	}

	return fmt.Errorf("invalid priority '%s', must be one of: %s",
		priority, strings.Join(validPriorities, ", "))
}

// createControlResult creates a standardized control result
func (g *GPUProcessControlService) createControlResult(pid int32, success bool, message, operation, priority string) *GPUProcessControlResult {
	result := &GPUProcessControlResult{
		PID:       pid,
		Success:   success,
		Message:   message,
		Operation: operation,
	}

	if priority != "" {
		result.Priority = priority
	}

	return result
}

// executeProcessControl executes a process control operation with proper error handling
func (g *GPUProcessControlService) executeProcessControl(pid int32, operation string, priority string, controlFunc func(int32) error) *GPUProcessControlResult {
	// Validate PID first
	if err := g.validatePID(pid); err != nil {
		return g.createControlResult(pid, false, err.Error(), operation, priority)
	}

	// Execute the control function
	if err := controlFunc(pid); err != nil {
		return g.createControlResult(pid, false, fmt.Sprintf("Failed to %s process: %v", operation, err), operation, priority)
	}

	// Success
	var message string
	switch operation {
	case "kill":
		message = "Process terminated successfully"
	case "suspend":
		message = "Process suspended successfully"
	case "resume":
		message = "Process resumed successfully"
	case "priority":
		message = fmt.Sprintf("Process priority set to '%s' successfully", priority)
	default:
		message = fmt.Sprintf("Operation '%s' completed successfully", operation)
	}

	return g.createControlResult(pid, true, message, operation, priority)
}