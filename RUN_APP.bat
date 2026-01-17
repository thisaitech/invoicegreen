@echo off
echo ========================================
echo    Estimate Generator - Starting...
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Installing dependencies for the first time...
    echo This may take a few minutes...
    echo.
    call npm install
    echo.
    echo Installation complete!
    echo.
)

echo Starting Estimate Generator...
echo.
call npm start

pause
