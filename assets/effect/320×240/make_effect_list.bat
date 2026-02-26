@echo off
setlocal

REM このバッチがあるフォルダを処理対象にする
set "input_dir=%~dp0"
set "output_file=D:\Github\RootsOfDuality\public\data\effect_list.json"

REM PowerShellで拡張子なしのファイル名を取得し、UTF-8で出力
powershell -NoProfile -Command ^
  "$list = Get-ChildItem -LiteralPath '%input_dir%' -File | Where-Object { $_.Extension -ne '.bat' } | ForEach-Object { $_.BaseName }; $json = $list | ConvertTo-Json -Depth 1; Set-Content -LiteralPath '%output_file%' -Value $json -Encoding UTF8"

echo ✅ JSON作成完了 → %output_file%
pause
