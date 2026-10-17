@echo off
echo ========================================================
echo Starting CASA-AI Backend Server (FastAPI + AI Model)
echo ========================================================
cd /d "%~dp0backend"
call "venv\Scripts\activate.bat"
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
