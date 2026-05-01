@echo off
setlocal

set "ROOT=%~dp0"
set "SERVER_DIR=%ROOT%server"
set "CLIENT_DIR=%ROOT%client"
set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

echo [System] Checking project environment...

if not exist "%SERVER_DIR%\package.json" (
  echo [Error] Backend folder not found: "%SERVER_DIR%"
  goto :fail
)

if not exist "%CLIENT_DIR%\package.json" (
  echo [Error] Frontend folder not found: "%CLIENT_DIR%"
  goto :fail
)

where node >nul 2>nul
if errorlevel 1 (
  echo [Error] Node.js was not found in PATH.
  goto :fail
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Error] npm was not found in PATH.
  goto :fail
)

pushd "%SERVER_DIR%"
node scripts\validate_env.js
if errorlevel 1 (
  popd
  echo [Error] server\.env is incomplete.
  goto :fail
)

node scripts\check_db.js
if errorlevel 1 (
  popd
  echo [Error] Database connection failed. Check server\.env and your local MySQL credentials.
  goto :fail
)
popd

echo [Backend] Starting backend service...
start "Backend Server" cmd /k "cd /d ""%SERVER_DIR%"" && npm start"

echo [Frontend] Starting frontend service...
start "Frontend Client" cmd /k "cd /d ""%CLIENT_DIR%"" && npm run dev"

echo [Done] Frontend: http://localhost:5173
echo [Done] Backend : http://localhost:3788
exit /b 0

:fail
echo [System] Startup aborted.
if not defined NO_PAUSE pause
exit /b 1
