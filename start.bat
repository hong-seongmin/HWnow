@echo off

TITLE HWnow Unified Launcher

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
    echo [INFO] Default config.json created. You can edit it to customize settings.
    echo.
) else (
    echo [INFO] Using existing config.json
)

:: ===================================================================
::  HWnow Unified Launcher
:: ===================================================================
echo ===================================================================
echo  HWnow Unified Launcher
echo ===================================================================
echo.
echo  [1] Development Mode (Dev Environment)
echo  [2] Standalone Mode (Single Executable)
echo  [3] Build Standalone Only
echo.

:: Use command line argument if provided, otherwise ask for user input
if "%1" NEQ "" (
    set MODE=%1
    echo Command line argument: Mode %1 selected
) else (
    set /p MODE="Select mode (1, 2, or 3): "
)

:: ===================================================================
::  Mode 1: Development Mode
:: ===================================================================
if "%MODE%"=="1" (
    echo.
    echo Development mode selected...
    echo.
    
    echo [1/4] Checking for required programs...
    go version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Go is not found. Please install from https://go.dev/dl/
        pause
        exit /b
    )
    echo      ...Done
    echo.
    
    echo [2/4] Cleaning and installing frontend dependencies...
    cd /d "%~dp0"
    call npm cache clean --force >nul 2>&1
    if exist "frontend\node_modules" rmdir /s /q "frontend\node_modules"
    if exist "frontend\package-lock.json" del /f /q "frontend\package-lock.json"
    cd frontend
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        cd ..
        pause
        exit /b
    )
    cd ..
    echo      ...Done
    echo.
    
    echo [3/4] Building frontend...
    call npm run build --prefix frontend
    if errorlevel 1 (
        echo [ERROR] Failed to build frontend.
        pause
        exit /b
    )
    echo      ...Done
    echo.
    
    echo [4/4] Copying frontend files and building backend...
    if exist "backend\\dist" rmdir /s /q "backend\\dist"
    xcopy "frontend\\dist" "backend\\dist" /E /I /Q
    if errorlevel 1 (
        echo [ERROR] Failed to copy frontend files.
        pause
        exit /b
    )
    cd backend && go build -o ..\HWnow.exe main.go && cd ..
    if errorlevel 1 (
        echo [ERROR] Failed to build backend.
        pause
        exit /b
    )
    echo      ...Build complete: HWnow.exe
    echo.
    
    echo Starting HWnow in development mode...
    echo ===================================================================
    echo      HWnow is running
    echo      Access at: http://localhost:8080
    echo      To stop server, press Ctrl+C in this window
    echo ===================================================================
    call .\HWnow.exe
    goto end
)

:: ===================================================================
::  Mode 2: Standalone Mode
:: ===================================================================
if "%MODE%"=="2" (
    echo.
    echo Standalone mode selected...
    
    :: Check if standalone executable exists
    if exist "HWnow.exe" (
        echo Found existing HWnow.exe
        echo Starting standalone application...
        echo ===================================================================
        echo      HWnow.exe is running
        echo      Check console output for actual port (configurable via config.json)
        echo      To stop server, press Ctrl+C in this window
        echo ===================================================================
        call .\HWnow.exe
    ) else (
        echo HWnow.exe not found. Building first...
        goto build_standalone
    )
    goto end
)

:: ===================================================================
::  Mode 3: Build Standalone Only
:: ===================================================================
if "%MODE%"=="3" (
    goto build_standalone
)

echo [ERROR] Invalid selection. Please enter 1, 2, or 3.
pause
exit /b

:build_standalone
echo.
echo Building standalone executable...
echo.

echo [1/3] Building frontend...
cd frontend
call npm run build
if errorlevel 1 (
    echo [ERROR] Failed to build frontend.
    cd ..
    pause
    exit /b
)
cd ..
echo      ...Frontend build complete
echo.

echo [2/3] Copying frontend files to backend...
if exist "backend\\dist" rmdir /s /q "backend\\dist"
xcopy "frontend\\dist" "backend\\dist" /E /I /Q
if errorlevel 1 (
    echo [ERROR] Failed to copy frontend files.
    pause
    exit /b
)
echo      ...Files copied successfully
echo.

echo [3/3] Building standalone executable...
cd backend
go build -o ..\HWnow.exe main.go
if errorlevel 1 (
    echo [ERROR] Failed to build standalone executable.
    cd ..
    pause
    exit /b
)
cd ..

echo.
echo ===================================================================
echo  Build Complete!
echo ===================================================================
echo.
echo  Created: HWnow.exe
echo  Size: 
for %%I in (HWnow.exe) do echo    %%~zI bytes
echo.
echo  This single file contains:
echo  - Frontend web UI (embedded)
echo  - Backend API server
echo  - SQLite database (auto-created)
echo  - No external dependencies
echo.
echo  Usage:
echo    1. Run HWnow.exe
echo    2. Open browser to http://localhost:8080
echo.
echo ===================================================================

if "%MODE%"=="2" (
    echo.
    echo Starting standalone application...
    echo ===================================================================
    echo      HWnow.exe is running
    echo      Check console output for actual port (configurable via config.json)
    echo      To stop server, press Ctrl+C in this window
    echo ===================================================================
    call .\HWnow.exe
)

:end
echo.
echo ===================================================================
echo Application has been stopped.
pause