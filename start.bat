@echo off
TITLE Monitoring App Launcher

echo Building Backend...
cd backend
go build -o monitoring-app.exe main.go
cd ..
echo Build complete.
echo.

echo Starting Backend and Frontend servers...
echo.

REM Start Backend Server (built executable)
start "Backend" cmd /c "cd backend && .\\monitoring-app.exe"

REM Start Frontend Server
start "Frontend" cmd /c "cd frontend && npm run dev"

echo.
echo Servers are running in separate windows.
echo.
echo ===================================================================
echo.
echo           TO STOP ALL SERVERS: PRESS ANY KEY IN THIS WINDOW
echo.
echo           (Do NOT close this window with the 'X' button)
echo.
echo ===================================================================
echo.
pause >nul

echo Stopping servers...
taskkill /IM monitoring-app.exe /F >nul
FOR /F "tokens=5" %%T IN ('netstat -a -n -o ^| findstr "LISTENING" ^| findstr ":5173"') DO (
    taskkill /PID %%T /F
)
echo Servers stopped.

echo.
echo Servers are starting up in separate command prompt windows.
echo Please check those windows for status and logs.
echo.
echo Once started, the application will be available at: http://localhost:5173
echo. 