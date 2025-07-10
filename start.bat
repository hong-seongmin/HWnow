@echo on
TITLE HWnow Launcher

:: ===================================================================
::  1. Check for required programs (Go and Node.js)
:: ===================================================================
echo [1/4] Checking for required programs...

:: Check for Go by running 'go version'
go version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Go is not found. Please install from https://go.dev/dl/
    echo.
    pause
    exit /b
)

:: Check for Node.js by checking if npm exists
echo [INFO] Node.js/npm check skipped (PowerShell compatibility)

echo      ...Done
echo.
@echo off

:: ===================================================================
::  2. Check for and install frontend dependencies
:: ===================================================================
echo [2/4] Checking for frontend dependencies...
if not exist "frontend\\node_modules" (
    echo      -> Installing dependencies...
    call npm install --prefix frontend
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b
    )
)
echo      ...Done
echo.

:: ===================================================================
::  3. Build frontend static files
:: ===================================================================
echo [3/4] Building frontend...
call npm run build --prefix frontend
if errorlevel 1 (
    echo [ERROR] Failed to build frontend.
    pause
    exit /b
)
echo      ...Done
echo.

:: ===================================================================
::  4. Copy frontend files to backend and build
:: ===================================================================
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

:: ===================================================================
::  Start Application
:: ===================================================================
echo Starting HWnow...
start "HWnow" .\\HWnow.exe

echo.
echo ===================================================================
echo.
echo      HWnow is running.
echo      Access it at: http://localhost:8080
echo.
echo      This window will close automatically.
echo.
echo ===================================================================

timeout /t 5 >nul
exit 