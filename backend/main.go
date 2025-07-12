package main

import (
	"log"
	"monitoring-app/api"
	"monitoring-app/db"
	"monitoring-app/monitoring"
	"monitoring-app/websockets"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gorilla/mux"
	_ "modernc.org/sqlite" // SQLite 드라이버를 modernc.org/sqlite로 변경
)

func main() {
	// --- Database Initialization ---
	dbPath := "database"
	dbFile := "monitoring.db"
	dataSourceName, err := db.EnsureDB(dbPath, dbFile)
	if err != nil {
		log.Fatalf("Database setup failed: %v", err)
	}

	database, err := db.InitDB(dataSourceName)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()
	log.Println("Database connection successful.")

	// --- WebSocket and Monitoring Setup ---
	hub := websockets.NewHub()

	// 채널 생성
	wsChan := make(chan *monitoring.ResourceSnapshot)
	dbChan := make(chan *monitoring.ResourceSnapshot)

	// 허브 및 모니터링 시작
	go hub.Run(wsChan)
	go monitoring.Start(wsChan, dbChan)

	// DB로 데이터 전송
	go db.BatchInsertResourceLogs(dbChan, database)

	// --- HTTP Server Setup ---
	r := mux.NewRouter()

	// API 핸들러에 DB 의존성 주입
	apiHandler := api.NewHandler(database)

	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websockets.ServeWs(hub, w, r)
	})

	api.RegisterRoutes(r, apiHandler)

	// 정적 파일 서빙 (Frontend)
	staticDir := "frontend/dist"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		log.Printf("Warning: Frontend 'dist' directory not found at %s.", staticDir)
		log.Printf("Warning: API and WebSocket server will run, but the frontend will not be served.")
	} else {
		// Vite 빌드 결과물에 맞게 경로 설정
		fs := http.FileServer(http.Dir(filepath.Join(staticDir)))
		r.PathPrefix("/").Handler(http.StripPrefix("/", fs))
		// SPA를 위한 인덱스 핸들러
		r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
		})
	}

	log.Println("HTTP server starting on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatalf("could not start server: %v\n", err)
	}
}
