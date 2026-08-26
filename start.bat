@echo off
title EpiSpot - Dashboard Launcher
color 0B

echo ======================================================
echo           EPISPOT CONSOLIDATED ENGINE
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting EpiSpot Consolidated Server (FastAPI)...
:: Check if venv exists, otherwise use system python
set VENV_CMD=
if exist "backend\venv\Scripts\activate.bat" (
    set VENV_CMD=call backend\venv\Scripts\activate.bat ^&^& 
) else if exist ".venv\Scripts\activate.bat" (
    set VENV_CMD=call .venv\Scripts\activate.bat ^&^& 
)

:: Start consolidated Uvicorn server in a new window
start "EpiSpot Server" cmd /k "%VENV_CMD% cd backend && python -m uvicorn main:app --reload --port 8080"

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
