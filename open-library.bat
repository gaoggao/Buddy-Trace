@echo off
chcp 65001 >nul

REM Buddy Trace - Desktop Launcher
REM All logic lives in scripts\wb-open.js (node).
REM A .bat with HTTP probing / loops / delayed expansion is too fragile:
REM findstr misses pretty-printed JSON, nested for /f hangs, pause blocks
REM non-interactive calls. Keep this file trivial.

cd /d "%~dp0"
node scripts\wb-open.js

if errorlevel 1 (
  echo.
  echo   Press any key to close...
  pause >nul
)
