# v39 土地タブ詳細仕様

> 選択中マップタイルと下部 `土地` タブの表示連携の正本。

## 1. 対象

- 下部タブ: `土地`
- パネル: `#footTile`
- 実装: `frontend/src/v39-land-detail.js`
- 入力イベント: `v39:tile-selected`
- フィールド再生成イベント: `v39:field-generated`

## 2. 基本方針

土地タブは、選択したタイルに対して現在接続済みのゲームデータだけを表示する。

未接続の領土・町・施設・ユニット・通常敵・危険度などについて、固定ダミー値を表示し続けない。
ゲーム本体との接続がまだない項目は `未接続` / `未所属` / `なし` / `-` を使用する。

## 3. 現在接続済みの生成マップ情報

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

## 4. 土地タブ表示

既存の12枠をそのまま使用する。

| 表示 | DOM | 現在の値 |
|---|---|---|
| 地形 / 座標 | `#v39-land-terrain` | 地形、地勢、特殊地形、座標 |
| 領土 | `#v39-land-owner` | ゲーム領土接続前は `未所属` |
| 危険度 | `#v39-land-danger` | 強敵候補なら `強敵候補`、通常危険度は未接続 |
| 高度 | `#v39-land-height` | `Lv n / Raw n` |
| 施設 | `#v39-land-facility` | 施設接続前は `なし` |
| ユニット | `#v39-land-units` | ユニット接続前は `なし` |
| 町状態 | `#v39-land-settlement` | 町接続前は `なし` |
| 領土状態 | `#v39-land-territory-state` | 領土接続前は `未所属` |
| 回復補正 | `#v39-land-recovery` | 回復ルール接続前は `-` |
| 移動停止 | `#v39-land-move-stop` | 移動状態接続前は `-` |
| 川 / 滝 | `#v39-land-river-waterfall` | `なし / なし`、`あり / なし`、`大河 / あり` 等 |
| 敵 | `#v39-land-enemies` | 強敵候補情報、通常敵接続前は `なし（未配置）` |

## 5. 更新タイミング

### タイル選択

```text
Phaser pointer selection
  ↓
v39:tile-selected
  ↓
v39-land-detail.js
  ↓
window.__v39FieldRuntime.mapData を参照
  ↓
#footTile の既存表示を更新
```

### フィールド再生成

`v39:field-generated` を受けたら選択状態を破棄し、土地タブを `マスを選択` に戻す。

## 6. 公開API / 通知

現在選択中の生成地形詳細:

```js
window.getV39SelectedLandDetail()
```

土地詳細更新後:

```js
window.dispatchEvent(new CustomEvent("v39:land-detail-updated", {
  detail
}));
```

## 7. 今後のゲーム本体接続

以下は生成マップ情報とは別のゲーム状態であり、対応機能の復旧時に同じ土地タブへ接続する。

- 領土所有者 / 勢力
- 危険度計算
- 施設
- 自軍 / 他勢力ユニット
- 村 / 町 / 都市状態
- 領土開発状態
- 回復補正
- 移動停止理由
- 通常敵 / 敵部隊
- Fog / 未探索時の情報制限

これらを接続するときも、土地タブの固定DOMを作り直さず値だけ更新する。
