package db

import (
	"database/sql"
	"log"
	"monitoring-app/monitoring"
	"os"
	"path/filepath"
	"time"
)

// EnsureDB는 데이터베이스 파일과 디렉토리가 존재하는지 확인하고,
// 데이터 소스 이름(DSN)을 반환합니다.
func EnsureDB(dbPath, dbFile string) (string, error) {
	if err := os.MkdirAll(dbPath, os.ModePerm); err != nil {
		return "", err
	}
	fullPath := filepath.Join(dbPath, dbFile)
	return fullPath, nil
}

// InitDB는 데이터베이스 연결을 초기화하고 필요한 테이블을 생성합니다.
func InitDB(dataSourceName string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dataSourceName+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}

	if err = db.Ping(); err != nil {
		return nil, err
	}

	createTableSQL := `
	CREATE TABLE IF NOT EXISTS widget_states (
		user_id TEXT NOT NULL,
		widget_id TEXT NOT NULL,
		widget_type TEXT NOT NULL,
		config TEXT,
		layout TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, widget_id)
	);`

	if _, err = db.Exec(createTableSQL); err != nil {
		return nil, err
	}

	// resource_logs 테이블도 생성
	createResourceLogsTableSQL := `
	CREATE TABLE IF NOT EXISTS resource_logs (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  timestamp DATETIME NOT NULL,
	  metric_type TEXT,
	  value REAL
	);`
	if _, err = db.Exec(createResourceLogsTableSQL); err != nil {
		return nil, err
	}

	return db, nil
}

type WidgetState struct {
	UserID     string `json:"userId"`
	WidgetID   string `json:"widgetId"`
	WidgetType string `json:"widgetType"`
	Config     string `json:"config"`
	Layout     string `json:"layout"`
}

func GetWidgets(db *sql.DB, userID string) ([]WidgetState, error) {
	query := "SELECT widget_id, widget_type, config, layout FROM widget_states WHERE user_id = ?"
	rows, err := db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var widgets []WidgetState
	for rows.Next() {
		var w WidgetState
		w.UserID = userID
		var config, layout sql.NullString
		if err := rows.Scan(&w.WidgetID, &w.WidgetType, &config, &layout); err != nil {
			return nil, err
		}
		w.Config = config.String
		w.Layout = layout.String
		widgets = append(widgets, w)
	}
	return widgets, nil
}

func SaveWidgets(db *sql.DB, widgets []WidgetState) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO widget_states (user_id, widget_id, widget_type, config, layout)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(user_id, widget_id) DO UPDATE SET
		widget_type = excluded.widget_type,
		config = excluded.config,
		layout = excluded.layout,
		updated_at = CURRENT_TIMESTAMP;
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, w := range widgets {
		_, err := stmt.Exec(w.UserID, w.WidgetID, w.WidgetType, w.Config, w.Layout)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func DeleteWidget(db *sql.DB, userID, widgetID string) error {
	query := "DELETE FROM widget_states WHERE user_id = ? AND widget_id = ?"
	_, err := db.Exec(query, userID, widgetID)
	return err
}

// BatchInsertResourceLogs는 수집된 자원 모니터링 데이터를 일괄 삽입합니다.
func BatchInsertResourceLogs(snapshots <-chan *monitoring.ResourceSnapshot, db *sql.DB) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	buffer := make([]*monitoring.ResourceSnapshot, 0, 10)

	for {
		select {
		case snapshot := <-snapshots:
			if snapshot == nil {
				return // 채널이 닫히면 고루틴 종료
			}
			buffer = append(buffer, snapshot)
		case <-ticker.C:
			if len(buffer) == 0 {
				continue
			}

			tx, err := db.Begin()
			if err != nil {
				log.Printf("Failed to begin transaction for logs: %v", err)
				continue
			}

			stmt, err := tx.Prepare("INSERT INTO resource_logs (timestamp, metric_type, value) VALUES (?, ?, ?)")
			if err != nil {
				log.Printf("Failed to prepare statement for logs: %v", err)
				tx.Rollback()
				continue
			}

			var failed bool
			for _, snapshot := range buffer {
				for _, metric := range snapshot.Metrics {
					if _, err := stmt.Exec(snapshot.Timestamp, metric.Type, metric.Value); err != nil {
						log.Printf("Failed to execute statement for logs: %v", err)
						failed = true
						break
					}
				}
				if failed {
					break
				}
			}

			if failed {
				tx.Rollback()
			} else {
				if err := tx.Commit(); err != nil {
					log.Printf("Failed to commit transaction for logs: %v", err)
				}
			}

			// 버퍼 비우기
			buffer = buffer[:0]
		}
	}
}
