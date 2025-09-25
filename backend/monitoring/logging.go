package monitoring

import (
	"fmt"
	"io"
	"log"
	"os"
)

// 로깅 레벨 정의
type LogLevel int

const (
	LogLevelDebug LogLevel = iota
	LogLevelInfo
	LogLevelWarn
	LogLevelError
	LogLevelFatal
)

var (
	logLevel = LogLevelInfo
	logFile  *os.File
)

// InitializeLogging - 로깅 시스템 초기화
func InitializeLogging(level LogLevel, logFilePath string) error {
	logLevel = level

	if logFilePath != "" {
		var err error
		logFile, err = os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			return fmt.Errorf("failed to open log file: %v", err)
		}

		// 멀티 라이터로 파일과 콘솔 모두에 출력
		multiWriter := io.MultiWriter(os.Stdout, logFile)
		log.SetOutput(multiWriter)
	}

	log.SetFlags(log.LstdFlags | log.Lshortfile)
	LogInfo("Logging system initialized", "level", level, "file", logFilePath)

	return nil
}

// CloseLogging - 로깅 시스템 종료
func CloseLogging() {
	if logFile != nil {
		logFile.Close()
	}
}

// 로깅 함수들
func LogDebug(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelDebug {
		args := []interface{}{"[DEBUG]", message}
		args = append(args, keyvals...)
		log.Println(args...)
	}
}

func LogInfo(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelInfo {
		args := []interface{}{"[INFO]", message}
		args = append(args, keyvals...)
		log.Println(args...)
	}
}

func LogWarn(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelWarn {
		args := []interface{}{"[WARN]", message}
		args = append(args, keyvals...)
		log.Println(args...)
	}
}

func LogError(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelError {
		args := []interface{}{"[ERROR]", message}
		args = append(args, keyvals...)
		log.Println(args...)
	}
}

func LogFatal(message string, keyvals ...interface{}) {
	if logLevel <= LogLevelFatal {
		args := []interface{}{"[FATAL]", message}
		args = append(args, keyvals...)
		log.Fatalln(args...)
	}
}
