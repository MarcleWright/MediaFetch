@echo off
setlocal

cd /d "%~dp0"
set PORT=3200

if not exist node_modules (
  call npm install
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3200 ^| findstr LISTENING') do (
  taskkill /PID %%p /F >nul 2>nul
)

start "" /b node server.js
for /l %%i in (1,1,15) do (
  netstat -ano | findstr ":3200" | findstr LISTENING >nul
  if not errorlevel 1 goto :ready
  timeout /t 1 /nobreak >nul
)
:ready
start "" http://localhost:3200

endlocal
