@echo off
chcp 65001 >nul
title Is Takibi Dosya Yardimcisi kurulumu
cd /d "%~dp0"
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY python --version >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python bulunamadi, kuruluyor. Biraz surebilir...
  winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
  echo.
  echo Python kuruldu. Bu pencereyi kapatip KUR.bat dosyasini TEKRAR calistirin.
  pause
  exit /b
)
%PY% kur_yardimci.py
echo.
pause
