@echo off
chcp 65001 >nul
cd /d "%~dp0"
python 02_list_calendars.py
pause
