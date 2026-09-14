# v39 UI 操作・イベント設計書

> このファイルを **v39画面の固定UI / ボタン / タブ / モーダル遷移の正本（Single Source of Truth）** とする。
>
> UIを変更する場合は、実装と同じ変更単位でこの設計書も更新する。

## 1. 基本方針

UI操作は以下の流れを明示する。

`表示要素 → DOM識別子 → イベント → 呼び出し処理 → 表示先 / 更新状態`

### 1.1 固定UIと動的UI

画面の固定領域は `frontend/index.html` に最初から存在させる。下部操作UIの内容は固定値をHTMLへ二重記載せず、`v39-operation-ui.js` の定義配列から初期描画する。

固定UI:

- 上部バー
- 左サイド研究レール
- 下部操作UIの空マウント先 `.footer`
- `フィールド設定`
- `設計書`
- `表示設定`
- 既知の固定モーダル入口

動的生成してよいもの:

- Phaser canvas
- マップタイル / 選択表示 / 経路 / 範囲 / ユニット
- データ件数で増減するカードや一覧
- 下部タブ `部隊 / 行動 / 土地 / 管理` と各パネル
- 管理メニュー
- 研究ツリー / 研究項目
- ログ行
- 設計書一覧 / 設計書本文

### 1.2 禁止事項

- `document.open()` / `document.write()` / `document.close()` による画面全体の再生成
- マップ生成を契機に固定UIを作り直す処理
- 同じ固定ボタンを複数runtimeから `createElement()` する実装
- Phaser再生成時にfooter / 管理 / 研究レールを破棄する実装

### 1.3 現在の起動構成

```text
frontend/index.html
  ↓ 固定領域と空の操作UIマウント先を読み込む
frontend/src/v39-bootstrap.js
  ↓ 定義配列から操作UIを初期描画
v39-operation-ui.js
  ↓ イベントを接続
v39-legacy-ui.js
v39-field-runtime-final.js
v39-field-settings-entry.js
v39-research-ui.js
v39-design-docs-viewer.js
```

`v39-bootstrap.js` は初期化順だけを管理する。操作UIは全機能の接続が終わるまで非表示とし、古い固定値や未初期化状態を一瞬表示しない。

現在のv39画面で使用するテスト編成は `data/source/export/json/テストゲーム状態.json` に置く。このJSONではプレイヤー、所属部隊、配置座標、種族、クラス、Lv、装備、現在HP率、現在AP、土地の選択条件だけを指定する。`frontend/src/v39-test-data.js` はその指定からキャラクターと表示データを生成し、`v39-operation-ui.js` は画面構造だけを定義する。

生成時は `クラス.json` からHP・基礎ステータス・技能・取得技、`スキル一覧.json` から技詳細、`装備.json` から装備性能、`地形.json` から土地性能を取得する。固定のHP・ステータス・技性能・装備性能・地形性能をJavaScriptへ重複定義しない。これはローカル画面確認用であり、通信済みまたは保存済みの本番ゲームデータとして扱わない。

プレイヤー所有データはトップレベルへ平坦化せず、既存マップ保存形式と同じ構造で扱う。

```text
players[]
  ├─ id / label / isPlayer / ready
  └─ factionState
       ├─ village
       ├─ units[] / squads[] / deadUnitReserve[]
       ├─ selectedUnitId
       ├─ villagePlacementMode / moveCommandUnitId
       ├─ nationLogKey / encounterMoveLocks
       ├─ visibility
       └─ research
activePlayerId
```

部隊・キャラクターなどの操作UIは、`activePlayerId`に一致する`players[].factionState`だけを参照する。別プレイヤーのデータをトップレベルの単一`units[]`へ混在させない。

1プレイヤー分の空状態と正規化処理は `frontend/src/lib/player-state.js` を唯一の生成元とする。必須項目の機械可読な定義は `config/player_state_schema.json` を参照する。旧 `config/entity_data_schema.json` は競合マーカーを含む旧設計資料のため、現行プレイヤー型の正本には使用しない。

### 1.4 下部UIとモーダルの使い分け

**普段のゲーム操作は下部UIを基本とし、モーダルは例外用途に限定する。**

下部UIへ置くもの:

- 部隊切替 / 部隊情報
- 行動選択
- 土地情報
- 管理メニュー
- 表示設定
- 短時間で繰り返し使うゲーム操作

モーダルを使うもの:

- 文字入力
- 装備在庫など大きい一覧
- 建設など広い詳細画面
- 研究詳細など下部だけでは狭い画面
- 設計書viewer
- 確認ダイアログ

**モーダルを完全廃止して下部だけへ詰め込まない。**

### モーダルと旧UIの整理

| 機能 | 現行の扱い | 理由 |
| --- | --- | --- |
| 研究 | モーダルを維持 | 5系統、研究一覧、担当、詳細を同時に扱う |
| キャラクター・部隊 | モーダルを維持 | 全所属キャラクターの詳細確認に使う |
| 装備一覧・生成・付与 | モーダルを維持 | 在庫、装備、生成、付与の詳細操作に使う |
| 都市・建設 | モーダルを維持 | 全施設候補と条件・費用の確認に使う |
| ゲーム設定・保存 | モーダルを維持 | 表示以外の設定とセーブ入出力に使う |
| 活動ログ | モーダルを維持 | 最大300件をスクロール表示する |
| ユニット作成 | 下部の管理UIへ統合 | 現在のプレイヤー・配置状態を見ながら操作する |
| 地図表示設定 | 下部の管理UIへ統合 | 変更結果をフィールドで即時確認する |
| 旧SVGマップ・固定ユニット | 廃止 | Phaserと共通ゲーム状態へ統一済み |
| 旧固定資源値 | 廃止 | 初回描画からプレイヤー状態を参照する |

理由:

- スマホのソフトキーボードで下部UIが潰れる。
- 大きい一覧を下部へ入れると、マップと両方が狭くなる。
- 普段のゲーム操作と管理・詳細作業を分離できる。

---

## 2. 下部操作UI

### 2.1 固定タブ

現在の正本:

`部隊 / 行動 / 土地 / 管理`

対応:

| 表示 | data-foot | パネルID |
|---|---|---|
| 部隊 | `squad` | `#footSquad` |
| 行動 | `action` | `#footAction` |
| 土地 | `tile` | `#footTile` |
| 管理 | `manage` | `#footManage` |

旧 `戦闘` は `行動` へ変更済み。

旧 `土地データ` は `土地` へ統合済み。地形・領土・危険度・町状態・回復補正・川・敵など、選択マスに属する情報は同じ土地パネルで扱う。

### 2.2 レイアウト

- タブは操作UI左側へ縦並び。
- 内容パネルは右側だけ切り替える。
- PC / スマホ縦では、フィールドと下部UIを上下に分離する。
- スマホ横では操作UIを右側領域として配置する。
- 画面サイズで変えてよいのは主に配置方向。
- 操作UI内部のカード形式や機能構造をviewportごとに別物にしない。
- 旧 `.faction-panel` は部隊 / 行動と重複するためDOM・専用処理ともに削除済み。

### 2.3 タブ切替

`frontend/src/v39-operation-ui.js` の `activateFooterTab()` が、以下を切り替える。

- `.footer-tab` のactive
- 対応パネルの `hidden`
- `aria-hidden`
- `.v39-footer-panel-active`

マップ生成処理からfooterタブ状態を変更しない。

---

## 3. 研究UI

### 3.1 左サイド研究レール

入口:

- 親: `#researchRail`
- ボタン: `.research-rail-btn[data-research]`

左サイドの研究項目をタップした場合に開く画面は **`#researchModal`**。

研究カテゴリ例:

- 鍛冶
- 魔法
- 信仰
- 軍事
- 経済
- 学術（UIメタ定義あり）

### 3.2 研究モーダル

- backdrop: `#researchModal`
- shell: `#researchModal > .modal`
- close: 既存closeボタン
- UI調整: `frontend/src/v39-research-ui.js`

現在の `v39-research-ui.js` は、既存モーダルDOMを破棄せず内容を整形する。

PC:

- 左: `.research-category-list`
- 右: `.research-content`

スマホ:

- 上: 研究カテゴリ横スクロール
- 下: 研究内容

現在のモーダル内部には研究カテゴリ一覧が存在する。以前の「カテゴリ一覧をモーダルへ複製しない」という旧方針は、現実装には適用しない。

### 3.3 研究表示状態

選択中カテゴリは以下で示す。

- `.research-rail-btn.active`
- `.research-selected-chip`
- `--research-accent`

研究ツリー本体 / 研究内容は今後データ接続する領域として扱う。

---

## 4. 土地 / マップ選択連携

Phaser上でタイルを選択すると、`v39-field-runtime.js` が選択情報を更新する。

主な通知:

```js
window.dispatchEvent(new CustomEvent("v39:tile-selected", {
  detail: {
    x,
    y,
    terrain,
    height,
    special
  }
}));
```

現行では土地表示の一部として `#landTerrain` も更新する。

選択枠はPhaser側で描画し、固定HTMLの土地タブ自体は作り直さない。

詳細なマップ操作は `docs/v39_map_interaction_spec.md` を正本とする。

---

## 5. 管理タブ

親パネル:

`#footManage`

### 5.1 管理メニュー

通常メニュー:

`#v39-manage-menu`

固定入口の例:

- 自キャラ
- 都市・建設
- 装備
- ユニット作成
- ログ
- フィールド設定
- 設計書
- 表示設定

固定入口ボタンは `frontend/index.html` 側に置く。

### 5.2 表示設定

入口:

`管理 → 表示設定`

表示設定はモーダルではなく `#footManage` 内で切り替える。

設定パネル:

`#v39-display-settings-panel`

主なDOM:

| 設定 | DOM | 初期値 |
|---|---|---:|
| 文字の大きさ | `#v39-font-size` | 100% |
| 高低差がある境界だけ表示 | `#v39-height-outline-only` | ON |
| 高度による色の濃淡 | `#v39-height-shading` | ON |
| 地図の拡大縮小ボタン | `#v39-show-zoom-controls` | ON |
| 最大拡大率 | `#v39-max-zoom-factor` | **10倍** |
| 画面の動きを減らす | `#v39-reduce-motion` | OFF |
| 初期値へ戻す | `#v39-display-settings-reset` | - |

最大拡大率の仕様:

- 設定可能範囲: **6倍〜16倍**
- step: 1倍
- 初期値: **10倍**
- 値は「初期fit倍率に対する倍率」とする。
- スマホでもPCでも同じ設定値を使用する。
- 小さい画面でマス目が小さすぎる場合はユーザーが上限を引き上げられる。

保存先:

```text
localStorage: v39-display-settings-v1
```

変更通知:

```js
v39:display-settings-changed
```

現在の公開参照:

```js
window.getV39DisplaySettings()
```

表示設定変更でマップ生成データを作り直さない。必要な描画 / カメラ上限だけ更新する。

---

## 6. フィールド設定

入口:

`管理 → フィールド設定`

固定ボタン:

`#v39-manage-field-settings.manage-tile`

イベント接続:

`frontend/src/v39-field-settings-entry.js`

公開関数:

```js
window.openFieldSettingsModal()
```

### 現在の状態

現時点では `#v39-field-settings-placeholder` を開く **仮画面**。

未接続:

- マップサイズ
- 島構成
- 山岳設定
- 河川設定
- 生成ボタン

最終仕様:

```text
フィールド設定を開く
  ↓
既存カスタム設定値を入力
  ↓
生成
  ↓
createTerrainMapData(settings)
  ↓
Phaserフィールドのみ再生成
```

既存生成設定を再利用し、新しい独自ルールは作らない。

---

## 7. 設計書ビューア

入口:

`管理 → 設計書`

固定ボタン:

`#v39-manage-design-docs.manage-tile`

実装:

`frontend/src/v39-design-docs-viewer.js`

公開関数:

```js
window.openDesignDocsModal()
window.closeDesignDocsModal()
```

モーダル:

`#v39-design-docs-modal`

設計書取得:

```js
import.meta.glob("../../docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default"
})
```

仕様:

1. `docs/**/*.md` をビルド時に収集する。
2. 一覧から設計書を選択する。
3. Markdown本文をviewerへ表示する。
4. ファイル名 / タイトルで検索できる。
5. `v39_ui_interaction_map.md` があれば初期表示候補にする。
6. GitHub Pages上でGitHub APIによるフォルダ列挙はしない。

---

## 8. 文字入力専用モーダル

### 8.1 目的

スマホで名前変更などの文字入力を行う場合、下部UI内のinputを直接編集させず、**文字入力専用モーダルを使用する**。

対象例:

- キャラクター名
- 部隊名
- 都市 / 村名
- 任意名称
- メモ / 短文入力

スマホでは原則このモーダルを使用する。

PCでも同じAPIを利用してよい。入口側がデバイスごとに別ロジックを持たないことを優先する。

### 8.2 正本DOM

予定ID:

```text
#v39-text-input-modal
#v39-text-input-title
#v39-text-input-field
#v39-text-input-cancel
#v39-text-input-confirm
```

複数行入力が必要な場合は同じモーダル内で `textarea` モードへ切り替える。

### 8.3 正本API

```js
openTextInputModal(options)
```

推奨形式:

```js
const value = await openTextInputModal({
  title: "部隊名を変更",
  value: currentName,
  placeholder: "部隊名",
  maxLength: 30,
  multiline: false,
  inputMode: "text",
  confirmText: "決定"
});
```

戻り値:

- 決定: 入力文字列
- キャンセル: `null`

### 8.4 挙動

1. 開いた直後に入力欄へfocusする。
2. 既存値がある場合は選択しやすい状態にする。
3. 単一行ではEnterで決定できる。
4. 複数行ではEnterを改行として扱う。
5. Escape / キャンセルで `null`。
6. スマホではソフトキーボード表示中でも決定 / キャンセルが見えるレイアウトにする。
7. backdrop誤タップだけで入力内容を破棄しない。
8. `maxLength` 等の入力制約は呼び出し側から渡す。
9. 各機能が独自のprompt / 独自入力モーダルを増やさない。

---

## 9. 共通モーダル

既存HTMLには `data-open` を使う入口がある。

主要画面について、最終的には名前付き関数へ寄せる。

| 機能 | 正本メソッド名 | 表示先 |
|---|---|---|
| 自キャラ / 部隊 | `openCharacterModal()` | `#characterModal` |
| 都市・建設 | `openBuildModal()` | `#buildModal` |
| 装備 | `openEquipmentModal()` | `#equipmentModal` |
| ユニット作成 | `openUnitCreateModal()` | `#unitCreateModal` |
| 統治者ログ | `openRulerLogModal()` | `#rulerLogModal` |
| 研究 | `openResearchModal(researchType)` | `#researchModal` |
| フィールド設定 | `openFieldSettingsModal()` | `#v39-field-settings-placeholder`（現状） |
| 設計書 | `openDesignDocsModal()` | `#v39-design-docs-modal` |
| 文字入力 | `openTextInputModal(options)` | `#v39-text-input-modal` |

Escape / closeボタンは対象モーダルを閉じる。

---

## 10. UI変更時の更新ルール

新しいUI機能を追加・変更した場合は最低限以下をこの設計書へ追記する。

| 項目 | 内容 |
|---|---|
| 表示名 | 画面上の名称 |
| DOM | id / class / data-* |
| イベント | click / pointer / change 等 |
| 呼び出し処理 | 関数 / runtime |
| 表示先 | panel / modal / Phaser |
| 更新状態 | localStorage / dataset / map state 等 |
| 実装ファイル | 実ファイル |
| 実装状態 | 実装済み / 仮 / 未実装 |

特に以下を変更した場合は必ず同時更新する。

- footerタブ数・名称
- 管理メニュー
- 研究入口 / 研究モーダル
- マップ入力
- 表示設定
- 文字入力方式
- 固定DOM ID
- runtime公開関数

---

## 11. 現在の実装状態まとめ

| 機能 | 状態 |
|---|---|
| 固定v39 HTML | 実装済み |
| bootstrapでruntime読込 | 実装済み |
| 4タブ `部隊 / 行動 / 土地 / 管理` | 実装済み |
| 旧右サイド非表示 | 実装済み |
| 表示設定 | 実装済み |
| 最大拡大率設定 | **設計確定 / 未実装** |
| 設計書viewer | 実装済み |
| 文字入力専用モーダル | **設計確定 / 未実装** |
| 研究モーダルUI整形 | 実装済み |
| Phaserマップ操作 | 実装進行済み（詳細はマップ設計書） |
| フィールドカスタム設定 | 仮画面 / 未接続 |
| 既存ゲーム全機能接続 | 進行中 |
