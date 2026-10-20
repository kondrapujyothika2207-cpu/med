@echo off
setlocal
title MedTrack RFID - Start Frontend and Backend
cd /d "%~dp0"
echo.
echo  MedTrack RFID - local development launcher
echo  -------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node.js 20+ first.
  pause
  exit /b 1
)
if not exist "backend\.env" (
  copy "backend\.env.example" "backend\.env" >nul
  echo Created backend\.env from example. Edit DATABASE_URL and secrets before running.
)
if not exist "frontend\.env" (
  copy "frontend\.env.example" "frontend\.env" >nul
)
echo Installing backend dependencies if needed...
start "MedTrack Backend" cmd /k "cd /d ""%~dp0backend"" && npm install && npm run dev"
echo Installing frontend dependencies if needed...
start "MedTrack Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm install && npm run dev -- --host 0.0.0.0"
echo.
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:5173
echo.
echo IMPORTANT: Ensure PostgreSQL is running and backend\.env is configured.
echo Press any key to close this launcher; server windows will remain open.
pause >nul
