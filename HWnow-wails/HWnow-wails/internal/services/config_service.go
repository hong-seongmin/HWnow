package services

import (
	"encoding/json"
	"fmt"
	"os"
)

// ServerConfig represents server configuration
type ServerConfig struct {
	Port int    `json:"port"`
	Host string `json:"host"`
}

// DatabaseConfig represents database configuration
type DatabaseConfig struct {
	Filename string `json:"filename"`
}

// MonitoringConfig represents monitoring configuration
type MonitoringConfig struct {
	IntervalSeconds         int  `json:"interval_seconds"`         // Default interval for performance metrics
	SecurityCheckSeconds    int  `json:"security_check_seconds"`   // Security checks interval (longer)
	GPUInfoCacheSeconds     int  `json:"gpu_info_cache_seconds"`   // GPU hardware info caching
	RegistryCacheSeconds    int  `json:"registry_cache_seconds"`   // Registry query caching
	EnableCpuMonitoring     bool `json:"enable_cpu_monitoring"`
	EnableMemoryMonitoring  bool `json:"enable_memory_monitoring"`
	EnableDiskMonitoring    bool `json:"enable_disk_monitoring"`
	EnableNetworkMonitoring bool `json:"enable_network_monitoring"`
}

// UIConfig represents UI configuration
type UIConfig struct {
	AutoOpenBrowser bool   `json:"auto_open_browser"`
	Theme          string `json:"theme"`
}

// Config structure for application configuration
type Config struct {
	Server     ServerConfig     `json:"server"`
	Database   DatabaseConfig   `json:"database"`
	Monitoring MonitoringConfig `json:"monitoring"`
	UI         UIConfig         `json:"ui"`
}

// ConfigService provides configuration management functionality
type ConfigService struct {
	configPath string
}

// NewConfigService creates a new configuration service
func NewConfigService(configPath string) *ConfigService {
	return &ConfigService{
		configPath: configPath,
	}
}

// LoadConfig loads configuration from the specified path
func (cs *ConfigService) LoadConfig() (*Config, error) {
	return LoadConfig(cs.configPath)
}

// LoadConfig loads configuration from file or returns default config
func LoadConfig(configPath string) (*Config, error) {
	// Check if config file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Create default config file
		defaultConfig := getDefaultConfig()
		if saveErr := saveConfig(configPath, &defaultConfig); saveErr != nil {
			return &defaultConfig, fmt.Errorf("failed to save default config: %v", saveErr)
		}
		return &defaultConfig, nil
	}

	// Read existing config file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %v", err)
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		// If parsing fails, return default config
		defaultConfig := getDefaultConfig()
		return &defaultConfig, fmt.Errorf("failed to parse config (using defaults): %v", err)
	}

	// Validate and fill in missing values with defaults
	config = validateAndFillDefaults(config)

	return &config, nil
}

// SaveConfig saves configuration to file
func (cs *ConfigService) SaveConfig(config *Config) error {
	return saveConfig(cs.configPath, config)
}

// saveConfig saves configuration to the specified path
func saveConfig(configPath string, config *Config) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %v", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %v", err)
	}

	return nil
}

// GetDefaultConfig returns default configuration
func (cs *ConfigService) GetDefaultConfig() Config {
	return getDefaultConfig()
}

// getDefaultConfig returns default configuration values
func getDefaultConfig() Config {
	return Config{
		Server: ServerConfig{
			Port: 8080,
			Host: "localhost",
		},
		Database: DatabaseConfig{
			Filename: "hwinfo.db",
		},
		Monitoring: MonitoringConfig{
			IntervalSeconds:         1,
			SecurityCheckSeconds:    30,
			GPUInfoCacheSeconds:     600,
			RegistryCacheSeconds:    300,
			EnableCpuMonitoring:     true,
			EnableMemoryMonitoring:  true,
			EnableDiskMonitoring:    true,
			EnableNetworkMonitoring: true,
		},
		UI: UIConfig{
			AutoOpenBrowser: true,
			Theme:          "dark",
		},
	}
}

// validateAndFillDefaults ensures all config values are valid and fills in defaults for missing values
func validateAndFillDefaults(config Config) Config {
	defaults := getDefaultConfig()

	// Server config validation
	if config.Server.Port <= 0 || config.Server.Port > 65535 {
		config.Server.Port = defaults.Server.Port
	}
	if config.Server.Host == "" {
		config.Server.Host = defaults.Server.Host
	}

	// Database config validation
	if config.Database.Filename == "" {
		config.Database.Filename = defaults.Database.Filename
	}

	// Monitoring config validation
	if config.Monitoring.IntervalSeconds <= 0 {
		config.Monitoring.IntervalSeconds = defaults.Monitoring.IntervalSeconds
	}
	if config.Monitoring.SecurityCheckSeconds <= 0 {
		config.Monitoring.SecurityCheckSeconds = defaults.Monitoring.SecurityCheckSeconds
	}
	if config.Monitoring.GPUInfoCacheSeconds <= 0 {
		config.Monitoring.GPUInfoCacheSeconds = defaults.Monitoring.GPUInfoCacheSeconds
	}
	if config.Monitoring.RegistryCacheSeconds <= 0 {
		config.Monitoring.RegistryCacheSeconds = defaults.Monitoring.RegistryCacheSeconds
	}

	// UI config validation
	if config.UI.Theme == "" {
		config.UI.Theme = defaults.UI.Theme
	}

	return config
}