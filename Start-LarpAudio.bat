@echo off
setlocal
title LarpAudio Local Server
pushd "%~dp0" || exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 (
    echo LarpAudio needs Node.js. Install the LTS release from https://nodejs.org/
    echo Then run Start-LarpAudio.bat again.
    pause
    popd
    exit /b 1
)
if not exist "serve.mjs" (
    echo Extract the full LarpAudio Windows ZIP before starting.
    pause
    popd
    exit /b 1
)
node.exe serve.mjs %*
set "launch_status=%errorlevel%"
if not "%launch_status%"=="0" pause
popd
exit /b %launch_status%
