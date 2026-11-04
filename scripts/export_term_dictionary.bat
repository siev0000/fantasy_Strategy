@echo off
setlocal
chcp 65001 >nul

rem Usage:
rem   scripts\export_term_dictionary.bat "C:\path\to\game_data.xlsx"
rem   scripts\export_term_dictionary.bat "C:\path\to\game_data.xlsx" "output\term-dictionary"
rem Input must be the latest XLSX export of @game_data.

set "INPUT=%~1"
if not defined INPUT set "INPUT=%~dp0..\game_data.xlsx"
for %%F in ("%INPUT%") do set "INPUT=%%~fF"

set "OUTPUT=%~2"
if not defined OUTPUT set "OUTPUT=data\source\export\json"

if not exist "%INPUT%" (
    echo [ERROR] XLSX file not found: "%INPUT%"
    echo Export the latest @game_data to XLSX and pass its path as the first argument.
    exit /b 2
)

pushd "%~dp0.." || exit /b 2

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] python is not available on PATH.
    popd
    exit /b 2
)

echo [1/2] Validate term dictionary source: "%INPUT%"
python scripts\game_data_converter.py --input "%INPUT%" --sheet 用語辞書 --output-dir "%OUTPUT%" --dry-run
if errorlevel 1 goto failed

echo [2/2] Generate 効果.json, 説明.json, 範囲.json
python scripts\game_data_converter.py --input "%INPUT%" --sheet 用語辞書 --output-dir "%OUTPUT%"
if errorlevel 1 goto failed

echo [OK] Generated all three dictionary JSON files in "%OUTPUT%".
popd
exit /b 0

:failed
echo [ERROR] Validation or conversion failed. See artifacts\game-data-converter-report.json.
popd
exit /b 1
