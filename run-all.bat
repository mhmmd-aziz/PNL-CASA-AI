@echo off
echo ========================================================
echo Starting CASA-AI Sperm Analysis (Backend + Frontend)
echo ========================================================
start "CASA-AI Backend" cmd /k "%~dp0run-backend.bat"
timeout /t 3 /nobreak >nul
start "CASA-AI Frontend" cmd /k "%~dp0run-frontend.bat"
echo.
echo Both servers have been launched in separate windows!
echo - Backend:          http://localhost:8000 (Docs: http://localhost:8000/docs)
echo - Frontend (Home):   http://localhost:5173
echo - Dashboard Medis:   http://localhost:5173/dashboard
echo.

