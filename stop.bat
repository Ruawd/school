@echo off
setlocal EnableExtensions

set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

echo [System] Stopping development services...
call :kill_port 3788 Backend
call :kill_port 5173 Frontend
echo [System] Done.
if not defined NO_PAUSE pause
exit /b 0

:kill_port
set "PORT=%~1"
set "LABEL=%~2"
set "FOUND="

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo [%LABEL%] Closing PID %%a on port %PORT%...
  taskkill /f /pid %%a >nul 2>nul
)

if not defined FOUND echo [%LABEL%] Port %PORT% is not in use.
exit /b 0
