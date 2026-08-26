@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -c "import fastapi, uvicorn" 2>nul
if errorlevel 1 python -m pip install -r requirements.txt
start "" http://localhost:8000
python -m uvicorn app.main:app --port 8000
pause
