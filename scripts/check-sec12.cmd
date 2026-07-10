@echo off
set "ROOT=%~dp0.."
set "RESULT=0"
cd /d "%ROOT%"
set "P1=edt-pages"
set "P2=.github.io"
set "NEEDLE=%P1%%P2%"
set FOUND=0
for %%D in (doc f-worker\src f-vue\src scripts) do (
  for /r "%%D" %%F in (*.md *.js *.vue *.toml *.sql *.cmd) do (
    if /i not "%%~nxF"=="check-sec12.cmd" (
      findstr /i /c:"%NEEDLE%" "%%F" >nul 2>&1 && (
        echo %%F
        set FOUND=1
      )
    )
  )
)
findstr /i /c:"%NEEDLE%" README.md >nul 2>&1 && (echo README.md & set FOUND=1)
if "%FOUND%"=="1" (
  echo FAIL SEC-12: banned third-party admin UI domain found
  set "RESULT=1"
  goto done
)
echo PASS SEC-12

:done
cd /d "%ROOT%"
exit /b %RESULT%
