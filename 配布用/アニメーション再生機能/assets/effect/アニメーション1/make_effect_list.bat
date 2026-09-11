@echo off
chcp 65001 >nul
setlocal

REM このバッチがあるフォルダを処理対象・出力先にする
set "input_dir=%~dp0"
set "output_file=%~dp0effect_list.json"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$inputDir = '%input_dir%';" ^
  "$outputFile = '%output_file%';" ^
  "$list = Get-ChildItem -LiteralPath $inputDir -File | Where-Object { $_.Extension -ne '.bat' -and $_.Name -ne 'effect_list.json' } | ForEach-Object { $_.BaseName };" ^
  "$json = @($list) | ConvertTo-Json -Depth 1;" ^
  "Set-Content -LiteralPath $outputFile -Value $json -Encoding UTF8;"

echo JSON作成完了 → %output_file%
pause