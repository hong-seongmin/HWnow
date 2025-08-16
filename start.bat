@echo off

TITLE HWnow Launcher

:: ===================================================================
::  Configuration Check
:: ===================================================================
if not exist "config.json" (
    echo [INFO] Creating default config.json file...
    echo {> config.json
    echo   "server": {>> config.json
    echo     "port": 8080,>> config.json
    echo     "host": "localhost">> config.json
    echo   },>> config.json
    echo   "database": {>> config.json
    echo     "filename": "monitoring.db">> config.json
    echo   },>> config.json
    echo   "monitoring": {>> config.json
    echo     "interval_seconds": 2,>> config.json
    echo     "enable_cpu_monitoring": true,>> config.json
    echo     "enable_memory_monitoring": true,>> config.json
    echo     "enable_disk_monitoring": true,>> config.json
    echo     "enable_network_monitoring": true>> config.json
    echo   },>> config.json
    echo   "ui": {>> config.json
    echo     "auto_open_browser": false,>> config.json
    echo     "theme": "system">> config.json
    echo   }>> config.json
    echo }>> config.json
    echo [INFO] Default config.json created.
    echo.
)

:: ===================================================================
::  HWnow Launcher
:: ===================================================================
echo ===================================================================
echo  HWnow Launcher
echo ===================================================================
echo.
echo  [1] Build and Run
echo  [2] Build Only
echo.

:: Use command line argument if provided, otherwise ask for user input
if "%1" NEQ "" (
    set MODE=%1
    echo Mode %1 selected
) else (
    set /p MODE="Select mode (1 or 2): "
)

:: ===================================================================
::  Mode 1: Build and Run
:: ===================================================================
if "%MODE%"=="1" (
    echo.
    echo Building and running HWnow...
    
    call :check_requirements
    call :kill_existing_processes
    call :build_frontend
    call :build_backend
    
    echo.
    echo Starting HWnow...
    echo ===================================================================
    echo      HWnow is running (check console for actual port)
    echo      Default: http://localhost:8080 (configurable via config.json)
    echo      Press Ctrl+C to stop
    echo ===================================================================
    call .\HWnow.exe
    goto end
)

:: ===================================================================
::  Mode 2: Build Only
:: ===================================================================
if "%MODE%"=="2" (
    echo.
    echo Building HWnow executable...
    
    call :check_requirements
    call :build_frontend
    call :build_backend
    
    echo.
    echo ===================================================================
    echo  Build Complete!
    echo ===================================================================
    echo  Created: HWnow.exe
    for %%I in (HWnow.exe) do echo  Size: %%~zI bytes
    echo.
    echo  Usage: Run HWnow.exe and check console for port (default: 8080)
    echo ===================================================================
    goto end
)

echo [ERROR] Invalid selection. Please enter 1 or 2.
pause
exit /b

:: ===================================================================
::  Functions
:: ===================================================================
:check_requirements
echo [1/4] Checking requirements...

echo [DEBUG] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from: https://nodejs.org/
    pause
    exit /b
)
echo [DEBUG] Node.js OK

echo [DEBUG] Checking NPM...
echo [DEBUG] NPM OK (skipped - Node.js includes NPM)

echo [DEBUG] Checking Go...
go version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Go not found. Install from: https://go.dev/dl/
    pause
    exit /b
)
echo [DEBUG] Go OK

echo Requirements OK
goto :eof

:kill_existing_processes
echo [1.5/4] Stopping existing processes...

:: Kill existing HWnow.exe processes
echo [INFO] Checking for existing HWnow.exe processes...
taskkill /IM "HWnow.exe" /F >NUL 2>&1
if "%ERRORLEVEL%"=="0" (
    echo [INFO] Existing HWnow.exe process terminated successfully.
    ping 127.0.0.1 -n 3 >NUL 2>&1
) else (
    echo [INFO] No existing HWnow.exe process found.
)

echo Process cleanup complete
goto :eof

:build_frontend
echo [2/4] Building frontend...
cd frontend

:: Check if dist already exists and skip npm steps if so
if exist "dist" (
    echo [INFO] Frontend already built, skipping npm steps...
    cd ..
    echo Frontend build complete
    goto :eof
)

:: Install or update dependencies with timeout
echo [INFO] Installing/updating dependencies...
if not exist "node_modules" (
    call npm install --no-optional --silent
) else (
    call npm ci --silent
)

if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    cd ..
    pause
    exit /b
)

:: Build frontend
echo [INFO] Building frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build frontend.
    cd ..
    pause
    exit /b
)

cd ..
echo Frontend build complete
goto :eof

:build_backend
echo [3/4] Building backend...

:: Copy frontend files
if exist "backend\\dist" rmdir /s /q "backend\\dist"
xcopy "frontend\\dist" "backend\\dist" /E /I /Q
if errorlevel 1 (
    echo [ERROR] Failed to copy frontend files.
    pause
    exit /b
)

:: Build Go executable
cd backend
go build -o ..\HWnow.exe main.go
if errorlevel 1 (
    echo [ERROR] Failed to build backend.
    cd ..
    pause
    exit /b
)
cd ..

echo Backend build complete
goto :eof

:end
echo.
pause