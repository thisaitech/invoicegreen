@echo off
cls
echo ╔════════════════════════════════════════════════════════╗
echo ║                                                        ║
echo ║           ESTIMATE GENERATOR - STARTING...             ║
echo ║                                                        ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo.

REM Check if running from dist folder
if exist "Estimate Generator.exe" (
    echo Starting from portable version...
    echo.
    start "" "Estimate Generator.exe"
    exit
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo ┌─────────────────────────────────────────────┐
    echo │  FIRST TIME SETUP                           │
    echo │  Installing dependencies...                 │
    echo │  This will take 2-3 minutes.                │
    echo └─────────────────────────────────────────────┘
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ❌ Installation failed!
        echo.
        echo Please make sure Node.js is installed:
        echo https://nodejs.org/
        echo.
        pause
        exit /b 1
    )
    echo.
    echo ✓ Installation complete!
    echo.
)

echo Starting Estimate Generator...
echo.
echo ═══════════════════════════════════════════════
echo  NEW FEATURES IN THIS VERSION:
echo ═══════════════════════════════════════════════
echo  ✓ Print Preview before printing
echo  ✓ Email PDF to customers
echo  ✓ Customer Management with payment tracking
echo  ✓ Dashboard with search functionality
echo  ✓ Auto-delete old completed estimates
echo  ✓ HSN Code support
echo  ✓ Auto-rounding feature
echo ═══════════════════════════════════════════════
echo.

start /B npm start

echo.
echo Application is starting...
echo A window will open in a few seconds.
echo.
echo Press any key to close this window
echo (The app will continue running)
pause >nul
