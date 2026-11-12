@echo off
cd /d "%~dp0"
echo Starting TriggerVault... open http://localhost:3000 in your browser
echo (close this window to stop the website)
node server.js
pause
