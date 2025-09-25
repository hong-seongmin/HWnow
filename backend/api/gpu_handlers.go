package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"monitoring-app/monitoring"
)

// Security validation middleware
func (h *Handler) validateSecurity(w http.ResponseWriter) error {
	// 보안 컨텍스트 검증
	err := monitoring.ValidateSecurityContext()
	if err != nil {
		log.Printf("Security validation failed: %v", err)

		// 권한 부족 시 상세 정보 제공
		securityCtx, ctxErr := monitoring.GetSecurityContext()
		if ctxErr == nil {
			response := map[string]interface{}{
				"error":           "Insufficient privileges",
				"message":         err.Error(),
				"securityContext": securityCtx,
				"recommendations": securityCtx.Recommendations,
			}

			if securityCtx.UACStatus.CanElevate {
				response["canRequestElevation"] = true
				response["elevationEndpoint"] = "/api/gpu/processes/request-elevation"
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(response)
		} else {
			http.Error(w, "Insufficient privileges for process control", http.StatusForbidden)
		}
		return err
	}
	return nil
}

// GPU Process Control Handlers

// KillGPUProcessHandler는 지정된 PID의 GPU 프로세스를 종료합니다.
func (h *Handler) KillGPUProcessHandler(w http.ResponseWriter, r *http.Request) {
	// 보안 검증
	if err := h.validateSecurity(w); err != nil {
		return // validateSecurity에서 이미 응답 처리됨
	}

	vars := mux.Vars(r)
	pidStr := vars["pid"]

	if pidStr == "" {
		http.Error(w, "PID is required", http.StatusBadRequest)
		return
	}

	pid, err := strconv.ParseInt(pidStr, 10, 32)
	if err != nil {
		log.Printf("Invalid PID format: %s", pidStr)
		http.Error(w, "Invalid PID format", http.StatusBadRequest)
		return
	}

	log.Printf("Received request to kill GPU process with PID: %d", pid)

	// GPU 프로세스 종료 실행
	if err := monitoring.KillGPUProcess(int32(pid)); err != nil {
		log.Printf("Failed to kill GPU process %d: %v", pid, err)

		// 에러 타입에 따라 적절한 HTTP 상태 코드 반환
		errorStr := err.Error()
		if strings.Contains(errorStr, "not found") {
			http.Error(w, "Process not found", http.StatusNotFound)
		} else if strings.Contains(errorStr, "critical system process") {
			http.Error(w, "Cannot kill critical system process", http.StatusForbidden)
		} else {
			http.Error(w, "Failed to kill process", http.StatusInternalServerError)
		}
		return
	}

	log.Printf("Successfully killed GPU process with PID: %d", pid)

	// 성공 응답
	response := map[string]interface{}{
		"success": true,
		"message": "Successfully killed process with PID " + pidStr,
		"pid":     pid,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// SuspendGPUProcessHandler는 지정된 PID의 GPU 프로세스를 일시정지합니다.
func (h *Handler) SuspendGPUProcessHandler(w http.ResponseWriter, r *http.Request) {
	// 보안 검증
	if err := h.validateSecurity(w); err != nil {
		return // validateSecurity에서 이미 응답 처리됨
	}

	vars := mux.Vars(r)
	pidStr := vars["pid"]

	if pidStr == "" {
		http.Error(w, "PID is required", http.StatusBadRequest)
		return
	}

	pid, err := strconv.ParseInt(pidStr, 10, 32)
	if err != nil {
		log.Printf("Invalid PID format: %s", pidStr)
		http.Error(w, "Invalid PID format", http.StatusBadRequest)
		return
	}

	log.Printf("Received request to suspend GPU process with PID: %d", pid)

	// GPU 프로세스 일시정지 실행
	if err := monitoring.SuspendGPUProcess(int32(pid)); err != nil {
		log.Printf("Failed to suspend GPU process %d: %v", pid, err)

		// 에러 타입에 따라 적절한 HTTP 상태 코드 반환
		errorStr := err.Error()
		if strings.Contains(errorStr, "not found") {
			http.Error(w, "Process not found", http.StatusNotFound)
		} else if strings.Contains(errorStr, "critical system process") {
			http.Error(w, "Cannot suspend critical system process", http.StatusForbidden)
		} else {
			http.Error(w, "Failed to suspend process", http.StatusInternalServerError)
		}
		return
	}

	log.Printf("Successfully suspended GPU process with PID: %d", pid)

	// 성공 응답
	response := map[string]interface{}{
		"success": true,
		"message": "Successfully suspended process with PID " + pidStr,
		"pid":     pid,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ResumeGPUProcessHandler는 일시정지된 GPU 프로세스를 재개합니다.
func (h *Handler) ResumeGPUProcessHandler(w http.ResponseWriter, r *http.Request) {
	// 보안 검증
	if err := h.validateSecurity(w); err != nil {
		return // validateSecurity에서 이미 응답 처리됨
	}

	vars := mux.Vars(r)
	pidStr := vars["pid"]

	if pidStr == "" {
		http.Error(w, "PID is required", http.StatusBadRequest)
		return
	}

	pid, err := strconv.ParseInt(pidStr, 10, 32)
	if err != nil {
		log.Printf("Invalid PID format: %s", pidStr)
		http.Error(w, "Invalid PID format", http.StatusBadRequest)
		return
	}

	log.Printf("Received request to resume GPU process with PID: %d", pid)

	// GPU 프로세스 재개 실행
	if err := monitoring.ResumeGPUProcess(int32(pid)); err != nil {
		log.Printf("Failed to resume GPU process %d: %v", pid, err)

		// 에러 타입에 따라 적절한 HTTP 상태 코드 반환
		errorStr := err.Error()
		if strings.Contains(errorStr, "not found") {
			http.Error(w, "Process not found", http.StatusNotFound)
		} else if strings.Contains(errorStr, "critical system process") {
			http.Error(w, "Cannot resume critical system process", http.StatusForbidden)
		} else {
			http.Error(w, "Failed to resume process", http.StatusInternalServerError)
		}
		return
	}

	log.Printf("Successfully resumed GPU process with PID: %d", pid)

	// 성공 응답
	response := map[string]interface{}{
		"success": true,
		"message": "Successfully resumed process with PID " + pidStr,
		"pid":     pid,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// SetGPUProcessPriorityHandler는 GPU 프로세스의 우선순위를 변경합니다.
func (h *Handler) SetGPUProcessPriorityHandler(w http.ResponseWriter, r *http.Request) {
	// 보안 검증
	if err := h.validateSecurity(w); err != nil {
		return // validateSecurity에서 이미 응답 처리됨
	}

	vars := mux.Vars(r)
	pidStr := vars["pid"]

	if pidStr == "" {
		http.Error(w, "PID is required", http.StatusBadRequest)
		return
	}

	pid, err := strconv.ParseInt(pidStr, 10, 32)
	if err != nil {
		log.Printf("Invalid PID format: %s", pidStr)
		http.Error(w, "Invalid PID format", http.StatusBadRequest)
		return
	}

	// 요청 본문에서 우선순위 정보 읽기
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Failed to read request body: %v", err)
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	var requestData struct {
		Priority string `json:"priority"`
	}

	if err := json.Unmarshal(body, &requestData); err != nil {
		log.Printf("Failed to parse request JSON: %v", err)
		http.Error(w, "Invalid JSON format", http.StatusBadRequest)
		return
	}

	if requestData.Priority == "" {
		http.Error(w, "Priority is required", http.StatusBadRequest)
		return
	}

	log.Printf("Received request to set priority of GPU process %d to %s", pid, requestData.Priority)

	// GPU 프로세스 우선순위 변경 실행
	if err := monitoring.SetGPUProcessPriority(int32(pid), requestData.Priority); err != nil {
		log.Printf("Failed to set priority of GPU process %d: %v", pid, err)

		// 에러 타입에 따라 적절한 HTTP 상태 코드 반환
		errorStr := err.Error()
		if strings.Contains(errorStr, "not found") {
			http.Error(w, "Process not found", http.StatusNotFound)
		} else if strings.Contains(errorStr, "critical system process") {
			http.Error(w, "Cannot change priority of critical system process", http.StatusForbidden)
		} else if strings.Contains(errorStr, "invalid priority level") {
			http.Error(w, "Invalid priority level", http.StatusBadRequest)
		} else {
			http.Error(w, "Failed to set process priority", http.StatusInternalServerError)
		}
		return
	}

	log.Printf("Successfully set priority of GPU process %d to %s", pid, requestData.Priority)

	// 성공 응답
	response := map[string]interface{}{
		"success":  true,
		"message":  "Successfully set process priority to " + requestData.Priority,
		"pid":      pid,
		"priority": requestData.Priority,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// CheckPrivilegesHandler는 현재 프로세스의 관리자 권한을 확인합니다.
func (h *Handler) CheckPrivilegesHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("Received request to check admin privileges")

	// 새로운 포괄적 보안 컨텍스트 사용
	securityCtx, err := monitoring.GetSecurityContext()
	if err != nil {
		log.Printf("Failed to get security context: %v", err)
		http.Error(w, "Failed to check security context", http.StatusInternalServerError)
		return
	}

	// 기존 호환성을 위한 간단한 권한 확인도 포함
	hasAdmin, err := monitoring.HasAdminPrivileges()
	if err != nil {
		log.Printf("Failed to check admin privileges: %v", err)
	}

	response := map[string]interface{}{
		"hasAdminPrivileges": hasAdmin,
		"platform":           monitoring.GetCurrentPlatform(),
		"securityContext":    securityCtx,
	}

	// 메시지 결정
	if securityCtx.IsSecureMode {
		response["message"] = "보안 컨텍스트가 확인되었습니다. GPU 프로세스 제어가 가능합니다."
		response["status"] = "ready"
	} else if securityCtx.UACStatus.IsEnabled && !securityCtx.UACStatus.IsElevated {
		response["message"] = "관리자 권한으로 애플리케이션을 재실행해야 합니다."
		response["status"] = "needs_elevation"
		response["canRequestElevation"] = securityCtx.UACStatus.CanElevate
	} else {
		response["message"] = "GPU 프로세스 제어를 위해 적절한 권한이 필요합니다."
		response["status"] = "insufficient_privileges"
	}

	// 권장사항 추가
	if len(securityCtx.Recommendations) > 0 {
		response["recommendations"] = securityCtx.Recommendations
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// RequestElevationHandler는 UAC 권한 상승을 요청합니다.
func (h *Handler) RequestElevationHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("Received request to elevate privileges")

	// 현재 보안 컨텍스트 확인
	securityCtx, err := monitoring.GetSecurityContext()
	if err != nil {
		log.Printf("Failed to get security context: %v", err)
		http.Error(w, "Failed to check security context", http.StatusInternalServerError)
		return
	}

	// 이미 권한이 있는 경우
	if securityCtx.IsSecureMode {
		response := map[string]interface{}{
			"success": true,
			"message": "이미 충분한 권한이 있습니다.",
			"status":  "already_elevated",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
		return
	}

	// 권한 상승 불가능한 경우
	if !securityCtx.UACStatus.CanElevate {
		response := map[string]interface{}{
			"success": false,
			"message": "현재 시스템에서는 권한 상승이 지원되지 않습니다.",
			"status":  "cannot_elevate",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	// 권한 상승 시도
	err = monitoring.RequestElevation()
	if err != nil {
		log.Printf("Failed to request elevation: %v", err)
		response := map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("권한 상승 요청 실패: %v", err),
			"status":  "elevation_failed",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "권한 상승 요청이 성공적으로 전송되었습니다. 새 창에서 관리자 권한으로 애플리케이션이 시작됩니다.",
		"status":  "elevation_requested",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// GetCriticalProcessesHandler는 현재 플랫폼의 중요 프로세스 목록을 반환합니다.
func (h *Handler) GetCriticalProcessesHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("Received request to get critical processes list")

	// 프로세스 보호 서비스 가져오기
	pps := monitoring.GetProcessProtectionService()
	criticalProcesses := pps.GetCriticalProcesses()

	response := map[string]interface{}{
		"platform":           monitoring.GetCurrentPlatform(),
		"total_count":        len(criticalProcesses),
		"critical_processes": criticalProcesses,
		"protection_levels": map[string]string{
			"0": "None - 보호 없음",
			"1": "Low - 낮은 보호 (경고 없이 제어 가능)",
			"2": "Medium - 중간 보호 (경고와 함께 제어 가능)",
			"3": "High - 높은 보호 (제어 권장하지 않음)",
			"4": "Critical - 중요 (절대 제어 불가)",
		},
		"message": fmt.Sprintf("현재 플랫폼 (%s)에서 %d개의 중요 프로세스가 보호되고 있습니다.",
			monitoring.GetCurrentPlatform(), len(criticalProcesses)),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
