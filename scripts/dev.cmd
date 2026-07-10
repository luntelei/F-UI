@echo off
set "ROOT=%~dp0.."
set "RESULT=0"
cd /d "%ROOT%"
call "%~dp0use-node.cmd"
cd f-worker
call npx wrangler dev
set "RESULT=%ERRORLEVEL%"
cd /d "%ROOT%"
exit /b %RESULT%
