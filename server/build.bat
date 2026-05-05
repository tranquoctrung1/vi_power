@echo off
echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 goto :error

echo [2/3] Building executable...
call npm run build
if errorlevel 1 goto :error

echo [3/3] Copying .env.example to dist\...
if not exist dist mkdir dist
copy .env.example dist\.env.example >nul

echo.
echo Build complete: dist\vipower-server.exe
echo.
echo Before running:
echo   1. Copy dist\.env.example to dist\.env
echo   2. Fill in MONGODB_URI, JWT_SECRET, etc.
echo   3. Run: dist\vipower-server.exe
goto :end

:error
echo Build failed.
exit /b 1

:end
