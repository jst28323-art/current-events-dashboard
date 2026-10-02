@echo off
rem scripts/capture_task.cmd - run by the one-time Windows scheduled task (D-033, grant G-011). Changes into the repo
rem itself (Task Scheduler + conhost ignore the task working directory) and appends all output to scratch\capture_task.log.
cd /d "%~dp0.."
echo ==== %DATE% %TIME% capture_task.cmd %* >> "%~dp0..\scratch\capture_task.log"
node scripts\capture_live.mjs %* >> "%~dp0..\scratch\capture_task.log" 2>&1
echo ==== exit %ERRORLEVEL% >> "%~dp0..\scratch\capture_task.log"
