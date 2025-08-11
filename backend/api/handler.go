package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"monitoring-app/db"
	"monitoring-app/monitoring"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
)

// Handler는 API 핸들러들의 의존성을 관리합니다.
type Handler struct {
	DB *sql.DB
}

// NewHandler는 새로운 Handler 인스턴스를 생성합니다.
func NewHandler(db *sql.DB) *Handler {
	return &Handler{DB: db}
}

// RegisterRoutes는 mux 라우터에 API 경로들을 등록합니다.
func RegisterRoutes(r *mux.Router, h *Handler) {
	r.HandleFunc("/api/widgets", h.GetWidgetsHandler).Methods("GET")
	r.HandleFunc("/api/widgets", h.SaveWidgetsHandler).Methods("POST")
	r.HandleFunc("/api/widgets", h.DeleteWidgetHandler).Methods("DELETE")
	
	// Page management routes
	r.HandleFunc("/api/pages", h.GetPagesHandler).Methods("GET")
	r.HandleFunc("/api/pages", h.CreatePageHandler).Methods("POST")
	r.HandleFunc("/api/pages", h.DeletePageHandler).Methods("DELETE")
	r.HandleFunc("/api/pages/name", h.UpdatePageNameHandler).Methods("PUT")
	
	// GPU process control routes
	r.HandleFunc("/api/gpu/process/{pid}/kill", h.KillGPUProcessHandler).Methods("POST")
	r.HandleFunc("/api/gpu/process/{pid}/suspend", h.SuspendGPUProcessHandler).Methods("POST")
	r.HandleFunc("/api/gpu/process/{pid}/resume", h.ResumeGPUProcessHandler).Methods("POST")
	r.HandleFunc("/api/gpu/process/{pid}/priority", h.SetGPUProcessPriorityHandler).Methods("POST")
	r.HandleFunc("/api/gpu/processes/privileges", h.CheckPrivilegesHandler).Methods("GET")
	r.HandleFunc("/api/gpu/processes/request-elevation", h.RequestElevationHandler).Methods("POST")
	r.HandleFunc("/api/gpu/processes/critical-processes", h.GetCriticalProcessesHandler).Methods("GET")
}

// GetWidgetsHandler는 여러 위젯의 상태를 한번에 조회합니다.
func (h *Handler) GetWidgetsHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	pageID := r.URL.Query().Get("pageId")
	
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}
	
	// pageID가 없으면 기본 페이지 사용
	if pageID == "" {
		pageID = "main-page"
	}

	widgets, err := db.GetWidgets(h.DB, userID, pageID)
	if err != nil {
		log.Printf("Error getting widgets for user %s, page %s: %v", userID, pageID, err)
		// 에러 시 빈 배열 반환
		widgets = []db.WidgetState{}
	} else if widgets == nil {
		widgets = []db.WidgetState{} // null 대신 빈 배열 반환
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(widgets)
}

// SaveWidgetsHandler는 여러 위젯의 상태를 한번에 저장(upsert)합니다.
func (h *Handler) SaveWidgetsHandler(w http.ResponseWriter, r *http.Request) {
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading request body: %v", err)
		http.Error(w, "Failed to read request body", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	log.Printf("Received request body: %s", string(body))

	var widgets []db.WidgetState
	if err := json.Unmarshal(body, &widgets); err != nil {
		log.Printf("Error unmarshaling JSON: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("Parsed %d widgets", len(widgets))

	if len(widgets) == 0 {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("No widgets to save"))
		return
	}

	if err := db.SaveWidgets(h.DB, widgets); err != nil {
		log.Printf("Error saving widgets to DB: %v", err)
		http.Error(w, "Failed to save widgets", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DeleteWidgetHandler는 특정 위젯을 DB에서 삭제합니다.
func (h *Handler) DeleteWidgetHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	pageID := r.URL.Query().Get("pageId")
	widgetID := r.URL.Query().Get("widgetId")

	if userID == "" || widgetID == "" {
		http.Error(w, "userId and widgetId are required", http.StatusBadRequest)
		return
	}
	
	// pageID가 없으면 기본 페이지 사용
	if pageID == "" {
		pageID = "main-page"
	}

	if err := db.DeleteWidget(h.DB, userID, pageID, widgetID); err != nil {
		http.Error(w, "Failed to delete widget", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// Page management handlers

// GetPagesHandler는 사용자의 모든 페이지를 조회합니다.
func (h *Handler) GetPagesHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	pages, err := db.GetPages(h.DB, userID)
	if err != nil {
		log.Printf("Error getting pages for user %s: %v", userID, err)
		http.Error(w, "Failed to get pages", http.StatusInternalServerError)
		return
	}

	if pages == nil {
		pages = []db.Page{} // null 대신 빈 배열 반환
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pages)
}

// CreatePageHandler는 새로운 페이지를 생성합니다.
func (h *Handler) CreatePageHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID   string `json:"userId"`
		PageID   string `json:"pageId"`
		PageName string `json:"pageName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == "" || req.PageID == "" || req.PageName == "" {
		http.Error(w, "userId, pageId, and pageName are required", http.StatusBadRequest)
		return
	}

	if err := db.CreatePage(h.DB, req.UserID, req.PageID, req.PageName); err != nil {
		log.Printf("Error creating page for user %s: %v", req.UserID, err)
		http.Error(w, "Failed to create page", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DeletePageHandler는 페이지와 해당 페이지의 모든 위젯을 삭제합니다.
func (h *Handler) DeletePageHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	pageID := r.URL.Query().Get("pageId")

	if userID == "" || pageID == "" {
		http.Error(w, "userId and pageId are required", http.StatusBadRequest)
		return
	}

	if err := db.DeletePage(h.DB, userID, pageID); err != nil {
		log.Printf("Error deleting page %s for user %s: %v", pageID, userID, err)
		http.Error(w, "Failed to delete page", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// UpdatePageNameHandler는 페이지 이름을 업데이트합니다.
func (h *Handler) UpdatePageNameHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID   string `json:"userId"`
		PageID   string `json:"pageId"`
		PageName string `json:"pageName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == "" || req.PageID == "" || req.PageName == "" {
		http.Error(w, "userId, pageId, and pageName are required", http.StatusBadRequest)
		return
	}

	if err := db.UpdatePageName(h.DB, req.UserID, req.PageID, req.PageName); err != nil {
		log.Printf("Error updating page name for user %s, page %s: %v", req.UserID, req.PageID, err)
		http.Error(w, "Failed to update page name", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

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
	body, err := ioutil.ReadAll(r.Body)
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
		"platform":          monitoring.GetCurrentPlatform(),
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
