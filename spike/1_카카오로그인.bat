@echo off
chcp 65001 >nul
cd /d "%~dp0"
python 01_login.py
pause
