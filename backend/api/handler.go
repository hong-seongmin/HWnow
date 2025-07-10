package api

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"net/http"

	"monitoring-app/db"
)

type DashboardLayoutRequest struct {
	UserID     string          `json:"userId"`
	LayoutJSON json.RawMessage `json:"layout"`
}

// GetLayoutHandler는 대시보드 레이아웃을 조회하는 HTTP 핸들러입니다.
func GetLayoutHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	layout, err := db.GetLayout(userID)
	if err != nil {
		log.Printf("ERROR: Failed to get layout for user '%s': %v", userID, err)
		http.Error(w, "Failed to get layout", http.StatusInternalServerError)
		return
	}

	if layout == "" {
		layout = "[]" // 기본값으로 빈 배열 반환
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(layout))
}

// SaveLayoutHandler는 대시보드 레이아웃을 저장하는 HTTP 핸들러입니다.
func SaveLayoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusInternalServerError)
		return
	}
	defer r.Body.Close()

	var req DashboardLayoutRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == "" || len(req.LayoutJSON) == 0 {
		http.Error(w, "userId and layout are required", http.StatusBadRequest)
		return
	}

	err = db.SaveLayout(req.UserID, string(req.LayoutJSON))
	if err != nil {
		http.Error(w, "Failed to save layout", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Layout saved successfully"))
}

// GetWidgetsHandler는 특정 사용자의 모든 위젯 상태를 조회합니다.
func GetWidgetsHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	widgets, err := db.GetWidgets(userID)
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
func SaveWidgetsHandler(w http.ResponseWriter, r *http.Request) {
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

	if err := db.SaveWidgets(widgets); err != nil {
		http.Error(w, "Failed to save widgets", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DeleteWidgetHandler는 특정 위젯을 DB에서 삭제합니다.
func DeleteWidgetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Only DELETE method is allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := r.URL.Query().Get("userId")
	widgetID := r.URL.Query().Get("widgetId")

	if userID == "" || widgetID == "" {
		http.Error(w, "userId and widgetId are required", http.StatusBadRequest)
		return
	}

	if err := db.DeleteWidget(userID, widgetID); err != nil {
		http.Error(w, "Failed to delete widget", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
