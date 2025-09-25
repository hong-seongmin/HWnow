package api

import (
	"database/sql"

	"github.com/gorilla/mux"
)

// Handler는 API 요청 흐름을 관리합니다.
type Handler struct {
	DB *sql.DB
}

// NewHandler는 공유 DB 커넥션으로 초기화된 Handler를 반환합니다.
func NewHandler(db *sql.DB) *Handler {
	return &Handler{DB: db}
}

// RegisterRoutes는 API 엔드포인트와 핸들러 매핑을 등록합니다.
func RegisterRoutes(r *mux.Router, h *Handler) {
	r.HandleFunc("/api/widgets", h.GetWidgetsHandler).Methods("GET")
	r.HandleFunc("/api/widgets", h.SaveWidgetsHandler).Methods("POST")
	r.HandleFunc("/api/widgets", h.DeleteWidgetHandler).Methods("DELETE")

	r.HandleFunc("/api/pages", h.GetPagesHandler).Methods("GET")
	r.HandleFunc("/api/pages", h.CreatePageHandler).Methods("POST")
	r.HandleFunc("/api/pages", h.DeletePageHandler).Methods("DELETE")
	r.HandleFunc("/api/pages/name", h.UpdatePageNameHandler).Methods("PUT")

	r.HandleFunc("/api/gpu/process/{pid}/kill", h.KillGPUProcessHandler).Methods("POST")
	r.HandleFunc("/api/gpu/process/{pid}/suspend", h.SuspendGPUProcessHandler).Methods("POST")
	r.HandleFunc("/api/gpu/process/{pid}/resume", h.ResumeGPUProcessHandler).Methods("POST")
	r.HandleFunc("/api/gpu/process/{pid}/priority", h.SetGPUProcessPriorityHandler).Methods("POST")
	r.HandleFunc("/api/gpu/processes/privileges", h.CheckPrivilegesHandler).Methods("GET")
	r.HandleFunc("/api/gpu/processes/request-elevation", h.RequestElevationHandler).Methods("POST")
	r.HandleFunc("/api/gpu/processes/critical-processes", h.GetCriticalProcessesHandler).Methods("GET")
}
