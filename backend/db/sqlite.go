package db

import (
	"database/sql"
	"log"
	"monitoring-app/monitoring"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

// InitDB는 데이터베이스 연결을 초기화하고 필요한 테이블을 생성합니다.
func InitDB() {
	dbPath := "../database"
	dbFile := "monitoring.db"
	fullPath := filepath.Join(dbPath, dbFile)

	// 데이터베이스 디렉토리가 없으면 생성합니다.
	if err := os.MkdirAll(dbPath, os.ModePerm); err != nil {
		log.Fatalf("Failed to create database directory: %v", err)
	}

	var err error
	dsn := fullPath + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)"
	DB, err = sql.Open("sqlite", dsn)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	if err = DB.Ping(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	createTables()
	seedData()
}

func createTables() {
	queries := []string{
		`
		-- 대시보드 전체 레이아웃 (기존 layouts 테이블 대체)
		CREATE TABLE IF NOT EXISTS dashboard_states (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  user_id TEXT NOT NULL UNIQUE,
		  layout_json TEXT NOT NULL,
		  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`
		-- 위젯 상태 저장
		CREATE TABLE IF NOT EXISTS widget_states (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  user_id TEXT NOT NULL,
		  widget_id TEXT NOT NULL,
		  widget_type TEXT NOT NULL, -- 'cpu', 'ram', etc.
		  config_json TEXT,
		  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		  UNIQUE(user_id, widget_id)
		);`,
		`
		-- 자원 모니터링 로그
		CREATE TABLE IF NOT EXISTS resource_logs (
		  id INTEGER PRIMARY KEY AUTOINCREMENT,
		  timestamp DATETIME NOT NULL,
		  metric_type TEXT,  -- cpu, ram, gpu, disk, net
		  value REAL
		);`,
		`
		-- 위젯 메타데이터 (확장용)
		CREATE TABLE IF NOT EXISTS widget_meta (
		  widget_id TEXT PRIMARY KEY,
		  name TEXT,
		  description TEXT,
		  metric_type TEXT
		);`,
		`
		-- 모니터링 지표 메타데이터
		CREATE TABLE IF NOT EXISTS resource_meta (
		  metric_type TEXT PRIMARY KEY, -- cpu, ram, gpu, disk, net
		  unit TEXT,
		  description TEXT
		);`,
		// Indexes for performance
		`CREATE INDEX IF NOT EXISTS idx_resource_logs_timestamp ON resource_logs(timestamp);`,
		`CREATE INDEX IF NOT EXISTS idx_resource_logs_metric_type_timestamp ON resource_logs(metric_type, timestamp);`,
		`CREATE INDEX IF NOT EXISTS idx_widget_states_user_id ON widget_states(user_id);`,
	}

	for _, query := range queries {
		_, err := DB.Exec(query)
		if err != nil {
			log.Fatalf("Failed to create table: %v", err)
		}
	}
}

func seedData() {
	// Seed resource_meta
	query := `INSERT OR IGNORE INTO resource_meta (metric_type, unit, description) VALUES (?, ?, ?)`
	stmt, err := DB.Prepare(query)
	if err != nil {
		log.Printf("Failed to prepare statement for seeding: %v", err)
		return
	}
	defer stmt.Close()

	metrics := []struct {
		Type, Unit, Desc string
	}{
		{"cpu", "%", "전체 CPU 사용률"},
		{"ram", "%", "메모리 사용률"},
		{"disk_read", "B/s", "디스크 읽기 속도"},
		{"disk_write", "B/s", "디스크 쓰기 속도"},
		{"net_sent", "B/s", "네트워크 송신 속도"},
		{"net_recv", "B/s", "네트워크 수신 속도"},
	}

	for _, m := range metrics {
		if _, err := stmt.Exec(m.Type, m.Unit, m.Desc); err != nil {
			log.Printf("Failed to seed resource_meta: %v", err)
		}
	}
}

// GetLayout은 특정 사용자의 대시보드 레이아웃 설정을 조회합니다.
func GetLayout(userID string) (string, error) {
	var layoutJSON string
	query := "SELECT layout_json FROM dashboard_states WHERE user_id = ?"
	err := DB.QueryRow(query, userID).Scan(&layoutJSON)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil // No layout found is not an error
		}
		return "", err
	}
	return layoutJSON, nil
}

// SaveLayout은 특정 사용자의 대시보드 레이아웃 설정을 저장하거나 수정합니다.
func SaveLayout(userID string, layoutJSON string) error {
	query := `
	INSERT INTO dashboard_states (user_id, layout_json) VALUES (?, ?)
	ON CONFLICT(user_id) DO UPDATE SET layout_json = excluded.layout_json, updated_at = CURRENT_TIMESTAMP;`

	_, err := DB.Exec(query, userID, layoutJSON)
	return err
}

type WidgetState struct {
	UserID     string `json:"userId"`
	WidgetID   string `json:"widgetId"`
	WidgetType string `json:"widgetType"`
	ConfigJSON string `json:"config"`
}

func GetWidgets(userID string) ([]WidgetState, error) {
	query := "SELECT widget_id, widget_type, config_json FROM widget_states WHERE user_id = ?"
	rows, err := DB.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var widgets []WidgetState
	for rows.Next() {
		var w WidgetState
		w.UserID = userID
		var configJSON sql.NullString
		if err := rows.Scan(&w.WidgetID, &w.WidgetType, &configJSON); err != nil {
			return nil, err
		}
		w.ConfigJSON = configJSON.String
		widgets = append(widgets, w)
	}
	return widgets, nil
}

func SaveWidgets(widgets []WidgetState) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO widget_states (user_id, widget_id, widget_type, config_json)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(user_id, widget_id) DO UPDATE SET
		widget_type = excluded.widget_type,
		config_json = excluded.config_json,
		updated_at = CURRENT_TIMESTAMP;
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, w := range widgets {
		_, err := stmt.Exec(w.UserID, w.WidgetID, w.WidgetType, w.ConfigJSON)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func DeleteWidget(userID, widgetID string) error {
	query := "DELETE FROM widget_states WHERE user_id = ? AND widget_id = ?"
	_, err := DB.Exec(query, userID, widgetID)
	return err
}

// BatchInsertResourceLogs는 수집된 자원 모니터링 데이터를 일괄 삽입합니다.
func BatchInsertResourceLogs(snapshots <-chan *monitoring.ResourceSnapshot) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	buffer := make([]*monitoring.ResourceSnapshot, 0, 10)

	for {
		select {
		case snapshot := <-snapshots:
			buffer = append(buffer, snapshot)
		case <-ticker.C:
			if len(buffer) == 0 {
				continue
			}

			tx, err := DB.Begin()
			if err != nil {
				log.Printf("Failed to begin transaction: %v", err)
				continue
			}

			stmt, err := tx.Prepare("INSERT INTO resource_logs (timestamp, metric_type, value) VALUES (?, ?, ?)")
			if err != nil {
				log.Printf("Failed to prepare statement: %v", err)
				tx.Rollback()
				continue
			}

			for _, snapshot := range buffer {
				for _, metric := range snapshot.Metrics {
					if _, err := stmt.Exec(snapshot.Timestamp, metric.Type, metric.Value); err != nil {
						log.Printf("Failed to execute statement: %v", err)
						// 하나라도 실패하면 전체 롤백
						tx.Rollback()
						// 버퍼 비우고 다음 틱으로
						buffer = buffer[:0]
						goto nextTick
					}
				}
			}

			if err := tx.Commit(); err != nil {
				log.Printf("Failed to commit transaction: %v", err)
			}

		nextTick:
			// 버퍼 비우기
			buffer = buffer[:0]
		}
	}
}
