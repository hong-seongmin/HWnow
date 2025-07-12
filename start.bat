@echo off

:: ===================================================================
::  Administrator Check
:: ===================================================================
>nul 2>&1 "%SYSTEMROOT%\\system32\\cacls.exe" "%SYSTEMROOT%\\system32\\config\\system"
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

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
::  2. Clean and install frontend dependencies
:: ===================================================================
echo [2/4] Cleaning and installing frontend dependencies...

:: Change to the project directory to ensure correct paths
cd /d "%~dp0"

echo      -> Cleaning npm cache...
call npm cache clean --force >nul 2>&1

echo      -> Removing old node_modules and package-lock.json...
if exist "frontend\node_modules" rmdir /s /q "frontend\node_modules"
if exist "frontend\package-lock.json" del /f /q "frontend\package-lock.json"

echo      -> Installing dependencies...
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

echo.
echo ===================================================================
echo.
echo      HWnow is running.
echo      Access it at: http://localhost:8080
echo.
echo      To stop the server, press Ctrl+C in this window.
echo.
echo ===================================================================

call .\\HWnow.exe

echo.
echo ===================================================================
echo Server has been stopped or an error occurred.
pause 