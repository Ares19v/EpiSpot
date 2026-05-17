@echo off
title EpiSpot - Dashboard Launcher
color 0B

echo ======================================================
echo           EPISPOT CONSOLIDATED LAUNCHER
echo ======================================================
echo.

cd /d "%~dp0"

:: Detect virtualenv
set VENV_PATH=""
if exist ".venv\Scripts\activate.bat" (
    set VENV_PATH=".venv"
) else if exist "backend\venv\Scripts\activate.bat" (
    set VENV_PATH="backend\venv"
)

if %VENV_PATH% == "" (
    echo [WARN] Python Virtual Environment not found!
    echo Attempting to automatically set up by running INSTALL.bat...
    echo.
    call INSTALL.bat
    if not exist ".venv\Scripts\activate.bat" (
        echo [ERROR] Automatic setup failed. Please run INSTALL.bat manually.
        pause
        exit /b 1
    )
    set VENV_PATH=".venv"
)

echo [1/2] Starting EpiSpot Consolidated Server (FastAPI)...
:: Start consolidated Uvicorn server in a new command window
if %VENV_PATH% == ".venv" (
    start "EpiSpot Server" cmd /k "call .venv\Scripts\activate.bat && cd backend && python -m uvicorn main:app --reload --port 8080"
) else (
    start "EpiSpot Server" cmd /k "cd backend && call venv\Scripts\activate.bat && python -m uvicorn main:app --reload --port 8080"
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
