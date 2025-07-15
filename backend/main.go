package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"monitoring-app/api"
	"monitoring-app/db"
	"monitoring-app/monitoring"
	"monitoring-app/websockets"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/mux"
	_ "modernc.org/sqlite" // SQLite 드라이버를 modernc.org/sqlite로 변경
)

//go:embed dist/*
var frontendFiles embed.FS

// Config structure for application configuration
type Config struct {
	Server struct {
		Port int    `json:"port"`
		Host string `json:"host"`
	} `json:"server"`
	Database struct {
		Filename string `json:"filename"`
	} `json:"database"`
	Monitoring struct {
		IntervalSeconds         int  `json:"interval_seconds"`
		EnableCpuMonitoring     bool `json:"enable_cpu_monitoring"`
		EnableMemoryMonitoring  bool `json:"enable_memory_monitoring"`
		EnableDiskMonitoring    bool `json:"enable_disk_monitoring"`
		EnableNetworkMonitoring bool `json:"enable_network_monitoring"`
	} `json:"monitoring"`
	UI struct {
		AutoOpenBrowser bool   `json:"auto_open_browser"`
		Theme          string `json:"theme"`
	} `json:"ui"`
}

// Default configuration
func getDefaultConfig() Config {
	return Config{
		Server: struct {
			Port int    `json:"port"`
			Host string `json:"host"`
		}{
			Port: 8080,
			Host: "localhost",
		},
		Database: struct {
			Filename string `json:"filename"`
		}{
			Filename: "monitoring.db",
		},
		Monitoring: struct {
			IntervalSeconds         int  `json:"interval_seconds"`
			EnableCpuMonitoring     bool `json:"enable_cpu_monitoring"`
			EnableMemoryMonitoring  bool `json:"enable_memory_monitoring"`
			EnableDiskMonitoring    bool `json:"enable_disk_monitoring"`
			EnableNetworkMonitoring bool `json:"enable_network_monitoring"`
		}{
			IntervalSeconds:         2,
			EnableCpuMonitoring:     true,
			EnableMemoryMonitoring:  true,
			EnableDiskMonitoring:    true,
			EnableNetworkMonitoring: true,
		},
		UI: struct {
			AutoOpenBrowser bool   `json:"auto_open_browser"`
			Theme          string `json:"theme"`
		}{
			AutoOpenBrowser: false,
			Theme:          "system",
		},
	}
}

// Load or create configuration file
func loadConfig() Config {
	configPath := "config.json"
	
	// Check if config file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Create default config file
		defaultConfig := getDefaultConfig()
		configData, err := json.MarshalIndent(defaultConfig, "", "  ")
		if err != nil {
			log.Printf("Error marshaling default config: %v", err)
			return defaultConfig
		}
		
		err = os.WriteFile(configPath, configData, 0644)
		if err != nil {
			log.Printf("Error creating config file: %v", err)
			return defaultConfig
		}
		
		log.Printf("Created default config file: %s", configPath)
		return defaultConfig
	}
	
	// Load existing config file
	configData, err := os.ReadFile(configPath)
	if err != nil {
		log.Printf("Error reading config file: %v", err)
		return getDefaultConfig()
	}
	
	var config Config
	err = json.Unmarshal(configData, &config)
	if err != nil {
		log.Printf("Error parsing config file: %v", err)
		return getDefaultConfig()
	}
	
	log.Printf("Loaded configuration from: %s", configPath)
	return config
}

func main() {
	// Load configuration
	config := loadConfig()
	
	// --- Database Initialization ---
	// 실행 파일과 같은 위치에 데이터베이스 저장
	dbPath := "."  // 현재 디렉터리 (실행 파일 위치)
	dbFile := config.Database.Filename
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

	// 임베드된 프론트엔드 파일 서빙
	setupFrontendRoutes(r)

	// Start HTTP server with configured port
	serverAddr := fmt.Sprintf(":%d", config.Server.Port)
	log.Printf("HTTP server starting on %s", serverAddr)
	log.Println("Frontend files embedded in binary - no external dependencies required")
	log.Printf("Configuration: Port=%d, Database=%s", config.Server.Port, config.Database.Filename)
	if err := http.ListenAndServe(serverAddr, r); err != nil {
		log.Fatalf("could not start server: %v\n", err)
	}
}

// setupFrontendRoutes 임베드된 프론트엔드 파일들을 서빙하는 라우트 설정
func setupFrontendRoutes(r *mux.Router) {
	// 임베드된 파일시스템에서 dist 서브디렉터리 가져오기
	distFS, err := fs.Sub(frontendFiles, "dist")
	if err != nil {
		log.Printf("Error accessing embedded frontend files: %v", err)
		log.Printf("Frontend will not be served.")
		return
	}

	// 정적 파일 핸들러 설정
	fileServer := http.FileServer(http.FS(distFS))
	
	// 정적 파일들 (CSS, JS, 이미지 등) 처리
	r.PathPrefix("/assets/").Handler(fileServer)
	
	// 파비콘과 기타 정적 파일들
	r.HandleFunc("/vite.svg", func(w http.ResponseWriter, r *http.Request) {
		serveEmbeddedFile(w, r, distFS, "vite.svg")
	})
	r.HandleFunc("/HWnow.png", func(w http.ResponseWriter, r *http.Request) {
		serveEmbeddedFile(w, r, distFS, "HWnow.png")
	})
	
	// 메인 인덱스 페이지 및 SPA 라우팅
	r.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		
		// 루트 경로이거나 파일 확장자가 없는 경우 (SPA 라우팅)
		if path == "" || !strings.Contains(path, ".") {
			serveEmbeddedFile(w, r, distFS, "index.html")
			return
		}
		
		// 실제 파일이 존재하는지 확인
		if _, err := fs.Stat(distFS, path); err == nil {
			serveEmbeddedFile(w, r, distFS, path)
			return
		}
		
		// 파일이 없으면 index.html로 폴백 (SPA)
		serveEmbeddedFile(w, r, distFS, "index.html")
	})
	
	log.Println("Embedded frontend files successfully configured")
}

// serveEmbeddedFile 임베드된 파일시스템에서 파일을 서빙
func serveEmbeddedFile(w http.ResponseWriter, r *http.Request, fsys fs.FS, path string) {
	file, err := fsys.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	
	// 파일 정보 가져오기
	stat, err := file.Stat()
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	
	// Content-Type 설정
	if strings.HasSuffix(path, ".html") {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	} else if strings.HasSuffix(path, ".css") {
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	} else if strings.HasSuffix(path, ".js") {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	} else if strings.HasSuffix(path, ".png") {
		w.Header().Set("Content-Type", "image/png")
	} else if strings.HasSuffix(path, ".svg") {
		w.Header().Set("Content-Type", "image/svg+xml")
	}
	
	// 파일 서빙
	http.ServeContent(w, r, path, stat.ModTime(), file.(io.ReadSeeker))
}
