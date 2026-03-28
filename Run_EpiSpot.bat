@echo off
title EpiSpot Instant Launcher

echo Starting EpiSpot Backend in WSL...
start "EpiSpot Backend" wsl bash -c "cd ~/EpiSpot/backend && source venv/bin/activate && python3 -m uvicorn main:app --reload --port 8000"

echo Starting EpiSpot Frontend in WSL...
start "EpiSpot Frontend" wsl bash -c "cd ~/EpiSpot/frontend && python3 -m http.server 5500"

echo Launching Browser...
timeout /t 3
start http://127.0.0.1:5500/prog3.html

exit