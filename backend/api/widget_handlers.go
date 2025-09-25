package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"monitoring-app/db"
)

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
	body, err := io.ReadAll(r.Body)
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
