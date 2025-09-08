package websockets

import (
	"encoding/json"
	"log"

	"monitoring-app/monitoring"
)

// WebSocketMessage는 클라이언트와 서버 간에 교환되는 데이터 구조입니다.
type WebSocketMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type metricData struct {
	Value float64 `json:"value"`
	Info  string   `json:"info,omitempty"`
}

// Hub는 모든 WebSocket 클라이언트를 관리하고 메시지를 브로드캐스트합니다.
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
}

// NewHub는 새로운 Hub 인스턴스를 생성하고 반환합니다.
func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

// Run은 Hub의 메인 루프를 실행하여 클라이언트 연결 및 메시지 전송을 처리합니다.
// CPU 최적화 Phase 4.1: WebSocket Hub 완전 제거 - 무한 루프 비활성화
func (h *Hub) Run(snapshotChan <-chan *monitoring.ResourceSnapshot) {
	// CPU 소모를 방지하기 위해 무한 루프를 비활성화
	log.Println("WebSocket Hub disabled for CPU optimization")
	return
	
	// 비활성화된 원본 코드 (CPU 소모 방지)
	/*
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			log.Println("새로운 클라이언트가 연결되었습니다.")
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				log.Println("클라이언트 연결이 해제되었습니다.")
			}
		case snapshot := <-snapshotChan:
			if snapshot == nil {
				continue
			}
			for _, metric := range snapshot.Metrics {
				// 각 메트릭을 별도의 WebSocket 메시지로 변환
				message, err := json.Marshal(WebSocketMessage{
					Type: metric.Type,
					Data: metricData{
						Value: metric.Value,
						Info:  metric.Info,
					},
				})
				if err != nil {
					log.Printf("Error marshalling metric data: %v", err)
					continue
				}

				// 모든 클라이언트에게 브로드캐스트
				for client := range h.clients {
					select {
					case client.send <- message:
					default:
						close(client.send)
						delete(h.clients, client)
					}
				}
			}
		}
	}
	*/
}
