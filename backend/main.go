package main

import (
	"log"
	"net/http"

	"monitoring-app/api"
	"monitoring-app/db"
	"monitoring-app/monitoring"
	"monitoring-app/websockets"

	"github.com/gorilla/mux"
)

func main() {
	// 데이터베이스 초기화
	db.InitDB()

	// 채널 생성
	wsChan := make(chan *monitoring.ResourceSnapshot)
	dbChan := make(chan *monitoring.ResourceSnapshot, 100) // DB 채널은 버퍼를 둠

	// 웹소켓 허브 생성 및 실행
	hub := websockets.NewHub()
	go hub.Run(wsChan)

	// DB 로깅 고루틴 시작
	go db.BatchInsertResourceLogs(dbChan)

	// 시스템 자원 모니터링 시작
	go monitoring.Start(wsChan, dbChan)

	// 라우터 설정
	r := mux.NewRouter()

	// API 라우트를 먼저 등록
	apiRouter := r.PathPrefix("/api").Subrouter()
	apiRouter.HandleFunc("/dashboard/layout", api.GetLayoutHandler).Methods("GET")
	apiRouter.HandleFunc("/dashboard/layout", api.SaveLayoutHandler).Methods("POST")
	apiRouter.HandleFunc("/widgets", api.GetWidgetsHandler).Methods("GET")
	apiRouter.HandleFunc("/widgets", api.SaveWidgetsHandler).Methods("POST")
	apiRouter.HandleFunc("/widgets", api.DeleteWidgetHandler).Methods("DELETE")

	// WebSocket 라우트 등록
	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websockets.ServeWs(hub, w, r)
	})

	// 마지막에 정적 파일 서빙을 등록 (가장 낮은 우선순위)
	// Docker 환경에서는 Nginx가 처리하지만, 로컬 개발 편의를 위해 추가
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("../frontend/dist")))

	log.Println("HTTP server started on :8080")
	err := http.ListenAndServe(":8080", r)
	if err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}
