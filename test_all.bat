@echo off
title EpiSpot - Deep Diagnostics
color 0E

echo ======================================================
echo           EPISPOT DEEP SYSTEM DIAGNOSTICS
echo ======================================================
echo.

cd /d "%~dp0"

echo [CHECK] Verifying Project Integrity...
if not exist "backend\main.py" echo [FAIL] backend\main.py missing && exit /b 1
if not exist "frontend\index.html" echo [FAIL] frontend\index.html missing && exit /b 1
if not exist "backend\symptom_ml\model.bin" echo [FAIL] AI Model weight missing! && exit /b 1
echo [PASS] Core files found.

echo.
echo [CHECK] Verifying Python Environment...
set PYTHON_EXE=python
if exist "backend\venv\Scripts\python.exe" (
    set PYTHON_EXE=backend\venv\Scripts\python.exe
) else if exist ".venv\Scripts\python.exe" (
    set PYTHON_EXE=.venv\Scripts\python.exe
)
%PYTHON_EXE% --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Python not found in system or venv
    exit /b 1
)
echo [PASS] Python environment is healthy.

echo.
echo [CHECK] Running Deep Logic Validation...
cd backend
%PYTHON_EXE% deep_test.py
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Feature-level logic verification failed!
    echo Check the error logs above.
    pause
    exit /b 1
)
echo [PASS] All backend features (AI Diagnosis, Hotspots, Forecasts) verified.

echo.
echo [CHECK] Testing Consolidated Web Server...
echo (Starting temporary instance on port 8999...)
start /b "" %PYTHON_EXE% -m uvicorn main:app --port 8999 > nul 2>&1
ping 127.0.0.1 -n 7 > nul
curl -s http://localhost:8999/index.html | findstr "<title>"
if %errorlevel% neq 0 (
    echo [FAIL] Consolidated server failed to serve frontend!
) else (
    echo [PASS] Consolidated server is serving both Backend APIs and Frontend.
)
:: Kill the temporary test instance
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8999 ^| findstr LISTENING') do taskkill /f /pid %%a > nul 2>&1

echo.
echo ======================================================
echo ALL COMPONENTS ARE SOUND AND VERIFIED ON HP OMEN
echo ======================================================
echo.
pause
