@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo Installing server dependencies...
call npm --prefix server install
echo Installing client dependencies...
call npm --prefix client install
echo Done.
pause
