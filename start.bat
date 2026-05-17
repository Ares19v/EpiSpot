@echo off
title EpiSpot - Dashboard Launcher
color 0B

echo ======================================================
echo           EPISPOT CONSOLIDATED ENGINE
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting EpiSpot Consolidated Server (FastAPI)...
:: Check if venv exists
if not exist "backend\venv\Scripts\activate.bat" (
    echo [ERROR] Backend virtual environment not found!
    echo Please run test_all.bat first to diagnose.
    pause
    exit /b 1
)

:: Start consolidated Uvicorn server in a new window
start "EpiSpot Server" cmd /k "cd backend && venv\Scripts\activate && python -m uvicorn main:app --reload --port 8080"

echo [2/2] Launching Dashboard in your browser...
echo Waiting for server to initialize...
timeout /t 6 > nul
start http://localhost:8080/index.html

echo.
echo ======================================================
echo DASHBOARD IS RUNNING SUCCESSFULLY ON HP OMEN
echo URL: http://localhost:8080/index.html
echo ======================================================
echo.
pause
