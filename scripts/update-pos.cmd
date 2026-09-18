@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-pos.ps1"
exit /b %ERRORLEVEL%
