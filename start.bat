@echo off

TITLE HWnow Wails Launcher

:: ===================================================================
::  HWnow Wails Desktop Application Launcher
:: ===================================================================
echo ===================================================================
echo  HWnow Wails Desktop Application Launcher
echo ===================================================================
echo.
echo  [1] Development Server (Live Reload)
echo  [2] Build Production Executable
echo.

:: Use command line argument if provided, otherwise ask for user input
if "%1" NEQ "" (
    set MODE=%1
    echo Mode %1 selected
) else (
    set /p MODE="Select mode (1 or 2): "
)

:: ===================================================================
::  Mode 1: Development Server with Live Reload
:: ===================================================================
if "%MODE%"=="1" (
    echo.
    echo Starting HWnow development server with live reload...
    
    call :check_requirements
    call :kill_existing_processes
    call :run_dev_server
    goto end
)

:: ===================================================================
::  Mode 2: Build Production Executable  
:: ===================================================================
if "%MODE%"=="2" (
    echo.
    echo Building HWnow production executable...
    
    call :check_requirements
    call :kill_existing_processes
    call :build_production
    goto end
)

echo [ERROR] Invalid selection. Please enter 1 or 2.
pause
exit /b

:: ===================================================================
::  Functions
:: ===================================================================
:check_requirements
echo [1/3] Checking requirements...

echo [INFO] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from: https://nodejs.org/
    pause
    exit /b
)
echo [INFO] Node.js OK

echo [INFO] Checking Go...
go version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Go not found. Install from: https://go.dev/dl/
    pause
    exit /b
)
echo [INFO] Go OK

echo [INFO] Checking Wails...
wails version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Wails not found. Install with: go install github.com/wailsapp/wails/v2/cmd/wails@latest
    pause
    exit /b
)
echo [INFO] Wails OK

echo Requirements verified successfully
goto :eof

:kill_existing_processes
echo [2/3] Stopping existing processes...

:: Kill all HWnow related processes (production and development versions)
set "PROCESS_KILLED=0"

taskkill /IM "HWnow.exe" /F >NUL 2>&1
if "%ERRORLEVEL%"=="0" (
    echo [INFO] Existing HWnow production process terminated.
    set "PROCESS_KILLED=1"
)

taskkill /IM "HWnow-wails-dev.exe" /F >NUL 2>&1
if "%ERRORLEVEL%"=="0" (
    echo [INFO] Existing HWnow development process terminated.
    set "PROCESS_KILLED=1"
)

:: Kill any process containing HWnow in the name (comprehensive cleanup)
wmic process where "name like '%%HWnow%%'" delete >NUL 2>&1
if "%ERRORLEVEL%"=="0" (
    echo [INFO] Additional HWnow processes terminated.
    set "PROCESS_KILLED=1"
)

if "%PROCESS_KILLED%"=="1" (
    echo [INFO] Waiting for processes to fully terminate...
    ping 127.0.0.1 -n 3 >NUL 2>&1
) else (
    echo [INFO] No existing HWnow processes found.
)
goto :eof

:run_dev_server
echo [3/3] Starting development server...

cd "HWnow-wails\HWnow-wails"

:: Check if frontend dependencies are installed
if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend dependencies...
    cd "frontend"
    npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        cd "..\.."
        pause
        exit /b
    )
    cd ".."
)

:: Run development server with live reload
echo [INFO] Starting Wails development server...
echo.
echo ===================================================================
echo      HWnow Development Server
echo      The desktop application will open automatically
echo      Changes will be automatically reloaded
echo      Press Ctrl+C to stop the development server
echo ===================================================================

wails dev
if errorlevel 1 (
    echo [ERROR] Failed to start development server.
)

cd "..\.."
goto :eof

:build_production
echo [3/3] Building production executable...

cd "HWnow-wails\HWnow-wails"

:: Check if frontend dependencies are installed
if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend dependencies...
    cd "frontend"
    npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        cd "..\.."
        pause
        exit /b
    )
    cd ".."
)

:: Build production version with optimizations
echo [INFO] Building production executable with optimizations...
wails build -clean -ldflags "-s -w" -trimpath
if errorlevel 1 (
    echo [ERROR] Failed to build production executable.
    cd "..\.."
    pause
    exit /b
)

:: Copy executable to root directory for convenience
if exist "build\bin\HWnow.exe" (
    copy "build\bin\HWnow.exe" "..\..\HWnow.exe"
    echo.
    echo ===================================================================
    echo  Production Build Complete!
    echo ===================================================================
    echo  Created: HWnow.exe
    for %%I in (..\..\HWnow.exe) do echo  Size: %%~zI bytes
    echo.
    echo  Usage: Double-click HWnow.exe to run the desktop application
    echo ===================================================================
) else (
    echo [ERROR] Production executable not found.
)

cd "..\.."
goto :eof

:end
echo.
pause