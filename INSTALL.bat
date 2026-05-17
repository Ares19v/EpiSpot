@echo off
:: EpiSpot Automated Setup Script
:: Sets up a local virtual environment and installs dependencies

echo ======================================================
echo           EPISPOT AUTOMATED LOCAL SETUP
echo ======================================================
echo.

:: Check for Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.8+ and try again.
    pause
    exit /b 1
)

:: Create Virtual Environment
echo [SETUP] Creating Python Virtual Environment (.venv)...
python -m venv .venv
if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)
echo [SETUP] Virtual environment created successfully.
echo.

:: Activate and install dependencies
echo [SETUP] Upgrading pip and installing dependencies...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

echo.
echo ======================================================
echo   ✅ SETUP COMPLETE! RUN Run_Project.bat TO START
echo ======================================================
echo.
pause
