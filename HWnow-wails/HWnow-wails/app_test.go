package main

import (
    "context"
    "encoding/json"
    "os"
    "path/filepath"
    "testing"
)

func TestNewAppInitialisesService(t *testing.T) {
    app := NewApp()
    if app.appService == nil {
        t.Fatalf("expected appService to be initialised")
    }
}

func TestAppGreetReturnsFormattedMessage(t *testing.T) {
    app := NewApp()
    name := "HWnow"
    got := app.Greet(name)
    want := "Hello HWnow, It's show time!"
    if got != want {
        t.Fatalf("Greet(%q) = %q, want %q", name, got, want)
    }
}

func TestLoadConfigReturnsDefaultWhenFileMissing(t *testing.T) {
    tempDir := t.TempDir()
    cfgPath := filepath.Join(tempDir, "missing-config.json")

    cfg, err := LoadConfig(cfgPath)
    if err != nil {
        t.Fatalf("LoadConfig returned error for missing file: %v", err)
    }

    def := getDefaultConfig()
    if cfg.Server.Port != def.Server.Port || cfg.Database.Filename != def.Database.Filename {
        t.Fatalf("LoadConfig returned unexpected config for missing file: %+v", cfg)
    }
}

func TestLoadConfigReadsExistingFile(t *testing.T) {
    tempDir := t.TempDir()
    cfgPath := filepath.Join(tempDir, "config.json")

    expected := Config{
        Server: ServerConfig{Port: 9090, Host: "0.0.0.0"},
        Database: DatabaseConfig{Filename: "test.db"},
        Monitoring: MonitoringConfig{
            IntervalSeconds:         5,
            SecurityCheckSeconds:    15,
            GPUInfoCacheSeconds:     60,
            RegistryCacheSeconds:    120,
            EnableCpuMonitoring:     true,
            EnableMemoryMonitoring:  false,
            EnableDiskMonitoring:    true,
            EnableNetworkMonitoring: false,
        },
        UI: UIConfig{AutoOpenBrowser: false, Theme: "light"},
    }

    data, err := json.Marshal(expected)
    if err != nil {
        t.Fatalf("failed to marshal test config: %v", err)
    }
    if err := os.WriteFile(cfgPath, data, 0o644); err != nil {
        t.Fatalf("failed to write test config: %v", err)
    }

    cfg, err := LoadConfig(cfgPath)
    if err != nil {
        t.Fatalf("LoadConfig returned error: %v", err)
    }

    if cfg.Server != expected.Server {
        t.Fatalf("server config mismatch: got %+v want %+v", cfg.Server, expected.Server)
    }
    if cfg.Database != expected.Database {
        t.Fatalf("database config mismatch: got %+v want %+v", cfg.Database, expected.Database)
    }
    if cfg.Monitoring.IntervalSeconds != expected.Monitoring.IntervalSeconds ||
        cfg.Monitoring.SecurityCheckSeconds != expected.Monitoring.SecurityCheckSeconds ||
        cfg.Monitoring.EnableMemoryMonitoring != expected.Monitoring.EnableMemoryMonitoring {
        t.Fatalf("monitoring config mismatch: got %+v want %+v", cfg.Monitoring, expected.Monitoring)
    }
    if cfg.UI != expected.UI {
        t.Fatalf("UI config mismatch: got %+v want %+v", cfg.UI, expected.UI)
    }
}

func TestOnStartupStoresContext(t *testing.T) {
    app := NewApp()
    ctx := context.Background()
    app.OnStartup(ctx)
    if app.ctx != ctx {
        t.Fatalf("expected context to be stored on startup")
    }
}
