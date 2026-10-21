@echo off
node "%~dp0..\ndk\nova-cli.js" %*
exit /b %ERRORLEVEL%

