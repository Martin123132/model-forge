@echo off
setlocal

cd /d "%~dp0"
title ModelForge Launcher

echo.
echo Starting ModelForge...
echo.

set "MODEL_FORGE_SOURCE_ROOT=%CD%"

if exist "D:\" (
  set "MODEL_FORGE_DATA_ROOT=D:\AI\ModelForge\.modelforge-data"
  set "OLLAMA_MODELS=D:\AI\Ollama\models"
  set "MODEL_FORGE_CACHE_ROOT=D:\AI\ModelForge\.cache"
) else (
  set "MODEL_FORGE_DATA_ROOT=%CD%\.modelforge-data"
  set "MODEL_FORGE_CACHE_ROOT=%CD%\.cache"
)

if not exist "%MODEL_FORGE_DATA_ROOT%" mkdir "%MODEL_FORGE_DATA_ROOT%"
if defined OLLAMA_MODELS if not exist "%OLLAMA_MODELS%" mkdir "%OLLAMA_MODELS%"
if not exist "%MODEL_FORGE_CACHE_ROOT%" mkdir "%MODEL_FORGE_CACHE_ROOT%"

set "npm_config_cache=%MODEL_FORGE_CACHE_ROOT%\npm"
set "TEMP=%MODEL_FORGE_CACHE_ROOT%\temp"
set "TMP=%MODEL_FORGE_CACHE_ROOT%\temp"
set "PLAYWRIGHT_BROWSERS_PATH=%MODEL_FORGE_CACHE_ROOT%\playwright"

if not exist "node_modules" (
  echo Installing local Node packages. This only runs the first time.
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo ModelForge could not install packages. Check that Node.js and npm are installed.
    pause
    exit /b 1
  )
)

echo Data root: %MODEL_FORGE_DATA_ROOT%
if defined OLLAMA_MODELS echo Ollama models: %OLLAMA_MODELS%
echo.
echo Opening http://127.0.0.1:5178/
echo Close this window to stop ModelForge.
echo.

start "" "http://127.0.0.1:5178/"
call npm.cmd run dev
