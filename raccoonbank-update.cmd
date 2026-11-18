@echo off
title RaccoonBank - server
setlocal

cd /d "%~dp0"

echo Updating RaccoonBank...
echo.

call mvn package -f "d:\Projects\lego\bricktools\pom.xml" 
set "EXIT_CODE=%ERRORLEVEL%"
echo.

endlocal & exit /b %EXIT_CODE%
