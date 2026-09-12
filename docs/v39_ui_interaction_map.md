# v39 UI 操作・イベント設計書

> このファイルを **v39画面のボタン / イベント / モーダル遷移の正本（Single Source of Truth）** とする。
>
> UI修正時は、実装前にこの設計書を確認し、イベント・ID・呼び出し先を変更した場合は **同じ変更単位でこの設計書も更新する**。

## 1. 設計ルール

UI操作は必ず以下の流れを明示する。

`表示要素 → DOM識別子 → イベント → 呼び出しメソッド → 引数 → 表示先 → 更新状態`

### 必須ルール

- 同じ意味のボタンは、できるだけ同じ名前付きメソッドを呼ぶ。
- `onclick = ()=> ...` のような匿名処理を増やさない。
- モーダルを開く処理は `openXxxModal(...)`、閉じる処理は `closeXxxModal()` を基本命名とする。
- ボタンの見た目だけで判定せず、`id` / `data-*` / class をこの設計書に記録する。
- スマホ・PCで同一機能への入口が複数ある場合、最終的に呼ぶメソッドは共通化する。
- Phaserのフィールド操作とHTML UI操作はイベント領域を分ける。

---

## 2. 研究 UI

### 2.1 左サイド研究レール

対象DOM:

- 親: `#researchRail`
- ボタン: `.research-rail-btn[data-research]`

現在の研究項目:

| 表示 | DOM | data-research | 操作 | 呼ぶメソッド（正本） | 開く画面 | 備考 |
|---|---|---:|---|---|---|---|
| 鍛冶 | `.research-rail-btn` | `鍛冶` | click/tap | `openResearchModal("鍛冶")` | `#researchModal` | 左サイドの研究項目 |
| 魔法 | `.research-rail-btn` | `魔法` | click/tap | `openResearchModal("魔法")` | `#researchModal` | 左サイドの研究項目 |
| 信仰 | `.research-rail-btn` | `信仰` | click/tap | `openResearchModal("信仰")` | `#researchModal` | 左サイドの研究項目 |
| 軍事 | `.research-rail-btn` | `軍事` | click/tap | `openResearchModal("軍事")` | `#researchModal` | 初期 active / 研究中 |
| 経済 | `.research-rail-btn` | `経済` | click/tap | `openResearchModal("経済")` | `#researchModal` | 左サイドの研究項目 |

### 2.2 研究レール押下時の処理順

`openResearchModal(researchType)` は以下を行う。

1. `researchType` を選択中研究カテゴリとして保存する。
2. `#researchRail .research-rail-btn` の `active` を全解除する。
3. 対応する `[data-research="..."]` に `active` を付ける。
4. `#researchModal` 内へ選択カテゴリを反映する。
5. `#researchModal` に `open` class を付けて表示する。
6. 必要なら研究詳細 / 研究ツリーを更新する。

**重要:** 左サイド研究項目を押したときに開く画面は `#researchModal`。別の研究カテゴリ一覧画面ではない。

### 2.3 現在の実装状態

現在の基準HTMLでは次の匿名click処理になっている。

```js
document.querySelectorAll(".research-rail-btn").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".research-rail-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  document.getElementById("researchModal").classList.add("open");
  say("研究対象を「"+b.dataset.research+"」に変更（仮）");
}));
```

今後はこの処理を `openResearchModal(researchType)` に集約する。

### 2.4 研究モーダル

- ID: `#researchModal`
- 種別: `.modal-backdrop`
- 開くclass: `.open`
- 閉じるボタン: `[data-close]`
- タイトル: `研究`

研究モーダル内に表示するもの:

- 選択中研究カテゴリ名
- 研究Lv / EXP
- 研究項目または研究ツリー
- 選択した研究項目の詳細
- 研究開始 / 研究変更に必要な操作（実装時に追記）

**設計上、左サイド研究レール自体をモーダル内部へ複製する必要はない。**

---

## 3. 共通モーダル呼び出し

基準HTMLには `data-open="xxx"` → `#xxxModal` という共通規則がある。

現行の共通処理:

```js
document.querySelectorAll("[data-open]").forEach(b => {
  b.onclick = () => document.getElementById(b.dataset.open + "Modal").classList.add("open");
});
```

設計上は、主要画面については個別の名前付きメソッドへ順次置き換える。

| 表示/機能 | DOM指定 | 現行data-open | 正本メソッド | 開くモーダル |
|---|---|---|---|---|
| 自キャラ / 部隊 | `[data-open="character"]` | `character` | `openCharacterModal()` | `#characterModal` |
| 都市・建設 | `[data-open="build"]` | `build` | `openBuildModal()` | `#buildModal` |
| 装備 | `[data-open="equipment"]` | `equipment` | `openEquipmentModal()` | `#equipmentModal` |
| ユニット作成 | `[data-open="unitCreate"]` | `unitCreate` | `openUnitCreateModal()` | `#unitCreateModal` |
| 統治者ログ | `[data-open="rulerLog"]` | `rulerLog` | `openRulerLogModal()` | `#rulerLogModal` |
| 設定 | `[data-open="settings"]` | `settings` | `openSettingsModal()` | `#settingsModal` |

閉じる操作:

| DOM | イベント | 正本メソッド | 処理 |
|---|---|---|---|
| `[data-close]` | click/tap | `closeModal(button)` | 最寄り `.modal-backdrop` から `open` を外す |
| Escape | keydown | `closeAllModals()` | 全 `.modal-backdrop` の `open` を外す |

---

## 4. 下部メインタブ

固定タブ:

`部隊 / 戦闘 / 土地 / 土地データ / 管理`

※ 独立した「ユニット」タブは作らない。

設計上の共通メソッド:

```js
selectFooterTab(tabId)
```

処理:

1. 全 `.footer-tab` の active を解除。
2. 選択したタブへ active を付与。
3. 対応する footer body panel のみ表示。
4. 画面ごとの初期描画処理が必要なら、その後に呼ぶ。

詳細なID対応は実装確認後に追記する。

---

## 5. フィールド設定

入口:

`管理タブ → フィールド設定`

正本メソッド:

```js
openFieldSettingsModal()
```

開く画面:

`#fieldSettingsModal`（IDは正式実装時にこの名前へ統一）

生成:

```js
generateFieldFromSettings(settings)
```

処理:

1. カスタム設定画面で値を入力。
2. 「生成」を押す。
3. UI値を `settings` に正規化。
4. `createTerrainMapData(settings)` を呼ぶ。
5. Phaserフィールドを生成 / 再描画。
6. 設定画面を閉じる。

主要設定値:

- `w`
- `h`
- `patternId`
- `mountainMode`
- `islandCustomSettings`
- 河川 / 滝 / 特殊地形関連（既存仕様から順次追記）

---

## 6. 設計書ビューア

入口:

`管理タブ → 設計書`

| 項目 | 内容 |
|---|---|
| 管理タブ | `#footManage` |
| ボタン | `#v39-manage-design-docs.manage-tile` |
| イベント | `click/tap` |
| 正本メソッド | `openDesignDocsModal()` |
| 現行公開メソッド | `window.openDesignDocsModal` |
| 開くモーダル | `#v39-design-docs-modal` |
| 実装ファイル | `frontend/src/v39-design-docs-viewer.js` |
| 状態 | 実装済み |

設計書の取得:

```js
import.meta.glob("../../docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default"
})
```

動作:

1. Viteビルド時に `docs/` 以下のすべての `.md` を収集する。
2. モーダル左側（スマホでは上側）に設計書一覧を表示する。
3. 一覧から選択したMarkdownを右側（スマホでは下側）へ表示する。
4. ファイル名・Markdown内の先頭 `# 見出し` を検索対象とする。
5. 新しい `.md` を `docs/` へ追加した場合、次回ビルド時に自動で一覧へ追加する。
6. 初回表示時は `docs/v39_ui_interaction_map.md` が存在すれば優先して開く。

**重要:** GitHub Pages上ではフォルダ列挙APIに依存しない。設計書一覧はビルド成果物に含める。

---

## 7. 設計書更新ルール

新しいボタンや画面を実装するときは、最低限以下を記載する。

| 項目 | 必須内容 |
|---|---|
| 表示名 | ユーザーが画面で見る名前 |
| DOM | `id` / class / `data-*` |
| イベント | click / pointerdown / change 等 |
| メソッド | 呼び出す名前付き関数 |
| 引数 | メソッドに渡す値 |
| 表示先 | modal ID / panel ID / Phaser処理 |
| 状態 | 更新するstate / dataset / selected値 |
| 実装ファイル | 実際に処理があるファイル |
| 状態 | 未実装 / 仮実装 / 実装済み |

---

## 8. 現在の優先修正

1. 左サイド研究レール → `openResearchModal(researchType)` を正式化。
2. `#researchModal` のUIを「左サイド研究項目をタップした時に開く画面」として修正。
3. 研究モーダル内部へ不要な研究カテゴリ一覧を複製しない。
4. 以後、各UI機能をこの設計書へ追記してから修正する。
