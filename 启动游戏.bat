@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-game.ps1"
if errorlevel 1 (
  echo.
  echo The game server could not start. Review the error above.
  pause
)
endlocal
