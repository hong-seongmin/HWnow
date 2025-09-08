package websockets

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// 개발 중에는 모든 Origin을 허용합니다.
		return true
	},
}

// Client는 Hub와 WebSocket 연결 사이의 중개자 역할을 합니다.
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

// writePump는 Hub로부터 받은 메시지를 WebSocket 연결로 전송합니다.
// CPU 최적화: WebSocket 기반 백그라운드 작업 비활성화
func (c *Client) writePump() {
	// CPU 최적화: ticker 기반 ping 메커니즘 제거 (Wails에서는 불필요)
	// ticker := time.NewTicker(pingPeriod)
	defer func() {
		// ticker.Stop() // 더 이상 사용하지 않음
		if c.conn != nil {
			c.conn.Close()
		}
	}()
	
	log.Printf("[WebSocket] writePump disabled for CPU optimization - Wails handles communication")
	return // 백그라운드 프로세스 비활성화
	
	/* CPU 최적화: WebSocket 무한 루프 제거됨
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
	*/ // WebSocket 무한 루프 주석 처리 끝
}

// readPump는 WebSocket 연결로부터 메시지를 읽어 Hub로 전달합니다 (현재는 사용하지 않음).
// CPU 최적화: WebSocket readPump 백그라운드 작업 비활성화
func (c *Client) readPump() {
	defer func() {
		if c.hub != nil {
			// c.hub.unregister <- c // 비활성화
		}
		if c.conn != nil {
			c.conn.Close()
		}
	}()
	
	log.Printf("[WebSocket] readPump disabled for CPU optimization - Wails handles communication")
	return // 백그라운드 프로세스 비활성화
	
	/* CPU 최적화: WebSocket readPump 무한 루프 제거됨
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
	}
	*/ // WebSocket readPump 무한 루프 주석 처리 끝
}

// ServeWs는 HTTP 연결을 WebSocket 연결로 업그레이드하고 클라이언트를 처리합니다.
// CPU 최적화: WebSocket 서버 비활성화 (Wails에서는 불필요)
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	log.Printf("[WebSocket] ServeWs disabled for CPU optimization - Wails communication replaces WebSocket")
	
	// HTTP 에러 응답 반환 (WebSocket 사용 중단 알림)
	http.Error(w, "WebSocket disabled for CPU optimization - using Wails communication", http.StatusServiceUnavailable)
	return
	
	/* CPU 최적화: WebSocket 서버 기능 비활성화
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 256)}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
	*/
}
