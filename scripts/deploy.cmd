@echo off
set "ROOT=%~dp0.."
set "RESULT=0"
cd /d "%ROOT%"
call "%~dp0use-node.cmd"
cd f-worker

call npm install
if errorlevel 1 (
  set "RESULT=1"
  goto done
)

findstr /R /B /C:"allow_insecure_dev = \"1\"" wrangler.toml >nul 2>&1
if not errorlevel 1 (
  echo [ERROR] allow_insecure_dev is enabled in wrangler.toml. Disable before production deploy.
  set "RESULT=1"
  goto done
)

findstr /R /B /C:"id = \"\"" /C:"database_id = \"\"" /C:"admin = \"\"" /C:"domain = \"\"" wrangler.toml >nul 2>&1
if not errorlevel 1 (
  echo [ERROR] Cloudflare deployment config is incomplete.
  echo Please run scripts\setup-cloudflare.cmd first.
  set "RESULT=1"
  goto done
)

call npx wrangler deploy %*
set "RESULT=%ERRORLEVEL%"

:done
cd /d "%ROOT%"
exit /b %RESULT%
