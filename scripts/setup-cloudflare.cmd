@echo off
if "%~1"=="/?" goto help
if "%~1"=="-?" goto help
if /I "%~1"=="--help" goto help

set "ROOT=%~dp0.."
set "RESULT=0"
cd /d "%ROOT%"
call "%~dp0use-node.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-cloudflare.ps1" %*
set "RESULT=%ERRORLEVEL%"
cd /d "%ROOT%"
exit /b %RESULT%

:help
echo Usage:
echo   scripts\setup-cloudflare.cmd
echo   scripts\setup-cloudflare.cmd -SkipDeploy
echo   scripts\setup-cloudflare.cmd -Reconfigure
echo.
echo The setup can resume after an interrupted run by reading .wrangler\setup-cloudflare-state.json.
exit /b 0
