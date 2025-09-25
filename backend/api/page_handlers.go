package api

import (
	"encoding/json"
	"log"
	"net/http"

	"monitoring-app/db"
)

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
