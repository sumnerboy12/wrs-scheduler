@echo off
rem Builds the web client and runs the single production server.
rem Once running, anyone on the office network can open:
rem   http://<this-computer-name-or-ip>:4000
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo Building client...
call npm --prefix client run build
if errorlevel 1 goto :error
echo Starting server on port 4000...
call npm --prefix server start
goto :eof

:error
echo Build failed.
pause
