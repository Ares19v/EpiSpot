@echo off
title EpiSpot - Dashboard Launcher
color 0B

echo ======================================================
echo           EPISPOT CONSOLIDATED LAUNCHER
echo ======================================================
echo.

cd /d "%~dp0"

:: Detect Python Environment (System or VirtualEnv)
set USE_VENV=0
if exist ".venv\Scripts\activate.bat" (
    set USE_VENV=1
    set VENV_CMD=call .venv\Scripts\activate.bat
) else if exist "backend\venv\Scripts\activate.bat" (
    set USE_VENV=1
    set VENV_CMD=call backend\venv\Scripts\activate.bat
)

echo [1/2] Starting EpiSpot Consolidated Server (FastAPI)...
:: Start consolidated Uvicorn server in a new command window
if %USE_VENV% == 1 (
    start "EpiSpot Server" cmd /k "%VENV_CMD% && cd backend && python -m uvicorn main:app --reload --port 8080"
) else (
    start "EpiSpot Server" cmd /k "cd backend && python -m uvicorn main:app --reload --port 8080"
)

echo [2/2] Launching Dashboard in your browser...
echo Waiting 5 seconds for server to initialize...
timeout /t 5 > nul
start http://localhost:8080/index.html

echo.
echo ======================================================
echo DASHBOARD IS RUNNING SUCCESSFULLY
echo URL: http://localhost:8080/index.html
echo ======================================================
echo.
pause
