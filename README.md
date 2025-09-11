# HWnow: Real-time System Monitoring Desktop Application

A native desktop application built with **Go + React + TypeScript + Wails v2** that provides real-time monitoring of your computer's key resources (CPU, Memory, Disk, Network, GPU).

## ✨ Key Features

- **🖥️ Native Desktop App**: Cross-platform desktop application built with Wails v2 using web technologies
- **📊 Real-time Monitoring**: Real-time system resource data collection and visualization at 3-second intervals
- **🎛️ Comprehensive Widgets**: 
  - CPU usage and individual core monitoring
  - Memory usage and detailed information
  - Disk I/O and capacity information
  - Network usage and status
  - GPU usage and process monitoring
  - System uptime, battery, process management, and more
- **🎨 Customizable Dashboard**: 
  - Drag and drop widget positioning
  - Widget resizing with automatic saving
  - Widget management features (fullscreen, settings, remove)
- **🌙 Theme Support**: Light/Dark mode support
- **📱 Responsive Design**: UI optimized for various screen sizes

## 🚀 Quick Start

### 1. Prerequisites
- **[Go](https://go.dev/dl/)** (1.18 or higher) - for backend build
- **[Node.js](https://nodejs.org/)** (18.x or higher) - for frontend build
- **[Wails CLI](https://wails.io/docs/gettingstarted/installation)** - desktop app build tool

#### Install Wails CLI
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 2. Download Project & Run Development Server
```cmd
git clone https://github.com/hong-seongmin/HWnow
cd HWnow
start.bat 1
```

### 3. Production Build
```cmd
start.bat 2
```

## 📋 Usage

### Development Mode (Live Reload)
```cmd
start.bat 1
```
- Starts development server with automatic reload on code changes
- Native desktop window opens automatically
- Developer tools available

### Production Build
```cmd
start.bat 2
```
- Generates optimized standalone executable `HWnow-wails.exe` (~30-40MB)
- Final version for distribution

### Direct Execution
After build completion, double-click `HWnow-wails.exe` to run

## 🛠️ Technology Stack

- **Backend**: Go 1.24.5 + Wails v2
  - System monitoring: [gopsutil](https://github.com/shirou/gopsutil)
  - GPU monitoring: nvidia-smi integration
- **Frontend**: React 18 + TypeScript + Vite
  - State management: [Zustand](https://github.com/pmndrs/zustand)
  - Grid system: [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)
- **Desktop Framework**: [Wails v2](https://wails.io/)

## 🔧 Troubleshooting

### Go Installation Error
```
go: command not found
```
**Solution**: Install from [Go official site](https://go.dev/dl/) and verify environment variables

### Node.js Installation Error
```
npm: command not found
```
**Solution**: Install LTS version from [Node.js official site](https://nodejs.org/)

### Wails CLI Installation Error
```
wails: command not found
```
**Solution**: 
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### Frontend Dependency Installation Failed
```
npm install failed
```
**Solution**: 
```bash
cd HWnow-wails/HWnow-wails/frontend
rm -rf node_modules package-lock.json
npm install
```

### GPU Monitoring Not Working
- **NVIDIA GPU**: Verify nvidia-smi is in PATH
- **Other GPUs**: Currently only NVIDIA GPU supported

## ✅ Verified Build Environment

**Test Environment**: Windows 10/11, Go 1.24.5, Node.js v22.14.0, Wails v2.10.2

### Build Performance
- **Development Server Start**: 10-15 seconds (first run)
- **Production Build**: 1-2 minutes (including dependency downloads)
- **Final Executable Size**: 30-40MB (all dependencies included)

### Execution Verification
- ✅ Real-time CPU, Memory, Disk, Network, GPU monitoring
- ✅ 3-second interval data updates
- ✅ Drag and drop widget management
- ✅ Light/Dark theme switching
- ✅ Responsive layout

## 🎯 Key Widget Features

### CPU Monitoring
- Overall CPU usage
- Individual core usage
- CPU model name and core count display

### Memory Monitoring
- Real-time memory usage
- Available memory
- Memory usage percentage

### GPU Monitoring
- GPU usage (NVIDIA only)
- GPU process list
- GPU memory usage

### System Information
- System uptime
- Process monitoring
- Network status
- Battery information (laptops)

## 💖 Support & Sponsorship

If this project has been helpful, please consider supporting with a sponsorship!

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/oursophy)

**GitHub Repository**: [https://github.com/hong-seongmin/HWnow](https://github.com/hong-seongmin/HWnow)

## 📄 License

Apache License 2.0 - See [LICENSE](LICENSE) file for details.