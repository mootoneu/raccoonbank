@echo off
title CochonBank2 - server
setlocal

rem Always run from the project root so the Maven wrapper and ./data resolve.
cd /d "%~dp0"

if not exist "mvnw.cmd" (
    echo Could not find mvnw.cmd next to this script.
    echo Run this file from the CochonBank2 project folder.
    echo.
    pause
    exit /b 1
)

echo Starting CochonBank2...
echo Open http://localhost:8080 once the server is ready.
echo Press Ctrl+C to stop the server.
echo.

call mvnw.cmd spring-boot:run
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
    echo The server has stopped.
) else (
    echo The server stopped with exit code %EXIT_CODE%.
)
echo Press any key to close this window.
pause >nul

endlocal & exit /b %EXIT_CODE%
