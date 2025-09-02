package db

import (
	"database/sql"
	"fmt"
	"log"
	"HWnow-wails/internal/monitoring"
	"os"
	"path/filepath"
	"strings"
	"time"
	
	_ "modernc.org/sqlite"
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
	log.Printf("[DB] GetWidgets: Loading widgets for user=%s, page=%s", userID, pageID)
	
	query := "SELECT page_id, widget_id, widget_type, config, layout FROM widget_states WHERE user_id = ? AND page_id = ?"
	rows, err := db.Query(query, userID, pageID)
	if err != nil {
		log.Printf("[DB] GetWidgets: Query failed for user=%s, page=%s, error=%v", userID, pageID, err)
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
			log.Printf("[DB] GetWidgets: Failed to scan widget row: %v", err)
			return nil, err
		}
		w.PageID = pageID.String
		w.Config = config.String
		w.Layout = layout.String
		widgets = append(widgets, w)
		log.Printf("[DB] GetWidgets: Loaded widget id=%s, type=%s", w.WidgetID, w.WidgetType)
	}
	
	log.Printf("[DB] GetWidgets: Successfully loaded %d widgets for page %s", len(widgets), pageID)
	return widgets, nil
}

func SaveWidgets(db *sql.DB, widgets []WidgetState) error {
	if len(widgets) == 0 {
		return fmt.Errorf("no widgets to save")
	}

	// 첫 번째 위젯에서 user_id와 page_id 추출 (모든 위젯이 같은 페이지에 속함)
	userID := widgets[0].UserID
	pageID := widgets[0].PageID
	
	log.Printf("[DB] SaveWidgets: Replacing all widgets for user=%s, page=%s with %d new widgets", userID, pageID, len(widgets))

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	// 1단계: 해당 페이지의 모든 기존 위젯 삭제 (완전 교체를 위해)
	deleteStmt, err := tx.Prepare("DELETE FROM widget_states WHERE user_id = ? AND page_id = ?")
	if err != nil {
		tx.Rollback()
		return err
	}
	deleteResult, err := deleteStmt.Exec(userID, pageID)
	deleteStmt.Close()
	if err != nil {
		tx.Rollback()
		return err
	}
	
	// 삭제된 위젯 수 로깅
	deletedCount, _ := deleteResult.RowsAffected()
	log.Printf("[DB] SaveWidgets: Deleted %d existing widgets for page %s", deletedCount, pageID)

	// 2단계: 새로운 위젯들 삽입
	insertStmt, err := tx.Prepare(`
		INSERT INTO widget_states (user_id, page_id, widget_id, widget_type, config, layout, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer insertStmt.Close()

	for i, w := range widgets {
		_, err := insertStmt.Exec(w.UserID, w.PageID, w.WidgetID, w.WidgetType, w.Config, w.Layout)
		if err != nil {
			log.Printf("[DB] SaveWidgets: Failed to insert widget %d (id=%s): %v", i+1, w.WidgetID, err)
			tx.Rollback()
			return err
		}
	}

	err = tx.Commit()
	if err != nil {
		log.Printf("[DB] SaveWidgets: Failed to commit transaction: %v", err)
		return err
	}
	
	log.Printf("[DB] SaveWidgets: Successfully saved %d widgets for page %s", len(widgets), pageID)
	return nil
}

func DeleteWidget(db *sql.DB, userID, pageID, widgetID string) error {
	log.Printf("[DB] DeleteWidget: Deleting widget user=%s, page=%s, widget=%s", userID, pageID, widgetID)
	
	// 삭제 전 위젯 존재 확인
	VerifyWidgetDeletion(db, userID, pageID, widgetID)
	
	query := "DELETE FROM widget_states WHERE user_id = ? AND page_id = ? AND widget_id = ?"
	result, err := db.Exec(query, userID, pageID, widgetID)
	
	if err != nil {
		log.Printf("[DB] DeleteWidget: Failed to delete widget %s: %v", widgetID, err)
		return err
	}
	
	rowsAffected, _ := result.RowsAffected()
	log.Printf("[DB] DeleteWidget: Successfully deleted widget %s (rows affected: %d)", widgetID, rowsAffected)
	
	if rowsAffected == 0 {
		log.Printf("[DB] DeleteWidget: Warning - No rows were affected, widget %s may not exist", widgetID)
	}
	
	// 삭제 후 검증
	VerifyWidgetDeletion(db, userID, pageID, widgetID)
	
	// 전체 위젯 상태 덤프 (디버깅용)
	DebugWidgetStates(db, userID)
	
	return nil
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

// DebugWidgetStates는 현재 데이터베이스의 모든 위젯 상태를 로그로 출력합니다 (디버깅 용도)
func DebugWidgetStates(db *sql.DB, userID string) {
	log.Printf("[DB] DebugWidgetStates: Dumping all widget states for user=%s", userID)
	
	query := "SELECT user_id, page_id, widget_id, widget_type FROM widget_states WHERE user_id = ? ORDER BY page_id, widget_id"
	rows, err := db.Query(query, userID)
	if err != nil {
		log.Printf("[DB] DebugWidgetStates: Query failed: %v", err)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var userID, pageID, widgetID, widgetType string
		if err := rows.Scan(&userID, &pageID, &widgetID, &widgetType); err != nil {
			log.Printf("[DB] DebugWidgetStates: Scan failed: %v", err)
			continue
		}
		log.Printf("[DB] DebugWidgetStates: [%d] user=%s, page=%s, widget=%s, type=%s", count+1, userID, pageID, widgetID, widgetType)
		count++
	}
	
	log.Printf("[DB] DebugWidgetStates: Total %d widgets found for user %s", count, userID)
}

// VerifyWidgetDeletion은 특정 위젯이 삭제되었는지 확인합니다
func VerifyWidgetDeletion(db *sql.DB, userID, pageID, widgetID string) {
	query := "SELECT COUNT(*) FROM widget_states WHERE user_id = ? AND page_id = ? AND widget_id = ?"
	var count int
	err := db.QueryRow(query, userID, pageID, widgetID).Scan(&count)
	if err != nil {
		log.Printf("[DB] VerifyWidgetDeletion: Query failed for widget %s: %v", widgetID, err)
		return
	}
	
	if count == 0 {
		log.Printf("[DB] VerifyWidgetDeletion: ✅ Widget %s successfully deleted from database", widgetID)
	} else {
		log.Printf("[DB] VerifyWidgetDeletion: ❌ Widget %s still exists in database (count=%d)", widgetID, count)
	}
}
