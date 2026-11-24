# AGENTS.md

## Documentation source of truth

Before changing game behavior, read `docs/README.md` and follow its documentation priority.

When changing game behavior or UI presentation, agree on the exact specification and examples with the user before editing. Start implementation after the user confirms the specification.

The user verifies screen appearance and on-screen interactions. Skip browser UI checks, screenshot capture or review, and device-width checks unless the user explicitly requests them. Use relevant builds, lint checks, and non-UI tests for implementation verification.

For new combat-effect test skills, add the test actions to the existing スキル動作確認 units through `config/v39-skill-trigger-test.json` by default.

Before adding, reorganizing, or archiving documentation, read `docs/DOCUMENTATION_RULES.md`. Update an existing subsystem document instead of creating parallel current-spec memos. Regenerate `docs/INDEX.md` with `npm run docs:index` and validate with `npm run check:docs` after moving documents.

Record Codex implementation, investigation, and verification tasks in `docs/ALL_TASKS_UNIFIED.md` or the linked issue. ChatGPT proposals and requests awaiting handoff belong in `docs/tasks/CHATGPT_TASKS.md`. See `docs/CHATGPT_GUIDE.md` for how to hand off an approved request and find its specification.

When changing spreadsheet-managed game data, read `docs/SPREADSHEET_DATA_WORKFLOW.md` before editing generated JSON. For these datasets, `@game_data` is the editing source and `data/source/export/json` is generated runtime data. Do not preserve legacy JSON-only fields that no longer exist in the spreadsheet.

The user authors and balances skills, affixes, equipment, classes, and races in `@game_data`. Follow the input guide in `docs/SPREADSHEET_DATA_WORKFLOW.md` when checking notation or importing data on request. Edit the source sheet only when the user explicitly requests specific edits.

Use the latest XLSX export and the existing local converter for spreadsheet-managed data by default. Limit conversion to the requested sheets when possible, and inspect the converter report and generated JSON diff. Read live cells only when the task requires live-only information or a fresh XLSX export is unavailable. Limit those reads to the needed range.

Before planning, creating, or editing enchantments/affixes (`付与`), read the `付与データ・命名・効果運用ルール` section of `docs/SPREADSHEET_DATA_WORKFLOW.md`. Check the latest export of the `付与` and `用語辞書` tabs (columns A:B) and confirm actual effect semantics before assigning any `初期効果`. Do not invent `効果:...` tokens, substitute similar-but-different effects, or restore rows/values the user deleted. The sheet is the editing source, and changes to the sheet are not proof of converter/runtime implementation.

Before proposing, creating, editing, or balancing skills (including design-only conversations without implementation), read the `CSスキル作成・既存効果再利用ルール` and `スキル設計・威力参照の共通原則` sections of `docs/SPREADSHEET_DATA_WORKFLOW.md`, `docs/rules/units/戦闘ダメージ・耐性ルール.md`, and `docs/rules/units/スキル効果対応状況.md`. Check the current `@game_data` CS, 用語辞書, スキル一覧 notation and related class rows using the export/live-read policy above. For class skill layouts, also read `docs/CLASS_SKILL_RULES.md` before proposing, not only before editing. Use the current rules for judgement stats, additional power, base power and fixed/percentage modifiers; do not make users repeat documented rules. If the source sheet or runtime behavior cannot be verified, identify what remains unverified and distinguish design decisions from implementation. Do not edit the sheet merely because a proposal is requested.

When creating a new class or intentionally redesigning a class skill layout in `CS` / `クラス`, read `docs/CLASS_SKILL_RULES.md` before writing to the spreadsheet. Check which class levels unlock skills for each unit type and how the selected active and passive skills support the class role. After editing, read back the `CS` rows and `クラス` Skill1-Skill10 values before reporting completion.

When unit portrait / unit image generation or editing, read `docs/UNIT_PORTRAIT_GENERATION_RULES.md` before generating any image. Do not substitute older side-scroller pixel-art rules unless the user explicitly asks for side-scroller or pixel-art output.

When specifications conflict, use this order:

1. Current code / `data` / `config`
2. `docs/現状ゲーム仕様メモ.md`
3. Current subsystem rule documents
4. `docs/ALL_TASKS_UNIFIED.md`
5. Future-design notes
6. Old task notes / drafts / `progress.md`

Do not implement a rule only because it appears in `MEMO.md`, `NEXT_TASKS.md`, `RULE_TASKS.md`, a draft, or `progress.md`.
Treat `仮`, `暫定`, `将来`, and `未実装` items as proposals unless current code confirms them.
Update the relevant current document when a specification is intentionally changed.

---

**Rule:** In each command, **define → use**. Do **not** escape `$`. Use generic `'path/to/file.ext'`.

---

## 1) READ (UTF‑8 no BOM, line‑numbered)

```bash
bash -lc 'powershell -NoLogo -Command "
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false);
Set-Location -LiteralPath (Convert-Path .);
function Get-Lines { param([string]$Path,[int]$Skip=0,[int]$First=40)
  $enc=[Text.UTF8Encoding]::new($false)
  $text=[IO.File]::ReadAllText($Path,$enc)
  if($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF){ $text=$text.Substring(1) }
  $ls=$text -split "`r?`n"
  for($i=$Skip; $i -lt [Math]::Min($Skip+$First,$ls.Length); $i++){ "{0:D4}: {1}" -f ($i+1), $ls[$i] }
}
Get-Lines -Path "path/to/file.ext" -First 120 -Skip 0
"'
```

---

## 2) WRITE (UTF‑8 no BOM, atomic replace, backup)

```bash
bash -lc 'powershell -NoLogo -Command "
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false);
Set-Location -LiteralPath (Convert-Path .);
function Write-Utf8NoBom { param([string]$Path,[string]$Content)
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $enc = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($tmp,$Content,$enc)
    Move-Item $tmp $Path -Force
  }
  finally {
    if (Test-Path $tmp) {
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
  }
}
$file = \"path/to/your_file.ext\"
$enc  = [Text.UTF8Encoding]::new($false)
$old  = (Test-Path $file) ? ([IO.File]::ReadAllText($file,$enc)) : ''
Write-Utf8NoBom -Path $file -Content ($old+\"`nYOUR_TEXT_HERE`n\")
"'
```
