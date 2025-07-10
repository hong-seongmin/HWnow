package main

import (
	"embed"
	"io/fs"
	"log"
	"monitoring-app/api"
	"monitoring-app/monitoring"
	"monitoring-app/websockets"
	"net/http"
)

//go:embed dist/*
var frontendFS embed.FS

func main() {
	distFS, err := fs.Sub(frontendFS, "dist")
	if err != nil {
		log.Fatal(err)
	}

	// Create hub and channels
	hub := websockets.NewHub()
	wsChan := make(chan *monitoring.ResourceSnapshot, 100)
	dbChan := make(chan *monitoring.ResourceSnapshot, 100)

	// Start hub and monitoring
	go hub.Run(wsChan)
	go monitoring.Start(wsChan, dbChan)

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/dashboard/layout", api.GetLayoutHandler)
	mux.HandleFunc("/api/widgets", api.GetWidgetsHandler)

	// WebSocket handler
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websockets.ServeWs(hub, w, r)
	})

	// Static files
	mux.Handle("/", http.FileServer(http.FS(distFS)))

	log.Println("HTTP server started on :8080. Access the application at http://localhost:8080")
	err = http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
