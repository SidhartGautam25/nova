@echo off
node "%~dp0..\ndk\novac-cli.js" %*
exit /b %ERRORLEVEL%

