package db

import (
	"database/sql"
	"log"
	"monitoring-app/monitoring"
	"os"
	"path/filepath"
	"strings"
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

	// pages 테이블 생성
	createPagesTableSQL := `
	CREATE TABLE IF NOT EXISTS pages (
		page_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		page_name TEXT NOT NULL,
		page_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, page_id)
	);`

	if _, err = db.Exec(createPagesTableSQL); err != nil {
		return nil, err
	}

	// widget_states 테이블 생성
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS widget_states (
		user_id TEXT NOT NULL,
		page_id TEXT NOT NULL,
		widget_id TEXT NOT NULL,
		widget_type TEXT NOT NULL,
		config TEXT,
		layout TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (user_id, page_id, widget_id)
	);`

	if _, err = db.Exec(createTableSQL); err != nil {
		return nil, err
	}

	// 기존 테이블에 page_id, config, layout 컬럼이 없으면 추가 (마이그레이션)
	_, err = db.Exec("ALTER TABLE widget_states ADD COLUMN page_id TEXT DEFAULT 'main-page'")
	if err != nil && !strings.Contains(err.Error(), "duplicate column name") {
		log.Printf("Warning: Could not add page_id column: %v", err)
	}

	_, err = db.Exec("ALTER TABLE widget_states ADD COLUMN config TEXT")
	if err != nil && !strings.Contains(err.Error(), "duplicate column name") {
		log.Printf("Warning: Could not add config column: %v", err)
	}

	_, err = db.Exec("ALTER TABLE widget_states ADD COLUMN layout TEXT")
	if err != nil && !strings.Contains(err.Error(), "duplicate column name") {
		log.Printf("Warning: Could not add layout column: %v", err)
	}

	// 기본 페이지가 없으면 생성
	_, err = db.Exec(`INSERT OR IGNORE INTO pages (page_id, user_id, page_name, page_order) 
		SELECT DISTINCT 'main-page', user_id, 'Main Page', 0 FROM widget_states 
		UNION SELECT 'main-page', 'global-user', 'Main Page', 0`)
	if err != nil {
		log.Printf("Warning: Could not create default page: %v", err)
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
	PageID     string `json:"pageId"`
	WidgetID   string `json:"widgetId"`
	WidgetType string `json:"widgetType"`
	Config     string `json:"config"`
	Layout     string `json:"layout"`
}

type Page struct {
	PageID    string `json:"pageId"`
	UserID    string `json:"userId"`
	PageName  string `json:"pageName"`
	PageOrder int    `json:"pageOrder"`
}

func GetWidgets(db *sql.DB, userID, pageID string) ([]WidgetState, error) {
	query := "SELECT page_id, widget_id, widget_type, config, layout FROM widget_states WHERE user_id = ? AND page_id = ?"
	rows, err := db.Query(query, userID, pageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var widgets []WidgetState
	for rows.Next() {
		var w WidgetState
		w.UserID = userID
		var config, layout sql.NullString
		var pageID sql.NullString
		if err := rows.Scan(&pageID, &w.WidgetID, &w.WidgetType, &config, &layout); err != nil {
			return nil, err
		}
		w.PageID = pageID.String
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
		INSERT INTO widget_states (user_id, page_id, widget_id, widget_type, config, layout)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(user_id, page_id, widget_id) DO UPDATE SET
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
		_, err := stmt.Exec(w.UserID, w.PageID, w.WidgetID, w.WidgetType, w.Config, w.Layout)
		if err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func DeleteWidget(db *sql.DB, userID, pageID, widgetID string) error {
	query := "DELETE FROM widget_states WHERE user_id = ? AND page_id = ? AND widget_id = ?"
	_, err := db.Exec(query, userID, pageID, widgetID)
	return err
}

// Page management functions
func GetPages(db *sql.DB, userID string) ([]Page, error) {
	query := "SELECT page_id, page_name, page_order FROM pages WHERE user_id = ? ORDER BY page_order"
	rows, err := db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []Page
	for rows.Next() {
		var p Page
		p.UserID = userID
		if err := rows.Scan(&p.PageID, &p.PageName, &p.PageOrder); err != nil {
			return nil, err
		}
		pages = append(pages, p)
	}
	return pages, nil
}

func CreatePage(db *sql.DB, userID, pageID, pageName string) error {
	// Get the highest page_order for this user
	var maxOrder int
	err := db.QueryRow("SELECT COALESCE(MAX(page_order), -1) FROM pages WHERE user_id = ?", userID).Scan(&maxOrder)
	if err != nil {
		return err
	}

	query := `INSERT INTO pages (page_id, user_id, page_name, page_order) VALUES (?, ?, ?, ?)`
	_, err = db.Exec(query, pageID, userID, pageName, maxOrder+1)
	return err
}

func DeletePage(db *sql.DB, userID, pageID string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	// Delete all widgets in this page first
	_, err = tx.Exec("DELETE FROM widget_states WHERE user_id = ? AND page_id = ?", userID, pageID)
	if err != nil {
		tx.Rollback()
		return err
	}

	// Delete the page
	_, err = tx.Exec("DELETE FROM pages WHERE user_id = ? AND page_id = ?", userID, pageID)
	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

func UpdatePageName(db *sql.DB, userID, pageID, newName string) error {
	query := "UPDATE pages SET page_name = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND page_id = ?"
	_, err := db.Exec(query, newName, userID, pageID)
	return err
}

// BatchInsertResourceLogs는 수집된 자원 모니터링 데이터를 일괄 삽입합니다.
// CPU 최적화 Phase 5.1: 배치 삽입 고루틴 완전 비활성화
func BatchInsertResourceLogs(snapshots <-chan *monitoring.ResourceSnapshot, db *sql.DB) {
	// CPU 소모를 방지하기 위해 배치 삽입 무한 루프 비활성화
	log.Println("CPU 최적화: 배치 DB 삽입 시스템 완전 비활성화됨 (1초 ticker 제거)")
	return

	// 비활성화된 원본 코드 (CPU 소모 방지)
	/*
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
	*/
}
