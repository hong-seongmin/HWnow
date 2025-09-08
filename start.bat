@echo off

TITLE HWnow Wails Launcher

:: ===================================================================
::  HWnow Wails Application Launcher
:: ===================================================================
echo ===================================================================
echo  HWnow Wails Application Launcher
echo ===================================================================
echo.
echo  [1] Build and Run (Development)
echo  [2] Build Production Executable  
echo  [3] Run Development Server
echo  [4] Run Existing Wails Application
echo.

:: Use command line argument if provided, otherwise ask for user input
if "%1" NEQ "" (
    set MODE=%1
    echo Mode %1 selected
) else (
    set /p MODE="Select mode (1, 2, 3, or 4): "
)

:: ===================================================================
::  Mode 1: Build and Run (Development)
:: ===================================================================
if "%MODE%"=="1" (
    echo.
    echo Building and running HWnow Wails application...
    
    call :check_requirements
    call :kill_existing_processes
    call :build_and_run_dev
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

:: ===================================================================
::  Mode 3: Run Development Server
:: ===================================================================
if "%MODE%"=="3" (
    echo.
    echo Starting HWnow development server...
    
    call :check_requirements
    call :kill_existing_processes
    call :run_dev_server
    goto end
)

:: ===================================================================
::  Mode 4: Run Existing Wails Application
:: ===================================================================
if "%MODE%"=="4" (
    echo.
    echo Running existing HWnow Wails application...
    
    call :kill_existing_processes
    call :run_wails_app
    goto end
)

echo [ERROR] Invalid selection. Please enter 1, 2, 3, or 4.
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

echo [DEBUG] Checking Go...
go version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Go not found. Install from: https://go.dev/dl/
    pause
    exit /b
)
echo [DEBUG] Go OK

echo [DEBUG] Checking Wails...
wails version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Wails not found. Install with: go install github.com/wailsapp/wails/v2/cmd/wails@latest
    pause
    exit /b
)
echo [DEBUG] Wails OK

echo Requirements OK
goto :eof

:kill_existing_processes
echo [1.5/4] Stopping existing processes...

:: Kill existing HWnow processes
echo [INFO] Checking for existing HWnow processes...
taskkill /IM "HWnow-wails.exe" /F >NUL 2>&1
taskkill /IM "HWnow.exe" /F >NUL 2>&1
if "%ERRORLEVEL%"=="0" (
    echo [INFO] Existing HWnow process terminated successfully.
    ping 127.0.0.1 -n 3 >NUL 2>&1
) else (
    echo [INFO] No existing HWnow process found.
)

echo Process cleanup complete
goto :eof

:build_and_run_dev
echo [2/4] Building and running Wails application in development mode...

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

:: Build and run with Wails with performance optimizations
:: CPU optimization: Remove legacy WebView2 loader, add performance flags
echo [INFO] Starting Wails optimized build with performance flags...
wails build -ldflags "-s -w" -trimpath
if errorlevel 1 (
    echo [ERROR] Failed to build Wails application.
    cd "..\.."
    pause
    exit /b
)

echo.
echo ===================================================================
echo      HWnow Wails Application Built Successfully!
echo      Running the application...
echo ===================================================================

:: Run the built application
if exist "build\bin\HWnow-wails.exe" (
    start "" "build\bin\HWnow-wails.exe"
    echo [INFO] HWnow application started successfully!
) else (
    echo [ERROR] Built executable not found.
)

cd "..\.."
goto :eof

:build_production
echo [2/4] Building production executable...

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

:: Build production version with performance optimizations
:: CPU optimization: Remove legacy WebView2 loader, add performance flags
echo [INFO] Building production executable with performance optimizations...
wails build -clean -ldflags "-s -w" -trimpath
if errorlevel 1 (
    echo [ERROR] Failed to build production executable.
    cd "..\.."
    pause
    exit /b
)

:: Copy executable to root directory for convenience
if exist "build\bin\HWnow-wails.exe" (
    copy "build\bin\HWnow-wails.exe" "..\..\HWnow-wails.exe"
    echo.
    echo ===================================================================
    echo  Production Build Complete!
    echo ===================================================================
    echo  Created: HWnow-wails.exe
    for %%I in (..\..\HWnow-wails.exe) do echo  Size: %%~zI bytes
    echo.
    echo  Usage: Double-click HWnow-wails.exe to run the application
    echo ===================================================================
) else (
    echo [ERROR] Production executable not found.
)

cd "..\.."
goto :eof

:run_dev_server
echo [2/4] Starting development server...

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
:: CPU optimization: Remove legacy WebView2 loader
echo [INFO] Starting Wails development server with live reload...
echo.
echo ===================================================================
echo      HWnow Development Server
echo      The application will open automatically
echo      Changes will be automatically reloaded
echo      Optimized for performance
echo      Press Ctrl+C to stop
echo ===================================================================

wails dev
if errorlevel 1 (
    echo [ERROR] Failed to start development server.
)

cd "..\.."
goto :eof

:run_wails_app
echo [2/2] Running existing HWnow Wails application...

:: CPU optimization: Executable priority specification
:: Priority: build\bin\HWnow-wails.exe > HWnow-wails\HWnow-wails\build\bin\HWnow-wails.exe > HWnow-wails.exe
if exist "HWnow-wails\HWnow-wails\build\bin\HWnow-wails.exe" (
    echo [INFO] Starting HWnow Wails application from build directory...
    echo [INFO] Executable: HWnow-wails\HWnow-wails\build\bin\HWnow-wails.exe
    echo.
    echo ===================================================================
    echo      HWnow Wails Application (Latest Build)
    echo      Native desktop application with system tray support
    echo      Press Alt+F4 or use File->Quit to exit
    echo ===================================================================
    
    start "" "HWnow-wails\HWnow-wails\build\bin\HWnow-wails.exe"
    echo [INFO] HWnow Wails application started successfully!
) else if exist "HWnow-wails.exe" (
    echo [INFO] Starting HWnow Wails application from root directory...
    echo [INFO] Executable: HWnow-wails.exe
    echo.
    echo ===================================================================
    echo      HWnow Wails Application (Root Copy)
    echo      Native desktop application with system tray support
    echo      Press Alt+F4 or use File->Quit to exit
    echo ===================================================================
    
    start "" "HWnow-wails.exe"
    echo [INFO] HWnow Wails application started successfully!
) else (
    echo [ERROR] HWnow-wails.exe not found in any expected location.
    echo.
    echo Expected locations:
    echo   1. HWnow-wails\HWnow-wails\build\bin\HWnow-wails.exe (Latest build)
    echo   2. HWnow-wails.exe (Root directory copy)
    echo.
    echo Please build the application first using mode 1 or 2.
    echo.
    echo Available executables:
    if exist "HWnow.exe" echo   - HWnow.exe (Legacy version - not recommended)
    if exist "HWnow-wails\HWnow-wails\*.exe" echo   - Found other executables in build directory
    echo.
    pause
)
goto :eof

:end
echo.
pause