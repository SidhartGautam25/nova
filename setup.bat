@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   Nova ^& NVM Standalone Setup (Windows)
echo ========================================
echo.

set "BIN_DIR=%~dp0bin"
for %%i in ("%BIN_DIR%") do set "BIN_DIR=%%~fi"

echo Nova bin directory: "%BIN_DIR%"
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$bin = '%BIN_DIR%';" ^
  "$userPath = [Environment]::GetEnvironmentVariable('Path', 'User');" ^
  "if ($userPath -split ';' -contains $bin) {" ^
  "  Write-Host 'Nova bin is already in your User PATH!' -ForegroundColor Green;" ^
  "} else {" ^
  "  $newPath = if ($userPath) { $userPath.TrimEnd(';') + ';' + $bin } else { $bin };" ^
  "  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User');" ^
  "  Write-Host 'Successfully added Nova bin to your persistent User PATH!' -ForegroundColor Green;" ^
  "}"

echo.
echo Setup complete. Open a NEW terminal window and run:
echo    novac --help
echo    nova --help
echo.

