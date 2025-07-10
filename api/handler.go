package api

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"monitoring-app/backend/db"
	"net/http"
)

type StateRequest struct {
	UserID string          `json:"userId"`
	State  json.RawMessage `json:"state"`
}

func GetDashboardStateHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	stateJSON, err := db.GetDashboardState(userID)
	if err != nil {
		log.Printf("ERROR: Failed to get dashboard state for user '%s': %v", userID, err)
		http.Error(w, "Failed to get dashboard state", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if stateJSON == "" {
		w.Write([]byte(`{"state": null}`))
		return
	}

	responseJSON := fmt.Sprintf(`{"state": %s}`, stateJSON)
	w.Write([]byte(responseJSON))
}

func SaveDashboardStateHandler(w http.ResponseWriter, r *http.Request) {
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

	var req StateRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == "" || len(req.State) == 0 {
		http.Error(w, "userId and state are required", http.StatusBadRequest)
		return
	}

	err = db.SaveDashboardState(req.UserID, string(req.State))
	if err != nil {
		log.Printf("ERROR: Failed to save dashboard state for user '%s': %v", req.UserID, err)
		http.Error(w, "Failed to save dashboard state", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("State saved successfully"))
}
