@echo off
set "ROOT=%~dp0.."
set "RESULT=0"
cd /d "%ROOT%"
call "%~dp0use-node.cmd"
cd f-vue
call npm install
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
cd ..\f-worker
call npm install
if errorlevel 1 goto fail
echo.
echo [OK] Build finished. Run scripts\dev.cmd to start wrangler dev.
goto done

:fail
set "RESULT=1"
goto done

:done
cd /d "%ROOT%"
exit /b %RESULT%
