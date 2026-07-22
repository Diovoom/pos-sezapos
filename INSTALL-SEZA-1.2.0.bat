@echo off
setlocal
cd /d "%~dp0"
echo.
echo ==========================================
echo   SEZA POS 1.2.0 - Install and Validate
echo ==========================================
echo.
echo Installing required packages...
call npm install --legacy-peer-deps
if errorlevel 1 goto :error

echo.
echo Synchronizing Android plugins...
call npx cap sync android
if errorlevel 1 goto :error

echo.
echo Building SEZA POS...
call npm run build
if errorlevel 1 goto :error

echo.
echo SUCCESS: SEZA POS 1.2.0 built successfully.
echo Next: git add . ^&^& git commit -m "SEZA POS major update 1.2.0" ^&^& git push
pause
exit /b 0

:error
echo.
echo INSTALL STOPPED: Review the error above. Your existing project files were not deleted.
pause
exit /b 1
