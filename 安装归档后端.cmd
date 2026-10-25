@echo off
setlocal
cd /d "%~dp0"
node "%~dp0install-backend.mjs" %*
if errorlevel 1 echo Install failed. See the message above.
pause
