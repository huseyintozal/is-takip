@echo off
chcp 65001 >nul
title Is Takibi Dosya Yardimcisi kurulumu
cd /d "%~dp0"
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY python --version >nul 2>nul && set "PY=python"
if not defined PY (
  echo Python bulunamadi, kuruluyor. Biraz surebilir...
  rem --source winget: Microsoft Store kaynagina ulasilamazsa da calissin
  winget install -e --id Python.Python.3.12 --source winget --scope user --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo.
    echo Python otomatik kurulamadi. Elle kurun:
    echo   1^) https://www.python.org/downloads/ adresinden Python'u indirin
    echo   2^) Kurulumun ilk ekraninda "Add python.exe to PATH" kutusunu ISARETLEYIN
    echo   3^) Kurulum bitince KUR.bat dosyasini TEKRAR calistirin
    start "" "https://www.python.org/downloads/"
    pause
    exit /b
  )
  echo.
  echo Python kuruldu. Bu pencereyi kapatip KUR.bat dosyasini TEKRAR calistirin.
  pause
  exit /b
)
%PY% kur_yardimci.py
echo.
pause
