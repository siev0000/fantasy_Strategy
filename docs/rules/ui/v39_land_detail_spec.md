# v39 土地タブ詳細仕様
## UI235: 土地から領土拡張

- 概要の先頭に未所属マスの「領土に加える」を表示する。不可の場合も理由を併記。押すと選択マスを保持したまま拠点の領土拡張表示へ移り、編入先と開始を確認する。独自の取得処理/別モーダルは作らない。
- 自軍の開拓計画があるマスは残りTと中止を表示。拠点ヘッダーの領土拡張と同じ `v39-land-expansion-ui.js` / `v39-land-expansion-rules.js` を使用する。既に領有済みのマスには取得ボタンを表示しない。

> 選択中マップタイルと下部 `土地` タブの表示連携の正本。

## UI210: 固定ヘッダーと4タブ（2026-10-29）

- UI211修正: HTMLの旧 `#footTile.land-panel` に3列/外側スクロールの `!important` 指定が残り、実画面でヘッダー・タブ・本文が横へ並んだ。旧指定を削除し、共通CSSで1列・`auto auto minmax(0,1fr)` の3段に統一。Node検査に旧指定の混入防止を追加。画面確認はユーザー側。
- UI212: 「交流へ」は削除。概要の「領土状態」に都市規模と当該マスへ接する完成壁/結界の現在HP・最大HPを併記する（複数辺は種類ごとに合計、破壊済み/期限切れは除外）。視界外は耐久値を出さず未確認。建築・設備には従来の辺別の詳細を残す。
- 都市の「町状態」は中心座標だけでなく、既存の占有マス計算 `currentDevelopmentOccupiedTiles` で解決する。周囲の都市3マス/大都市7マスも同じ拠点名・規模・人口を表示し、別ワールドや単なる領土へ広げない。壁結界テストは占有中心の対応だけでなく、全占有マスの居住レベルと居住モードも設定する。領土や規模の仕様変更ではなく表示漏れとテスト設定の補完。

- ヘッダーは地形名・座標・所有者。直下のタブも固定し、`#v39-land-scroll` の本文だけをスクロールする。本文をヘッダーの裏へ流すsticky方式ではない。
- **概要**: 地形・高度・領土/町状態（壁・結界耐久を併記）・施設の要約・ユニット・敵・探索/回収・洞窟エリア・覇権地。「交流へ」は置かず、交流は左の専用タブを使用。
- **生産**: 特産資源、地形基本産出、通常産出見込み、特産品固定収入、当該マスの施設補正。基本産出はゲーム共通係数適用後・人口/施設等の倍率適用前。自領の見込みだけを共通のマス産出計算から取得し、拠点の通常生産補正を適用。維持費・取引予約・定期採取は別処理のため含めない。洞窟内は採取して携帯する案内を表示する。
- **環境**: 天候・気温/乾燥・霧/災害/危険地帯・浄化・回復/移動/隠密等の地形補正・川/火山/地形破壊。効果なしの場合はその旨を一行表示。危険度未設定・川なし等の補助行は非表示とする。
- **建築・設備**: 建築・居住化切替・開拓難易度・施設操作・壁/結界・鉱床輸送/入口警備。建築中の独立画面は従来どおり維持し、土地を変更しても閉じない。他領・未所属での着工は既存判定で禁止。
- タブ選択は土地の選び直し・ゲーム状態更新・他の縦タブからの復帰でも維持する。切替時だけ本文のスクロール位置を先頭へ戻す。左右/Home/Endキーでも切替可能。
- 項目の分類とタブの表示制御は `frontend/src/v39/ui/v39-land-tabs.js`、生産表示は `frontend/src/v39/map/v39-land-production.js`、既存詳細更新は `frontend/src/v39/map/v39-land-detail.js`。既存のDOM IDと操作処理を再利用する。
- 検証: `scripts/check-v39-land-tabs-headless.mjs` でタブ/ARIA/項目分類・生産予測の純粋性・自領外/洞窟・スクロール構造をNode検査。スマホ/PCの実画面確認はユーザー側で行う。

## 1. 対象

- 下部タブ: `土地`
- パネル: `#footTile`
- 生成地形表示: `frontend/src/v39/map/v39-land-detail.js`
- ゲーム状態bridge: `frontend/src/v39-game-state-bridge.js`
- 入力イベント: `v39:tile-selected`
- フィールド再生成イベント: `v39:field-generated`
- ゲーム状態更新イベント: `v39:game-state-changed`

## 2. 基本方針

土地タブは、生成マップデータとゲーム進行データを同じ座標で合成して表示する。

生成ルールとゲーム状態を混在させない。

- 地形・高度・川・特殊地形・強敵候補: `window.__v39FieldRuntime.mapData`
- 領土・危険度・施設・ユニット・町・領土開発・回復・移動停止・通常敵: `v39-game-state-bridge.js`

ゲーム本体側の各機能は、土地タブDOMを直接操作せずbridgeへ状態を渡す。
土地タブは `v39:game-state-changed` を受けて現在選択中のマスを再描画する。

## 3. 生成マップ情報

`window.__v39FieldRuntime.mapData` から以下を読む。

- `grid[y][x]` : 基本地形
- `reliefMap[y][x]` : 地勢
- `specialMap[y][x]` : 特殊地形
- `heightLevelMap[y][x]` : 高度Lv
- `heightMap[y][x]` : 高度Raw
- `riverData.riverTouchSet` : 川接触
- `riverData.riverSet` : 川
- `riverData.largeRiverSet` : 大河
- `riverData.waterfallSet` : 滝
- `strongMonsterMap[y][x]` : 強敵候補
- `strongMonsterInfoMap[y][x]` : 強敵生成情報

## 4. ゲーム状態bridge

ゲーム状態は以下の公開APIへ集約する。

```js
window.getV39GameState()
window.setV39GameState(patch)
window.updateV39TileState(x, y, patch)
window.clearV39GameState()
```

状態更新時:

```js
window.dispatchEvent(new CustomEvent("v39:game-state-changed", {
  detail: { reason, state }
}));
```

現在のstate contract:

```js
{
  factionLabels: {},
  territoryOwnerByTile: {},
  dangerPercentByTile: {},
  facilitiesByTile: {},
  units: [],
  settlements: [],
  territoryStateByTile: {},
  recoveryPercentByTile: {},
  lastMoveStop: null,
  enemies: []
}
```

座標キーは `"x,y"` 形式で統一する。

### 領土

`territoryOwnerByTile["x,y"]`

旧表示ルールを維持する。

- `player` → `自領`
- `enemy` → `敵領`
- 勢力ID → `factionLabels` を解決して `○○領`
- 値なし → `未所属`

### 危険度

`dangerPercentByTile["x,y"]`

数値がある場合は `%` 表示する。
値がなく、生成地形側が強敵候補なら `強敵候補` と表示する。
独自の危険度計算は土地UI側で作らない。

### 施設

`facilitiesByTile["x,y"]`

文字列 / オブジェクト / 配列を受け、複数なら `/` で連結する。

### ユニット

`units[]` の `x / y` が選択座標と一致するものを列挙する。

表示:

- `name`
- Lvが存在すれば `name LvN`

### 町状態

`settlements[]` の `x / y` が一致するものを使用する。

表示対象:

- 名前
- 規模
- 人口

旧ゲーム側の村・町・都市状態を移植する際はこの配列へ同期する。

### 領土状態

`territoryStateByTile["x,y"]`

文字列、または `label / modeLabel / mode / type` を表示する。
進捗率があれば `%` も表示する。

### 回復補正

`recoveryPercentByTile["x,y"]`

`+N% / -N%` 形式。
値なしは `+0%`。

### 移動停止

```js
lastMoveStop = {
  x,
  y,
  reason
}
```

選択マスと一致した場合だけ理由を表示する。

### 敵

`enemies[]` の `x / y` が一致するものを列挙する。
Lvがあれば `name LvN`。
生成地形側の強敵候補情報も併記する。

## 5. 土地タブ表示

既存の12枠をそのまま使用する。

| 表示 | DOM | データ |
|---|---|---|
| 地形 / 座標 | `#v39-land-terrain` | 地形、地勢、特殊地形、座標 |
| 領土 | `#v39-land-owner` | `territoryOwnerByTile` |
| 危険度 | `#v39-land-danger` | `dangerPercentByTile` / 強敵候補 |
| 高度 | `#v39-land-height` | `Lv n / Raw n` |
| 施設 | `#v39-land-facility` | `facilitiesByTile` |
| ユニット | `#v39-land-units` | `units[]` |
| 町状態 | `#v39-land-settlement` | `settlements[]` |
| 領土状態 | `#v39-land-territory-state` | `territoryStateByTile` |
| 回復補正 | `#v39-land-recovery` | `recoveryPercentByTile` |
| 移動停止 | `#v39-land-move-stop` | `lastMoveStop` |
| 川 / 滝 | `#v39-land-river-waterfall` | riverData |
| 敵 | `#v39-land-enemies` | `enemies[]` / 強敵候補 |

## 6. 更新タイミング

### タイル選択

```text
Phaser pointer selection
  ↓
v39:tile-selected
  ↓
v39-land-detail.js
  ↓
mapData + v39 game state を座標で合成
  ↓
#footTile の既存表示を更新
```

### ゲーム状態変更

```text
各ゲーム機能
  ↓
setV39GameState / updateV39TileState
  ↓
v39:game-state-changed
  ↓
現在選択中の土地を再描画
```

### フィールド再生成

`v39:field-generated` を受けたら選択状態を破棄し、土地タブを `マスを選択` に戻す。

## 7. 公開API / 通知

現在選択中の完全な土地詳細:

```js
window.getV39SelectedLandDetail()
```

強制再描画:

```js
window.refreshV39LandDetail()
```

土地詳細更新後:

```js
window.dispatchEvent(new CustomEvent("v39:land-detail-updated", {
  detail
}));
```

## 8. 既存ゲーム機能の接続ルール

今後、領土・村・ユニット・敵などの旧ロジックをv39へ復旧するときは、旧ロジックの判定結果をbridgeへ同期する。

例:

```js
window.setV39GameState({
  units,
  enemies,
  settlements
});

window.updateV39TileState(x, y, {
  owner: "player",
  dangerPercent: 12,
  facilities: ["監視塔"],
  territoryState: "居住地",
  recoveryPercent: 10
});
```

土地UI側でゲームルールを再実装しない。
Fog / 未探索情報制限も、Fog機能を復旧するときに既存ルールをbridgeまたは土地表示へ接続する。
