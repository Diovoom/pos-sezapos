@echo off
setlocal
cd /d "%~dp0"
title SEZA Homepage Update
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-update.ps1"
if errorlevel 1 (
  echo.
  echo The update was not installed. Read the error above.
  echo.
  pause
  exit /b 1
)
echo.
pause
