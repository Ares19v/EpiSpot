@echo off
:: EpiSpot Clean Uninstallation Script

echo ======================================================
echo           EPISPOT AUTOMATED CLEAN UNINSTALL
echo ======================================================
echo.

set /p CONFIRM="Are you sure you want to uninstall EpiSpot and delete local virtualenvs? (Y/N): "
if /i "%CONFIRM%" neq "Y" (
    echo [UNINSTALL] Cancelled.
    pause
    exit /b 0
)

echo.
echo [UNINSTALL] Stopping any active python/uvicorn server instances...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im uvicorn.exe >nul 2>&1

echo [UNINSTALL] Deleting Python Virtual Environment (.venv)...
if exist .venv (
    rmdir /s /q .venv
)

echo [UNINSTALL] Cleaning local Python cache logs...
for /r %%d in (__pycache__) do @if exist "%%d" rmdir /s /q "%%d"

echo.
echo ======================================================
echo           ✅ UNINSTALLATION COMPLETE!
echo ======================================================
echo.
pause
