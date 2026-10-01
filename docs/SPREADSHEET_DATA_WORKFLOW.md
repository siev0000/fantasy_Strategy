# @game_data スプレッドシート → JSON 変換運用

最終更新: 2026-10-01

## 1. 目的

ゲームデータの編集とゲーム実行時データを分離し、Google スプレッドシート `@game_data` を人間・ChatGPT が編集しやすい入口として使用する。

役割は次のように固定する。

- **Google スプレッドシート `@game_data`**: シート管理対象データの編集原本
- **`scripts/game_data_converter.py`**: 通常の対象シートを XLSX から検証して JSON へ変換する専用変換器
- **`scripts/cs_skill_json_converter.py`**: `CS` シートから `スキル一覧.json` を生成するスキル専用変換器
- **`data/source/export/json/*.json`**: GitHub に保存し、ゲームが実行時に読む生成済みデータ
- **ゲームコード**: Google Sheets を直接参照せず、生成済み JSON だけを読む

Notion はこの変換運用の正本にしない。同じルール本文を Notion と GitHub に二重管理しない。

### 参照先を取り違えないための固定表

| 確認・変更したい対象 | 正しい参照先 / 操作 | 直接変更してはいけないもの |
| --- | --- | --- |
| 種類、数値、説明、条件、画像名を追加・変更する | Google スプレッドシート `@game_data` の対応シートを編集する | `data/source/export/json/*.json` |
| ゲームが現在使う値を確認する | `data/source/export/json/*.json` と現行コードを確認する | Google Sheets の未エクスポート変更だけで判断すること |
| シートの変更をゲームへ反映する | 最新の `.xlsx` エクスポートを変換器へ渡し、JSON差分を確認する | `.xlsm` を直接入力として使うこと |
| シートにない固定のテストデータを変更する | 対象外JSONと、その専用仕様書を確認する | 管理対象JSONへJSONだけの列を追加すること |

このリポジトリに一時的に存在する `data/source/game_data.xlsm`、`~$game_data.xlsm`、手元へ保存した `.xlsx` は、Google スプレッドシート `@game_data` の編集原本ではない。変換確認用のローカルコピーとして扱い、通常のゲームデータ変更の正本にしない。

ゲームコードは Google Sheets やローカル表計算ファイルを直接読まない。実行時の定義は必ず `data/source/export/json` を通す。

---

## 2. 最重要ルール

### スプレッドシートにない旧 JSON 項目は保持しない

変換時は既存 JSON をマージ元として使用しない。

毎回、現在の `@game_data` の列と値だけから対象 JSON を再生成する。

したがって、

- 以前 JSON にだけ存在していた項目
- すでにスプレッドシートから削除された旧項目
- 過去の変換漏れで JSON に残っている項目

は、次回変換時に削除される。

必要な項目であれば、JSON に直接残すのではなく `@game_data` 側へ正式な列として追加する。

### JSON を手作業で二重管理しない

`@game_data` 管理対象の JSON を変更するときは、原則として

`@game_data を編集 → 変換 → JSON 差分確認`

の順で行う。

生成後 JSON だけを直接変更して、スプレッドシート側へ反映しない運用は行わない。

緊急調査でJSONを一時変更する場合も、原因確認後に同じ変更を `@game_data` へ反映して再生成するか、JSON変更を取り消す。JSONだけの変更をコミットして編集原本との差分を恒久化しない。

---

## 3. 現在の自動変換対象

| スプレッドシート | 出力 JSON |
| --- | --- |
| クラス | `クラス.json` |
| 種族 | `種族.json` |
| 勢力 | `勢力.json` |
| 説明 | `説明.json` |
| CS（`出力確認=TRUE` の行のみ） | `スキル一覧.json`（`scripts/cs_skill_json_converter.py`） |
| 範囲 | `範囲.json` |
| 効果 | `効果.json` |
| 地形 | `地形.json` |
| 出現敵 | `出現敵.json` |
| 災害 | `災害.json` |
| 都市基本データ | `都市基本データ.json` |
| 都市 | `都市.json` |
| 外交姿勢 | `外交姿勢.json` |
| 組織 | `組織.json` |
| 体制 | `体制.json` |
| 施設 | `施設.json` |
| 研究 | `研究.json` |
| 付与 | `付与.json` |
| 勝利対象土地 | `勝利対象土地.json` |
| 消費量 | `消費量.json` |
| 装備 | `装備.json` |

### 現在の対象外

- `CS`: スキル定義の編集元。`scripts/cs_skill_json_converter.py` を使用した場合のみ `スキル一覧.json` の生成元とする。通常の `game_data_converter.py` の一括変換対象には含めない。
- `画面`: 補助計算用。ゲームデータ JSON として自動出力しない。
- `テストクラス.json`
- `テストスキル.json`
- `テストゲーム状態.json`
- `種族分類.json`
- `種族幸福度仮.json`

対象外 JSON をスプレッドシート管理へ移す場合は、先にこの文書と変換器のマップを更新する。


### スキル一覧の専用変換ルール

`スキル一覧.json` は通常の `game_data_converter.py` ではなく、`scripts/cs_skill_json_converter.py` で `CS` シートから生成する。

変換対象は、`CS` シート内の **「出力確認」列が TRUE の行だけ** とする。

- 「出力確認」が TRUE: `スキル一覧.json` へ出力する。
- 「出力確認」が FALSE、空欄、または TRUE 以外: 出力しない。
- 「出力確認」列は固定列番号ではなく、ヘッダー名 `出力確認` で特定する。
- 同名スキルは既定で先頭行を採用し、重複内容はレポートへ記録する。
- H列「データ」はスキル専用変換器の規則に従って個別 JSON 項目へ展開する。
- 生成後の `スキル一覧.json` を手作業で修正して CS と二重管理しない。

実行例:

```bash
python scripts/cs_skill_json_converter.py path/to/game_data.xlsx -o data/source/export/json/スキル一覧.json
```

生成時は `スキル一覧.report.json` も確認し、除外行・重複・警告が意図どおりか確認する。

---

## 4. 変換規則

- 各対象シートの **1行目をヘッダー**として扱う。
- ヘッダーが空欄の列は JSON へ出力しない。
- データ行の空セルは JSON へ出力しない。
- 数値 `0` と Boolean `false` は実値として保持する。
- 数値セルは JSON 数値として出力する。
- Boolean セルは JSON Boolean として出力する。
- 文字列は前後の空白だけを除去し、内部の改行・文字列は保持する。
- セル文字列が有効な JSON 配列 `[...]` または JSON オブジェクト `{...}` の場合は構造化データとして出力する。
- 数式セルは XLSX に保存された **計算済みキャッシュ値**を使用する。
- **計算済みキャッシュ値が存在しない数式セルは、標準で変換エラーにする。** 値が欠落したまま JSON を生成しない。
- 診断用途でのみ `--allow-missing-formula-cache` を指定すると警告へ緩和できるが、正式な JSON 更新では使用しない。
- XLSX 数式エラーがある場合は変換エラーにする。
- 同名ヘッダーは原則としてスプレッドシート側で解消する。変換器は残存する重複ヘッダーを検出し、同一行で空欄と実値の組み合わせ、または同じ実値なら1項目へ統合する。
- 同名ヘッダーの複数列に異なる実値が同時に入っている場合は、勝手に上書きせず変換エラーにする。
- シート途中にヘッダー行が繰り返されている場合、各値がヘッダー名と一致する行はデータとして出力しない。
- 一意キーが定義されているデータは重複を検出する。

---

## 5. 書き込み安全性

変換器は、対象シートをすべてメモリ上で変換・検証してから JSON を書き込む。

1件でも変換エラーがある場合は、対象 JSON を更新しない。

JSON 書き込みは一時ファイルを経由して置換し、書き込み途中の壊れた JSON を残さない。

変換結果・警告・エラーは既定で

`artifacts/game-data-converter-report.json`

へ出力する。

---

## 6. 実行方法

全対象シートを検証するだけ（数式キャッシュ欠落もエラー）:

```bash
python scripts/game_data_converter.py --input path/to/game_data.xlsx --dry-run
```

全対象シートを JSON 化:

```bash
python scripts/game_data_converter.py --input path/to/game_data.xlsx
```

一部だけ変換:

```bash
python scripts/game_data_converter.py --input path/to/game_data.xlsx --sheet 種族 --sheet クラス
```

スキル一覧を CS から生成:

```bash
python scripts/cs_skill_json_converter.py path/to/game_data.xlsx -o data/source/export/json/スキル一覧.json
```

XLSX 内のシートと変換対象を確認:

```bash
python scripts/game_data_converter.py --input path/to/game_data.xlsx --list
```

診断時だけ数式キャッシュ欠落を警告へ緩和する場合:

```bash
python scripts/game_data_converter.py --input path/to/game_data.xlsx --dry-run --allow-missing-formula-cache
```

正式な JSON 更新ではこのオプションを使用しない。

既定の出力先:

`data/source/export/json`

正式反映時の確認コマンド:

```bash
python scripts/game_data_converter.py --input path/to/game_data.xlsx --dry-run
python scripts/game_data_converter.py --input path/to/game_data.xlsx
git diff -- data/source/export/json
npm run audit:data
```

変換後は、意図しないJSONファイル・列・行の削除がないことを `git diff` で確認する。変換器レポートまたは `npm run audit:data` にエラーがある状態で、生成JSONを正本として扱わない。

---

## 7. ChatGPT からデータを修正するときの流れ

ユーザーが `@game_data` の変更を指示した場合は、原則として次の順で行う。

1. 現在の作業ブランチを確認する。
2. `AGENTS.md`、`docs/README.md`、この文書、対象データの仕様書を確認する。
3. 対象JSONが自動変換対象か、対象外の専用JSONかをこの文書の一覧で判定する。
4. 元の Google スプレッドシート `@game_data` の現在値を確認する。
5. 指定されたシート・セルを `@game_data` 側で編集する。
6. 編集後の最新データを `.xlsx` として取得する。ローカルの `.xlsm` を編集原本へ戻さない。
7. `game_data_converter.py --dry-run` で検証する。
8. エラーがなければ JSON を生成する。
9. 生成された JSON の差分と `npm run audit:data` を確認する。
10. 現在の作業ブランチへ必要な変更を反映する。
11. ユーザーの許可なく `main` へマージしない。

Google Sheets の編集だけで終わらせず、ユーザーが「ゲームデータへ反映」「JSONまで反映」などを求めた場合は変換後 JSON まで更新する。

---

## 8. 列・シート構造を変更するとき

### 列を削除する場合

次回変換で対応 JSON 項目も削除される。これは正常動作。

### 列名を変更する場合

JSON キーも変更されるため、ゲームコード・仕様書・参照データへの影響を先に確認する。

### 新しい列を追加する場合

既存ゲーム処理がその列を利用するか確認する。新しい値をコード側へ重複して固定定義しない。

### 新しいシートを JSON 化する場合

`scripts/game_data_converter.py` の `SHEET_TO_JSON` に明示的に追加し、必要なら `UNIQUE_KEYS` に一意キーを追加する。

自動的に全シートを JSON 化する方式にはしない。作業用シートや計算補助シートを誤ってゲームデータ化しないため、変換対象は明示管理する。

---

## 9. 仕様との関係

この文書は「データをどう編集・変換するか」の運用ルールであり、個々のゲーム仕様を定義するものではない。

- ゲーム仕様: 対応する `docs/` の現行仕様書
- 編集原本: `@game_data`
- ゲーム実行時データ: `data/source/export/json`
- 変換方法: この文書 + `scripts/game_data_converter.py`。スキル一覧のみ `scripts/cs_skill_json_converter.py`
- ゲーム処理: 現行コード

仕様とスプレッドシートの値が食い違っている場合は、根拠なくどちらかへ自動統一せず、現在の確定仕様を確認してから修正する。
