package api

import (
	"database/sql"
	"encoding/json"
	"io/ioutil"
	"monitoring-app/db"
	"net/http"

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
}

// GetWidgetsHandler는 여러 위젯의 상태를 한번에 조회합니다.
func (h *Handler) GetWidgetsHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	widgets, err := db.GetWidgets(h.DB, userID)
	if err != nil {
		http.Error(w, "Failed to get widgets", http.StatusInternalServerError)
		return
	}

	if widgets == nil {
		widgets = []db.WidgetState{} // null 대신 빈 배열 반환
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(widgets)
}

// SaveWidgetsHandler는 여러 위젯의 상태를 한번에 저장(upsert)합니다.
func (h *Handler) SaveWidgetsHandler(w http.ResponseWriter, r *http.Request) {
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	var widgets []db.WidgetState
	if err := json.Unmarshal(body, &widgets); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(widgets) == 0 {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("No widgets to save"))
		return
	}

	if err := db.SaveWidgets(h.DB, widgets); err != nil {
		http.Error(w, "Failed to save widgets", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DeleteWidgetHandler는 특정 위젯을 DB에서 삭제합니다.
func (h *Handler) DeleteWidgetHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	widgetID := r.URL.Query().Get("widgetId")

	if userID == "" || widgetID == "" {
		http.Error(w, "userId and widgetId are required", http.StatusBadRequest)
		return
	}

	if err := db.DeleteWidget(h.DB, userID, widgetID); err != nil {
		http.Error(w, "Failed to delete widget", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
