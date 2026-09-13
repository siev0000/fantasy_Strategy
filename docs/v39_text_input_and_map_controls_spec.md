# v39 マップ操作ボタン・文字入力モーダル仕様

## 1. マップ拡大縮小ボタン

対象DOM:

`#v39-map-camera-controls`

ボタン:

- `[data-map-zoom="in"]` : 拡大
- `[data-map-zoom="out"]` : 縮小

実装:

- 機能: `frontend/src/v39-field-runtime-final.js`
- 配置: `frontend/src/v39-map-controls-layout.js`

配置仕様:

- マップ右下
- `＋ / −` を横並び
- 左側研究レールと重ならない
- safe-areaを考慮する
- PC / スマホ共通で右下を基準にする

ズーム処理そのものはレイアウト変更で変更しない。

---

## 2. 文字入力専用モーダル

実装:

`frontend/src/v39-text-input-modal.js`

目的:

スマホで部隊名・都市名・キャラクター名などを編集する際、下部UIへ直接ソフトキーボードを出さず、専用入力画面へ統一する。

公開API:

```js
window.openTextInputModal(options)
window.closeTextInputModal()
window.confirmTextInputModal()
```

`openTextInputModal(options)` は Promise を返す。

決定:

- 入力文字列をresolveする
- `options.onConfirm(value)` があれば呼ぶ

キャンセル:

- `null` をresolveする
- `options.onCancel()` があれば呼ぶ

主なoptions:

```js
{
  title,
  value,
  placeholder,
  help,
  required,
  minLength,
  maxLength,
  multiline,
  type,
  autocomplete,
  enterKeyHint,
  confirmLabel,
  cancelLabel,
  selectAll,
  onConfirm,
  onCancel
}
```

DOM:

```text
#v39-text-input-modal
#v39-text-input-title
#v39-text-input-help
#v39-text-input-field
#v39-text-input-cancel
#v39-text-input-confirm
```

操作:

- 単一行: Enterで決定
- 複数行: Ctrl+Enter / Cmd+Enterで決定
- Escapeでキャンセル
- 背景タップでキャンセル
- 開いた直後に入力欄へfocus
- `selectAll !== false` の場合は既存値を全選択

スマホ仕様:

- input / textarea は16px以上としてiOSの自動ズームを避ける
- モーダルは画面上寄りに配置し、ソフトキーボードで入力欄が隠れにくいようにする
- safe-areaを考慮する

## 3. 使用方針

頻繁なゲーム操作は下部UIを使う。

文字入力が必要な操作は、スマホでは原則 `openTextInputModal()` を使用する。

対象例:

- 部隊名変更
- 都市 / 村名変更
- キャラクター名変更
- 任意名称入力
- 短いメモ入力

各機能側で独自の文字入力モーダルを増やさない。
