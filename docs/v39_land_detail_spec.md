# v39 土地タブ詳細仕様

> 選択中マップタイルと下部 `土地` タブの表示連携の正本。

## 1. 対象

- 下部タブ: `土地`
- パネル: `#footTile`
- 生成地形表示: `frontend/src/v39-land-detail.js`
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
