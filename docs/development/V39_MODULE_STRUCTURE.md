# v39 モジュール構成

最終整理: 2026-09-21

この文書は **v39ランタイムの現行コード構成** を示す。ゲームルールや数値の正本ではない。ゲーム仕様は `docs/README.md` の優先順位に従い、データ種別・数値は `data/source/export/json` と `config` を優先する。

## 1. 起動入口

- `frontend/index.html` から `/src/v39/bootstrap/v39-bootstrap.js` を読み込む。
- `v39-bootstrap.js` は既存の起動順を維持したまま、`core -> game -> final` の3段階で読み込む。
- ディレクトリ整理を理由に起動順を変更しない。順序変更が必要な場合は依存関係と初期化イベントを確認してから行う。

## 2. ディレクトリ

| ディレクトリ | 主な責務 |
| --- | --- |
| `frontend/src/v39/bootstrap/` | 起動入口、段階ロード、既存モジュール順の管理 |
| `frontend/src/v39/core/` | ゲーム状態ブリッジ、セーブ、ターン、時計、活動ログ |
| `frontend/src/v39/map/` | フィールド実行、マップ表示、視界、地形、カメラ、配置、火山 |
| `frontend/src/v39/combat/` | 戦闘実行、戦闘フィードバック、エフェクト、死亡処理 |
| `frontend/src/v39/unit/` | キャラクター派生値、装備、部隊、移動、待機、物流、指揮 |
| `frontend/src/v39/ai/` | 敵AI、勢力AI、敵生成、巣、略奪、敵ターン演出、計測 |
| `frontend/src/v39/world/` | 拠点、経済、研究、外交、調査、領土修復、ワールド人口 |
| `frontend/src/v39/ui/` | 共通UI、通知、操作UI、表示設定、旧UI接続、入力モーダル、v39テーマCSS |
| `frontend/src/v39/dev/` | テストデータ、テストツール、パフォーマンス計測 |

## 3. v39外に残す共通処理

- `frontend/src/lib/` は、v39だけに閉じない純粋ルール・計算・データ参照ヘルパーを置く。
- `frontend/src/constants/` と `frontend/src/composables/` は既存の共通定義・共通処理として維持する。
- Web Worker は `frontend/src/workers/` に置く。
- Excelから生成する `data/source/export/json/*.json` は生成物であり、コード整理の都合で項目を追加・変更しない。

## 4. 依存の基本方針

- `bootstrap/` は各機能ディレクトリを読み込むだけにし、ゲームロジックを持たせない。
- v39各モジュールから共通計算が必要な場合は、既存の `lib/` を再利用する。
- 同じ種類・数値・選択肢をv39側へ複製しない。
- UIは共通ゲーム状態・配列を参照し、HTMLへ仮データを直接置いて後から上書きしない。
- ファイル移動時は静的import、動的import、`new URL(..., import.meta.url)`、`import.meta.glob` の相対パスを同時に更新する。

## 5. bootstrap の段階

### core
状態、共通UI、フィールド基盤、設定、セーブ、ターンを先に初期化する。

### game
配置、ユニット、敵、物流、ワールド処理、戦闘、AIを既存順で初期化する。

### final
キャラクター詳細、土地詳細、地形表示、部隊表示、研究、ドキュメント表示など最終UIを初期化する。

この3段階は責務の整理であり、ゲームターンの処理順を表すものではない。
