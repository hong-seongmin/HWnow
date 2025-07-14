package api

import (
	"database/sql"
	"encoding/json"
	"io/ioutil"
	"log"
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
	
	// Page management routes
	r.HandleFunc("/api/pages", h.GetPagesHandler).Methods("GET")
	r.HandleFunc("/api/pages", h.CreatePageHandler).Methods("POST")
	r.HandleFunc("/api/pages", h.DeletePageHandler).Methods("DELETE")
	r.HandleFunc("/api/pages/name", h.UpdatePageNameHandler).Methods("PUT")
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
