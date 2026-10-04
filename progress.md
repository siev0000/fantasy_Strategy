Original prompt: 全体を整理してほしい。メモと地形ランダム生成だけは消さないで vueファイルにできるところはVueファイルに

- 2026-10-04: 前回の共通化は画面模倣だったため撤回。専用SVG/下部UI/時計/簡易戦闘を廃止。探索準備後にVueをアンマウントし、既存Phaser・部隊DOM・players/factionState/units/squads・通常戦闘/AP/ターンを使用。activeWorldId/explorationWorldsとunit.worldId/locationsByWorldで所在と固有マップ状態を保持し、出入りでHP/AP/装備を巻き戻さない。周期ボス/地点生成を共用し、採取/休息/運搬品/次階層を通常行動欄へ接続。
- 検証: check-v39-cave-nativeで同じDOM、通常攻撃/AP消費、共通ターン、往来でID/HP/AP/装備保持、PC/スマホ、ページエラー0。旧純粋処理23/70項目成功、旧SVG用UI検証はnativeへ置換。指定Webゲームクライアント・build成功。残りは非表示マップAI/拠点生産、地上入口対応、壁越し視界/射程、地下隊列追従/並び替え、全階層セーブ/ロードの実画面検証。地下統合全体の完了ではない。


- 2026-10-04: 洞窟探索を独立モーダルから通常ゲームのtopbar/playfield/footerへTeleport接続。設定・キャラ作成だけモーダルに残し、探索時はモーダルの表示/aria-modalを解除。通常DOMは削除せず非表示/inertにして復元し、地上のゲーム状態・選択・カメラに書き込まない。部隊の一覧/詳細とステータス技能/行動/装備、土地、ログを通常CSSと共用するため、既存#footSquadのCSS対象に洞窟パネルを追加（通常側の詳細度は維持）。地上と同じ画像解決、ドラッグ/ホイール/ピンチ/＋−、射程/対象色、回復時のフィールド仲間選択、スマホに収まる階層/戻るアイコンを追加。追従表示と敵/地点が重なる場合のクリック遮蔽を修正。洞窟はSVG描画・限定戦闘のままで、地上との往来/セーブ統合は未実装。
- 検証: 新check-v39-cave-screenで共通50:50枠、拡縮/パン/ピンチ、ドラッグで移動しない、射程と解除、タブ置換/装備、スマホ枠、終了時の地上状態/DOM/inert復元を確認。既存生成30ケース、探索23項目と実UI戦闘→B2、地点70項目と採取/回復/B5到達も成功。ページエラー0。指定Webゲームクライアント・build成功（既存チャンク警告）。画像はoutput/web-game/cave-screenおよびcave-sites。

- 2026-10-04: 洞窟探索テストに周期ボス・群生地回復・壁際採取を追加。暫定5階層ごとに有効洞窟JSON候補からボス生成、出口寄り/全入口安全距離外へ配置し赤枠とボス表記。各階層に薬草1/キノコ1群生地（生存者最大HP25%回復、全員AP20、同ターン1回/地点3回）、壁に鉱石3/宝石2（隣接床から担当者AP30、1個/回、埋蔵3/1）。地点を索敵で発見、未発見は非表示、既知索敵外は半透明。採取在庫をパーティーへ保持し次階層へ継承、通常ゲーム在庫/シートJSONには接続・追記しない。設定は日本語コメント付きV39_CAVE_BALANCE。
- 検証: check-v39-cave-sitesの70項目（全10形状の地点/ボス/安全性/再現性、回復/AP/死亡者/同ターン拒否、採取枯渇/壁保持/在庫持越し）成功。実画面で採取・装備によるHP不足から群生地回復・B5のボスとPC/スマホ表示を確認。ページエラー0。既存探索23項目・戦闘12回→B2、通路幅/接続30ケースも成功。指定Webゲームクライアント、build成功（既存チャンク警告のみ）。画像とレポートはoutput/web-game/cave-sites。

- 2026-10-04: 洞窟の通路幅1～3と部屋ごとの接続口を実装。全10テンプレートを通路{幅,経路}・部屋接続口・入口接続/入口通路幅へ移行。部屋中心ではなく縁の指定接続口を結び、六角隣接の法線方向へ2幅は片側/3幅は両側拡張。外周壁は保持、屈曲/合流部は和集合。蛇行/螺旋1幅、広間/十字路2～3幅など形状ごとに混在。生成mapにcorridors観測情報を保持、通常ゲームやシート管理JSONは変更なし。
- 検証: 30生成ケースで全床/入口接続・外周壁・部屋境界の接続口・敵配置安全性/再現性成功。専用の直線通路fixtureで実測1/2/3マスと接続口座標確認。探索23項目・画面戦闘13回→B2到達、ページエラー0。幅の違う形状画像を目視確認。
- 最終確認: 指定Webゲームクライアント・build成功（既存チャンク警告のみ）。形状JSONの座標配列を1行へ整形し、接続口と幅の編集形式を洞窟ルールに記載。

- 2026-10-04: 依頼「階層のパターンを増やしたい」に対応。手動洞窟テンプレートへ蛇行・十字路・双大空洞・連続小部屋・網状回廊・螺旋の6種類を追加して計10種類。既存の配列読み取りにより生成テストと探索ゲームの形状選択・各階層ランダム抽選へ反映。シート管理の生成JSONや戦闘バランスは変更しない。
- 検証: 10形状×入口2/3/4の30ケースで全床/入口接続・敵配置・安全地帯・再現性確認。形状の重複なし、実UIで10形状の選択・生成を確認し6新形状の画像を目視確認。探索23項目、UI戦闘11回からB2到達、ページエラー0。指定Webゲームクライアント・build成功（既存チャンク警告のみ）。画像はoutput/web-game/cave-test/pattern-*.png。

- 2026-10-04: 洞窟探索の「キャラが後ろをついてくる、並び替え」を実装。先頭の経路履歴3マスを保持し個別マーカーで追従、1マス160msのスライド表示（共通設定followerStepMs）。移動中は行動/並び替え/ターン終了を無効化し、閉じるとタイマー破棄。カードの前へ/後ろへで配列順を交換しID・能力・HP/AP・装備・選択キャラ保持、次階層へ順番を継承し入口へ集合。戦闘の共通位置判定は変更しない。追従マーカーのpointer-eventsを無効化して敵/床のクリックを遮らない。
- 検証: check-v39-cave-adventure 23項目（追従経路、順番/データ保持、不正入替拒否、階層継承を追加）、UI前後入替・選択保持、戦闘11回→B2到達成功。ページエラー0。洞窟生成12ケース、指定Webゲームクライアント、build成功。PCとスマホの追従/並び替え画像を確認。

- 2026-10-04: 洞窟生成テストに独立探索ゲームを追加。今回の依頼「3人を作成、装備を変えながら戦闘・探索し、次の入口から次階層へ」。JSON由来の種族/クラス/装備/能力/敵と共通ダメージ・回復・AP・経験値計算を利用。3人共有位置のAP移動、Fog、単体攻撃/回復、CT、敵ターン、死亡/全滅、装備変更、階層間のHP/装備/Lv保持。調整値はV39_CAVE_BALANCE。通常ゲーム状態は変更しない。経験値APIの戻り値は数値でなくrawExpを持つ結果オブジェクトなので、正しく分配し報酬済みダメージを記録。
- 検証: check-v39-cave-adventureの18項目（AP/移動/装備/共通ダメージ/敵攻撃/回復/死体/全滅/階層保持）成功。実UIで11回攻撃して出口に到達しB2へ進行。PC1280x900/スマホ390x844のスクロール・装備/ターン操作・画面終了・通常状態非変更、ページエラー0。既存洞窟生成12ケースも再検証成功。範囲/待機/持続効果/蘇生/反撃、地上統合・資源・保存・最終階層は未対応として明記。
- 最終確認: build:front成功（既存の大きいチャンク警告のみ）、指定Webゲームクライアント成功・出力画像確認。探索中のrender_game_to_textと読み取り専用状態観測を用意し、閉じると元の通常ゲーム観測関数へ戻す。戦闘後出口到達・PC・スマホ画像をoutput/web-game/cave-adventureに保存。

- 2026-10-04: 洞窟生成テストを開始画面に追加。独立Vueコンポーネント・遅延マウントで通常ゲーム状態を変更しない。手動形状JSON4種、六角形通路、シード再現、入口2〜4か所と地上入口対応データ、既存出現敵/能力計算/画像から敵を自動配置。安全距離・密度・ドレイク重み・テストLv上限は日本語コメント付き共通設定へ。移動経路と敵詳細、PC/スマホ/開始画面へ戻るを検証。地上往来・地下戦闘AI・鉱床・保存は次段階。
- 検証: check-v39-cave-test成功。4形状×入口2/3/4の12ケースで全通路/入口接続、安全距離、敵能力/重複なし/同seed再現確認。入口対応・不正入口数拒否、クリック移動経路・敵詳細・通常状態非変更、390x844と320x568の開閉/メニュースクロール/Escape、ページエラー0。build成功（既存チャンク警告）、Webゲームクライアントで開始ボタンから生成画面表示、PC/スマホ画像目視確認。

- 2026-10-03: 原本game_data特産品シートの塩をタコに置換、カニ/エビ/カキ・貝/リンゴ/オレンジ追加。地形は海、海・湖、平地・森・丘陵等の合意案、通常食料特産品・重み1・高度制限なし。最新XLSXから特産品のみ再生成し20件・警告0・エラー0。仮フォールバックの塩も削除、既存セーブの塩アイコンは互換維持。カキ・貝のアイコン対応追加、他5種は既存候補を使用。Sheet変更範囲A6:K6/A17:K21の再読・書式/検証確認、Google表示目視確認。6種の生成/絵文字/塩非生成、AP調査/幸福度/地域保証/採取保存の回帰テスト成功、ページエラー0。buildとWebゲームクライアント成功。新規マップ生成から反映、既存セーブに自動追加しない。

- 2026-10-03: 特産品の表示を中央へ変更し、描画中のユニットがいるマスだけ右上へ移す。TEST ONでは未発見の配置もalpha0.6で表示するが、発見/幸福度/ヘッダー集計には反映しない。透明度と右上オフセット・サイズはV39_SPECIALTY_BALANCEへ集約。描画済みのユニットマーカーから占有判定するので、通常時の未発見敵による位置変更で存在を漏らさない。check-v39-specialtiesでTEST ON/OFF、未発見0件のまま半透明4件描画、発見後alpha1、移動前後の中央/右上切り替え、既存AP/幸福度/セーブ検証成功。build・Webゲームクライアント成功、マス表示とスマホ画面を目視確認。

- 2026-10-03: 調査をキャラの索敵範囲へ拡張。開始時の対象マスを保存し、残りAP全消費/累計100AP/死亡・移動中断は維持。食料・鉱石の特産品を地形別に配置し、勢力別の発見結果、マス文字アイコン、ヘッダー一覧と自領種類数、拠点別幸福度目標へ接続。種類はmanual/特産品仮.json、配置12%/1種類+2/上限20はbalanceの暫定値。Notionの文字アイコン候補を共通変数へ保持、正式な資源採用とは区別。好物/在庫/採取/輸送は未実装で仕様へ明記。生成JSON変更なし。check-v39-specialties: 索敵75で19マス、AP40+60継続、境界7マス/ラップ19マス、発見4マス/自領2種類で幸福目標+4、他勢力非共有、経済ターン反映、セーブ往復、マス描画4件、スマホ440/390px一覧・時計非重複を確認。build、既存survey-ap、land-expansion、faction-ai-exploration、Webゲームクライアント成功。

- 2026-10-03: 通常土地の取得を調査から拠点の開拓へ分離。担当10人/2T/同時1件はbalanceの暫定値。人口/維持消費を保持して生産要員のみ減らし、最新の敵位置・施設・接続・人口で停止/復帰判定。停止中は要員が生産に復帰、進捗保持。船着き場1/港2マスの海・湖、通常陸地は自領隣接。一般村/勝利対象/既存領土除外。拠点UI候補→開始/中止、マスの開拓マーク、ログ、NPCの同一ルール接続、経済ターンの完了所有権/所属/資源化反映、セーブ保持。JSON変更なし。check-v39-land-expansionで収入78→62.4、敵侵入停止と再開、死体許容、水域半径、余剰人口時100%稼働、中止、調査非領土化、セーブJSON往復、UI操作、実ターン終了2回による領土取得を確認。

- 2026-10-03: プレイヤー移動を実経路・各ステップの部隊配置に沿うスライド演出へ変更。140ms/マス、全経路1200ms上限をbalanceへ集約。画像を動かしてから座標/AP確定、描画バッチと操作ロック、ワールド端処理を追加。ターン処理へ段階別ロード表示・描画前yield・解決後半の描画バッチ・計測getterを追加。敵AIの状態反映/描画待ち/演出を別計測。領土獲得ルールは変更なし。check-v39-turn-movement-presentationで実移動・AP・二重ターン防止・ロード表示・終了時解除・敵34体Worker処理・注入例外時解除を確認。36x36測定例: Worker計算約8ms、mainApply約58ms、renderApply約63ms（実機・大マップの性能保証ではない）。

- 2026-10-03: 身体武器を実装。種族・取得クラスの身体性能の最大値÷10を小数Lvとして保持。装備JSONの肉体行から基礎性能/AP/攻撃回数を取得し、Lv1=1倍、35=2倍、50=3.5倍を連続補間（50超は暫定上限）。行動一覧へ武器として追加、同名旧スキル重複を除去。敵AI・反撃も共有。装甲はLv保持のみ。生成JSONの変更なし。旧区分の備考は原本シートで更新が必要。build、check-v39-body-weapons（最大値・小数倍率・AP・回数・反撃・実UIクリック）、既定Webゲームクライアント成功。

- 2026-10-01: ユーザー実装の手動拠点発展を通常v39ターンへ接続。従来は開発用「ターン経過」で選択中拠点だけ進行していたため、全勢力経済処理で全拠点の `developmentProject` を1ターンずつ進め、完了時に規模・住居占有マップ・活動ログ・完了イベントを更新するよう修正。通常の拠点タブ上部へ「拠点発展」ボタンを追加し、v39の選択拠点・領土・資源を使う都市・建設画面へ条件一覧と開始処理を統合。`npm run check:settlement-development` でボタン表示、資材消費、工事開始、二拠点同時の `村 / 残り2T -> 残り1T -> 町 / 完了`、付属マス更新、ブラウザー例外0件を確認。統治者必須化で古くなっていた `check:local-session` の準備データも現行仕様へ更新し成功。`npm run build:front`成功。

- 2026-09-30: NPC国家AIの高優先経路を追加。戦時の発見済み他勢力ユニットへ既存戦闘を実行し、敵領土と同一マスでは既存の攻撃威力・APで領土HPを削る。HP0の領土は既存の略奪状態となり収入を停止する。所有権移転・勢力滅亡は未確定のため実装しない。勝利対象土地には対象地形に対応する既存の出現敵から守護ボス1体・配下・敵巣・縄張りを生成し、守護者全滅後の到達で既存の領土化を行う。NPC追加後に最初のターン終了がNPCへ誤切替して解決を飛ばす不具合も、手動ターン順を`isPlayer !== false`だけへ限定して修正。検証: `npm run check:faction-ai-territory-assault`、`node scripts/check-v39-victory-guards.mjs`、`npm run check:faction-ai-long-sim`、30/50/100ターンの実ターン進行、`npm run build:front`成功。

- 2026-09-30: NPC勢力の他勢力認識を追加。自勢力の拠点・ユニット・施設の現在の索敵範囲と隠密判定を通過した他勢力だけを`factionState.exploration.discoveredFactionsByPlayerId`へ記録し、セーブ/ロード時も保持する。NPC外交はこの発見記録がある相手だけを宣戦・条約判断の対象に変更した。戦争中の発見済み勢力は、勝利対象土地より優先して最上位目的に保存し、既存の部隊移動で最後に確認した座標へ近づく。後続の戦闘・領土攻撃接続は同日の次の記録を参照。検証: `node scripts/check-v39-faction-ai-foreign-objective.mjs`、既存NPC探索/勝利対象テスト、`npm run build:front`成功。

- 2026-09-29: NPCは自勢力の`discoveredFeaturesByTile`に保存された勝利対象土地だけを目的化し、未発見時は探索、発見後は対象へ近づく移動を優先する。目的は`factionState.aiState.objective`とAIログへ保存する。他勢力攻略・守護ボス攻略は未接続。検証: `node scripts/check-v39-faction-ai-objective.mjs`。

- 2026-09-29: 勝利対象土地の共通勝利判定を追加。暫定で`V39_VICTORY_CONDITION_BALANCE`の`1地点 / 1ターン支配`を満たすと、プレイヤー・NPC共通の`gameState.victory`へ勝者・達成ターン・進捗を保存してターン終了を停止する。守護ボス、複数地点、勢力滅亡、奪還時の取消は未確定の後続仕様。検証: `node scripts/check-v39-victory-conditions.mjs`。

- 2026-09-29: NPC勢力の最小Botループを完了。各NPCは既存の調査・建設・ユニット生成・研究ルールを順に使い、未調査の現在地を調査後、同じ地形・高低差・飛行・AP計算で未調査の隣接マスへ部隊単位で探索移動する。探索先の選択に勝利対象土地、敵、他勢力の未発見座標は使わない。移動AP計算は`v39-terrain-traversal.js`へ共通化し、プレイヤー操作も同じ関数を使用する。検証: `node scripts/check-v39-faction-ai-exploration.mjs`、`node scripts/check-v39-test-npc-faction.mjs`、`node scripts/check-v39-victory-landmarks.mjs`、`node scripts/check-v39-neutral-village-defense.mjs`、`npm run build:front`、`npm run audit:data` 成功。データ監査の未接続14項目は既知の `イベント_一般村` 9件と`テストクラス`5件。

- 2026-09-28: 勝利対象土地は発見後に既存画像を地形上へ表示するようにし、TEST ON時は未発見でも透明度40%で確認表示する。敵・他勢力ユニットと一般村守備軍も、通常時は視界内かつ発見判定を通過したものだけ、TEST ON時は未発見を透明度40%で描画する。一般村守備軍を敵AIの攻撃対象へ加え、敵ターン後に射程内の一般生物へ守備軍が行動Aで1回反撃するよう接続した。検証: `node scripts/check-v39-victory-landmarks.mjs`、`node scripts/check-v39-neutral-village-defense.mjs`、`npm run build:front`。

- 2026-09-28: 勝利対象土地は4種同時配置を廃止し、島形状ごとの対象を通常1件だけ配置する方式へ変更。対象数は `V39_VICTORY_LANDMARK_BALANCE.landmarkCount` で複数化できる。リアル島・大陸型=太陽の山、標準諸島・双子島=黄昏の樹、列島型=星の火口、多島海=宇宙の海。

- 2026-09-28: TEST ONの勢力追加へ `プレイヤー勢力 / NPC勢力` を追加した。追加勢力は既存の `players[] / factionState` を再採番して複製し、NPCは`isPlayer=false`、参加者割当なし、手動ターン順外として扱う。初期拠点・領土・人口・研究・ユニットは既存の初期配置規則で自動配置し、通常のセーブJSONに保持する。検証: `node scripts/check-v39-test-npc-faction.mjs`、`npm run build:front` 成功。

- 2026-09-28: `@game_data` の `勝利対象土地` シートを追加し、`勝利対象土地.json` を生成対象へ登録した。太陽の山・黄昏の樹・星の火口・宇宙の海は指定地形（不在時は代替地形）へ決定的に各1件配置する。未発見時はFog下へ隠し、同じマスでの調査を完了した勢力だけが名称・説明・マーカーを見られる。配置と勢力別発見状態はセーブ/ロードされる。勝利判定、守護敵、支配条件は後続タスクとする。検証: `node scripts/check-v39-victory-landmarks.mjs`、`npm run build:front` 成功。

- 2026-09-28: 自然イベントのアンデッド発生を、`死の霧_変換`で作られた死の霧を主経路、地上の死体を1%の稀な補助経路へ整理した。死の霧は特殊地形のため、Excelの地形シートで死の霧行へ`変換レイヤー=特殊`を設定して再出力する必要がある。発生中の火山以外の災害は各影響マスに小アイコンを表示し、`災害.json.アイコン`が未設定の間は共通暫定設定のアイコンを表示する。`地形.json`の既存災害相性列は、洪水・暴風・地震・落雷嵐・大寒波の発生率補正へ接続した。災害の最大HP割合ダメージは一般村の守備軍へ通常ユニットと同じ処理で、村人口へも同じ割合で反映する。TEST ONでは一般村・所有領土・放浪者の自然アンデッド脅威を確認でき、一般村には将来の自動駆除依頼用の敵ID一覧を保存する。対象がある一般村は、既存の`イベント_一般村.json`定義からアンデッド討伐依頼を生成し、対象全滅後に完了できる。通常軍は初期3人編成へ戻し、Excelの都市基本データと出力JSONを同期した。

- 2026-09-25: Excel出力済みの `勢力.json` に `詳細` 列がない間だけ、`data/manual/勢力詳細.json` を表示用の仮データとして追加した。`勢力.json.詳細` が存在する場合は必ずそちらを優先するため、Excelへ詳細列を追加して再出力後もコード変更は不要。検証: `npm run build:front`、`npm run check:play-mode-select`、`npm run check:multiplayer-start-flow`成功。種族選択画面で仮JSONの詳細表示とブラウザー例外0件を確認。

- 2026-09-25: 統治者作成の種族説明を `勢力.json` の `詳細` を正本として表示するよう変更。`勢力.json.種族 / カナ` と `種族.json.key / name / className` を対応付け、詳細未出力時はその旨を明示する。クラス選択のステータスは主要値に要約せず、`クラス.json` の数値項目（耐性を含む）をそのまま全件表示する。検証: `npm run build:front`、`npm run check:play-mode-select`、`npm run check:multiplayer-start-flow`成功、ブラウザー例外0件。

- 2026-09-25: v39統治者作成を種族・クラスの専用カード選択画面へ再設計した。種族は `種族.json` の概要・詳細・特性・基礎HP/攻撃、クラスは `クラス.json` の基礎能力、得意技能、初期スキル、初期装備を比較表示する。種族選択（シングルのみ）→クラス選択→統治者名・初期拠点名の3段階で、マルチはロビーで決めた種族からクラス選択を開始する。検証: `npm run build:front`、`npm run check:play-mode-select`、`npm run check:multiplayer-start-flow`成功。モバイル幅430pxの種族・クラス選択画面をキャプチャ確認し、ブラウザー例外0件。

- 2026-09-25: シングル通常プレイでもv39統治者作成UIを接続した。開始時に種族・クラス・統治者名・初期拠点名を入力し、空の対象勢力へ種族を反映した上で既存の統治者生成処理を適用する。マルチプレイ中の同名イベントはロビー側のホスト確定経路だけを使用する。検証: `npm run build:front`、`npm run check:play-mode-select`で只人/ファイター/通常統治者の生成と初期拠点配置モード遷移、`npm run check:multiplayer-start-flow`でマルチ開始状態とブラウザー例外0件を確認。

- 2026-09-25: v39通信マルチ開始後の統治者作成を、旧Vue未マウントのUI依存からv39専用モーダルへ接続した。選択種族に対して `クラス.json` の開始可能クラスだけを表示し、クラス・統治者名・初期拠点名を既存のホスト検証/生成要求へ送る。入室後に作成/参加フォームが残るCSS競合と、初期拠点配置完了後に配置案内バナーが残る状態も修正。検証: `npm run build:front`、`npm run check:room-lobby`、`npm run check:play-mode-select`、`npm run check:multiplayer-start-flow`成功。後者で36x36、只人ファイター統治者、初期拠点確定、ブラウザー例外0件を確認。

- 2026-09-24: v39通信ロビーのルームIDを、既存ルームと重複しない8桁数字のサーバー自動発番へ変更した。ルーム作成画面にはプレイヤー名とルーム名だけを表示し、参加用IDは「ルーム参加」を開いた時だけ入力する。旧「表示名」は、参加者一覧で使う意味を明確にするため「プレイヤー名（ロビー表示）」へ変更した。`npm run check:room-lobby`で8桁数字・重複なし・不正形式拒否を確認する。

- 2026-09-24: 通信開始導線を `プレイ形式選択 -> ルーム作成 / 参加 -> 通信ロビー -> ホストのみゲーム開始設定` へ修正した。マルチ選択で設定モーダルを直接開かず、ホストがロビーから設定を共有保存する。保存中はローカルのマップ生成を行わず、保存後はロビーへ戻る。参加者は共有設定を確認できるが変更できない。`npm run check:multiplayer-start-flow`でマルチ選択、ルーム作成、ホスト設定のローカル専用項目非表示、設定保存・ロビー反映、ブラウザー例外なしを確認。

- 2026-09-24: 初回導線を `プレイ形式選択（シングル / マルチ） -> ゲーム開始設定` へ変更。マルチプレイ選択時は通信ルーム項目を展開し、選択値をフィールド設定の `playMode` へ保存する。明示的にゲーム開始設定を開く場合は初期選択モーダルを閉じ、操作を遮らないようにした。`npm run check:play-mode-select`で両形式の遷移・表示、`npm run check:field-settings-scroll`で既存スクロール、`npm run check:room-lobby`でロビーを確認。

- 2026-09-24: v39通信ロビーの作成フォームを、表示名・ルーム名・参加用ルームIDへ分離。ルームIDはサーバー側で既存IDと重複しない`ROOM-XXXXXX`を自動発行し、作成者は表示用のルーム名だけを入力する。`roomName`は作成結果とロビースナップショットへ保存・配信する。`npm run check:room-lobby`でルーム名の反映と別ルームのID不一致を確認。

- 2026-09-24: v39ワールド用の通信ロビーStage 1を追加。`server.js`で旧簡易戦闘ルームと`v39-world`ロビーを分離し、ホスト、恒久`participantId`、再接続トークン、接続状態、準備完了、操作勢力数、担当勢力を`room:snapshot`で管理する。v39のゲーム開始設定に「通信ルーム」入口を追加し、ルーム作成・参加・退出、参加者一覧、ホスト設定を実装した。ワールド生成・ゲーム開始・状態同期・操作同期は未接続で、ロビーはローカルゲーム状態を変更しない。検証: `npm run check:room-lobby`で2人参加、ホスト権限、担当勢力、準備、再接続を確認。`npm run build:front`成功。Playwrightでモバイル幅のロビー作成・ルームID・担当勢力表示、ブラウザー例外なしを確認。

- 2026-09-24: ゲーム開始設定モーダルの本文を内容量固定のグリッド行に変更し、画面高を超える時は本文だけを縦スクロールするよう修正。ヘッダーと下部の初期値・キャンセル・生成ボタンは固定表示する。小画面高420pxで本文299pxに対して内容1092px、ホイール操作でスクロール位置480pxまで移動することをPlaywrightで確認した（`npm run check:field-settings-scroll`）。

- 2026-09-24: スキル対象選択中に味方・死亡者のフィールドマーカーを押すと、選択中の攻撃者を切り替えずマーカー座標をスキル対象として実行するよう修正。通常攻撃、回復、蘇生で対象マーカーを実クリックするPlaywright検証を追加し、味方への同士討ち、HP回復、死亡者の蘇生、攻撃者選択の維持を確認した（`npm run check:friendly-skill-targeting`）。

- 2026-09-24: ローカル複数勢力ターン制を `docs/ローカル複数勢力ターン設計.md` へ固定後、v39状態へ `sessionParticipants[]`、`players[].controllerParticipantId`、`timeline.playerTurnOrder / activeTurnPlayerId / endedPlayerIds` を追加。ゲーム開始設定で操作勢力数（1〜8）、仮参加者数、各勢力の担当参加者を指定し、各勢力のユニットIDを再採番して混在を防止する。初期拠点は全勢力が完了するまで敵・一般村を生成せず、ターン終了は次勢力へ切り替え、全勢力終了後だけエネミー・全体処理を実行する。v39セーブはv4へ更新し、旧セーブを `local-1` 参加者へ移行する。旧プレースホルダーが最終ゲーム開始設定モーダルの同期APIを上書きしていたため停止した。検証: `npm run build:front`、`npm run audit:data`、`npm run check:local-session` 成功。後者で2勢力2参加者の担当割当、2勢力の初期配置、1勢力目終了時の敵処理未実行、2勢力目終了後の1回だけの敵処理、設定再表示、セーブv4を確認。

- 2026-09-19: 拠点人口の種族別人数を `種族.json.className` 経由で `クラス.json` の農業・林業・漁業・工業へ対応付け、人口加重した技能を算出。農業・林業・漁業・工業は生産項目として、その技能値を補間表で換算した生産倍率を表示する。稼働率は人数補正、生産項目倍率は資源種別ごとの技能補正として別々にタイル収入へ掛ける予定であり、拠点タブは生産項目だけを表示する。拠点タブの雇用枠・稼働率も領土集計済みの値を使用する。施設の研究条件はユニット生成と同じ現在研究Lvを参照し、建設画面へ地形・研究Lv・資材・施設枠の現在値と必要値を表示する。ユニットは人口・就業人口に含めず、資源収入と建設時間への反映は未接続。
- 2026-09-19: 領土・巣・一般村・合算索敵の外周を共通の点線描画へ変更。各生存ユニットの索敵範囲は個別の薄水色点線として追加し、同じマス・同じ範囲の部隊員は重複描画しない。点線の長さと間隔は `MAP_BOUNDARY_DASH_CONFIG` で調整する。
- 2026-09-19: 検証として `npm run build:front` は成功。Playwrightで初期設定から60×60フィールドの生成状態まで確認し、変更箇所由来のブラウザー例外はなかった。自動キャプチャのPhaser/WebGLキャンバスはヘッドレス・可視モードとも黒化するため、点線の見た目だけはローカル通常ブラウザーで要確認。
- 2026-09-19: 管理タブから自キャラ・建設・ユニット作成を外し、自キャラとユニット作成は部隊タブ、建設は土地タブへ移動。ユニット作成は管理パネルではなく部隊タブ内へ切り替えて表示し、戻る先も部隊に変更した。`npm run build:front` 成功、Playwrightでフィールド生成とブラウザーエラー0件を確認。
- 2026-09-18: 現行v39上部資源バーと資源詳細で、資材の `iconColor` を描画へ反映。資源スナップショットがグループ色を捨てていた箇所を補い、鉄=灰青、金=金色、詳細の銀鉄=白銀・青金鋼=青・赤黒鋼=赤を実画面で確認した。
- 2026-09-18: 火山・溶岩の高優先度残件を統合。施設HP/損壊、拠点中心・保管先別在庫損失、噴火の継続産出低下、施設修復、活動ログと拠点UI表示をv39状態へ接続。施設最大HP100は共通設定の暫定値。
- 2026-09-18: v39ユニット生成が軍事研究を進めても `軍事Lv不足` になる問題を修正。生成条件は仕様どおり軍事研究の現在Lv（全項目完了Lv+1、初期Lv1）を参照する。軍事施設Lv0・研究未完了でも軍事Lv1として軍隊1体を生成し、人数10→11、資源各2消費を実ブラウザで確認した。
- 2026-09-18: 資源詳細の白い菱形フォールバックを廃止し、穀物・野菜・肉・魚・死体・魂などを共通絵文字辞書から表示するよう統一。旧UIとVue側の資源表示・ユニット作成費で同じ辞書を使用し、実画面で `🌾🥕🍖🐟🦴👻` の表示とブラウザーエラー0件を確認した。
- 2026-09-18: 別マス配置の部隊に旧仕様の同一座標条件が適用され、移動できない問題を修正。隊長が1マス進むたびに全部隊員へ同じ方向の移動を適用して隊形を維持し、1人でも地形・高度差・占有条件を満たせない方向は移動候補から除外するよう変更した。初期5人部隊でも全員が同じ方向へ移動し、位置重複なし、部隊移動AP100→25、ブラウザーエラー0件を確認した。
- 2026-09-18: 生成ユニットの表示名を `種族名 + クラスのルビ（未設定時は名前）+ 軍隊時のみ「軍」+ 連番` に統一した。内部の `className` はJSON再参照用に従来どおり `名前` 列を保持する。実データで表示名 `只人戦士軍1`、内部クラス名 `ファイター`、生成条件・資源消費、ブラウザーエラー0件を確認した。
- 2026-09-18: 軍隊ユニットのフィールド画像右上へ編成人数を表示。`combatProfile.memberCount` を優先し、旧データでは `populationCost` を代用する。通常ユニットには表示しない。軍隊3人の右上表示、生成条件・資源消費、ブラウザーエラー0件を実画面で確認した。

- 2026-09-11: 自動ターン更新時にカメラを初期化・統治者へフォーカスしない `preserveCameraView` を追加。選択中タイルと閲覧中のカメラ位置・ズームを維持する。
- 2026-09-11: 画面上部中央へ、ターン経過・自動進行の開始/停止・10ターン区切り停止を3.8秒表示するテロップを追加。
- 2026-09-11: 他勢力攻撃へ宣戦布告を追加。未宣戦攻撃は確認モーダルで停止し、宣戦後のみ攻撃可能。外交評価-20を20ターン記録し、魔族同士は宣戦・ペナルティを免除する。

- 2026-05-03: 資源サイドバー表示方針を固定。基本は「文字最小・アイコン+数値」表示へ統一し、トップ行をアイコン中心表示に変更。食料詳細の `魂/死体` は `保有0 かつ 増減0` で非表示化。アイコンサイズは `--sidebar-menu-icon-size` / `--sidebar-detail-icon-size` で調整可能にした。
- 2026-05-03: 添付の参考画像ベースでHUD方向性メモを追記。`docs/MEMO.md` と `docs/現状ゲーム仕様メモ.md` に「上部資源バー / 左アクション列 / 右イベントログ / 下部戦闘カード / 右下ミニマップ」の画面構成指針を追加。
- 2026-05-03: 仕様メモ更新。`docs/MEMO.md` と `docs/現状ゲーム仕様メモ.md` に「資源サイドバー表示ルール（固定）」を追記。
- 2026-02-26: Started reorganization with focus on preserving map random generation and memo docs.
- 2026-03-28: 移動コスト判定を調整。`高さ差1`は通常コスト、`高さ差2以上`のみ追加コスト+1に変更して、高さLv2以上タイルが実質移動不能になりやすい問題を緩和。`PhaserMapGeneratorPanel.vue` と `pathfindingWorker.js` の両方を同条件に統一。
- 2026-03-28: 高度差2マスを増やす調整を実施。`地形生成設定.高度` の `ノイズ幅: 10 -> 13`、`平滑化回数: 2 -> 1`。さらに高度Lv算出で `山岳 +1 / 火山 +2` の持ち上げを追加し、平地との段差が出やすいように調整。
- 2026-03-20: 装備在庫UIを専用モーダル化。`EquipmentInventoryModal.vue` を追加し、フィールド右上アクションに「道具一覧」ボタン（装備アイコン）を追加。`PhaserMapGeneratorPanel.vue` から開閉できるよう接続。
- 2026-03-20: `CharacterStatusModal.vue` の暫定「装備在庫チップバー」を削除し、装備在庫表示を専用モーダルへ一本化。
- 2026-03-20: 検証: `npm run build:front` 成功。
- 2026-03-20: `develop-web-game` Playwrightクライアント実行を再試行したが、スキル実行環境で `playwright` パッケージ未解決のため失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-21: `付与.json` を用いた装備付与処理を実装。`EquipmentInventoryModal.vue` の「付与」タブで、対象装備に対する候補を表示し、実行できるように接続。
- 2026-03-21: 付与候補は `対象装備` 一致 + Lv条件 (`鍛冶Lv/魔法Lv/信仰Lv/軍事Lv/経済Lv`) を **AND条件** で満たすもののみ表示するように変更。
- 2026-03-21: 付与実行時に `消費量.json` の `種別: 付与` + `Lv` 対応コストを消費。`付与.json` 側の必要道具列（存在時）も追加消費する処理を追加。
- 2026-03-21: 付与結果は在庫装備に反映（`skillRow`/主要戦闘値/耐性/付与履歴を更新）し、ログと通知に出力。
- 2026-03-21: 付与上限制御を追加。`種別:武器` は盾含む全武器に適用し、武器は「最大3つ」「付与Lv合計は武器レアリティLv以下（コモン=1, アンコモン=2, ...）」を満たす候補のみ表示/実行可能化。
- 2026-03-21: 道具一覧モーダルは「付与」タブ時のみ拡張サイズに自動変更し、付与枠情報（数/Lv上限）を表示。
- 2026-03-21: 検証: `npm run build:front` 成功。
- 2026-03-21: `develop-web-game` Playwrightクライアントは今回も `playwright` パッケージ未解決で実行不可（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-20: ユニット作成時の装備自動付与を強化。`chooseEquipmentForClass` がクラス行の `武器1/武器2/頭/体/足/装飾1/装飾2` を優先参照し、未設定時は従来ロジックで選定。
- 2026-03-20: 作成ユニットの装備は「在庫優先」で装着し、在庫不足分は装備データから生成して装着する処理を `applyAutoEquipForCreatedUnit` として追加。ユニット作成ログに `装備 在庫N 生成M` を表示。
- 2026-03-20: 検証: `npm run build:front` 成功。
- 2026-03-20: 道具一覧モーダルに「武器生成」機能を追加。武器名・レアリティ・個数を指定して生成可能にし、鍛冶Lvに応じて選択可能レアリティを制御（common〜legendary）。
- 2026-03-20: `PhaserMapGeneratorPanel.vue` に武器生成イベントハンドラを追加し、既存 `craftEquipmentInventoryItem` に接続。ログ/通知は「武器生成」として表示。
- 2026-03-28: 地形高度レベルを再調整。海にディスタンスマップを使った深度差を導入し、湖/平地/山岳のスケールを再設計して湖が単一値にならず、山岳により大きな高さ差が出るように変更。
- 2026-03-28: 検証: `npm run build:front` 成功。
- 2026-03-20: 装備生成コスト計算を調整。`消費量.json(Lv)` と `装備.json` の `木材` / `鉱石` 倍率のみで素材計算し、石材・金・銀・宝石は武器生成基本コストから除外。
- 2026-03-20: 鍛冶生成上限は `鍛冶場Lv` の定義上限（defined cap）参照に変更。
- 2026-03-20: 武器生成「押しても何も起きない」対策として、道具モーダルに親関数直接呼び出し経路（`onCraftWeapon`）を追加し、モーダル内に実行結果/失敗理由メッセージを表示。
- 2026-03-18: ルール追記。行動処理順を `索敵(情報確定) -> 移動(同時解決/1マス判定) -> 接敵ロック -> 奇襲/攻撃 -> 建築/経済` に整理し、先逃げ防止の接敵ロック方針を `docs/fantasy_strategy_core_design.md` と `docs/NEXT_TASKS.md` に反映。
- 2026-03-18: ユニット移動を非同期ステップ実行へ変更。経路確認後は `MOVE_STEP_INTERVAL_MS`（既定1000ms）ごとに1マスずつ進み、各マスで判定を実施。移動中の再入力ガード（経路再作成/移動モード切替）も追加。
- 2026-03-18: `develop-web-game` Playwright クライアント検証を実行したが、スキル実行環境で `playwright` パッケージ未解決のため失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-18: 索敵で発見/被発見したユニットに「接敵ロック」を付与。ロック中は移動不可にし、移動停止理由を `selectedTileDetail` と `mapClickInfo` に可視化。ロック状態は勢力スナップショット保存/復元に対応。
- 2026-03-18: 仕様調整。索敵された時点で即移動禁止にはせず、非攻撃なら移動継続可能へ変更。代わりに `敵がいるマスを通過/侵入できない` ルールを経路探索・到達可能範囲・移動計画に反映。
- 2026-02-26: Confirmed current map generation exists in `web/js/map.js` and is currently bridged from `app-vue.js` via direct DOM listeners.
- 2026-02-26: Added Vue component files `app-header.js`, `map-generator-panel.js`, and `menu-panel.js` to move UI blocks out of `index.html`.
- 2026-02-26: Updated `index.html` to use Vue components and removed large inline section markup.
- 2026-02-26: Simplified `app-vue.js` by removing manual map bridge wiring; map lifecycle now lives in `MapGeneratorPanel`.
- 2026-02-26: Added `render_game_to_text` and `advanceTime(ms)` hooks in `app-vue.js` for automated testing compatibility.
- 2026-02-26: Validation: `node --check` passed for modified JS files, server health/index checks passed.
- 2026-02-26: Playwright client run failed because `playwright` package is not installed in this environment.
- 2026-02-26: Began SFC migration under `frontend/` after user requested true `.vue` conversion.
- 2026-02-26: Added Vite config (`frontend/vite.config.mjs`) and Vue entry files (`frontend/index.html`, `frontend/src/main.js`).
- 2026-02-26: Converted UI into SFC components (`AppHeader.vue`, `MapGeneratorPanel.vue`, `MenuPanel.vue`, modal components).
- 2026-02-26: Ported battle/simulator/socket logic into `frontend/src/App.vue`.
- 2026-02-26: Ported map generation to ESM modules (`frontend/src/lib/map-generator.js`, `frontend/src/lib/realistic-island.js`) while preserving behavior.
- 2026-02-26: Added npm scripts for frontend (`dev:front`, `build:front`, `preview:front`) and Vite dependencies.
- 2026-02-26: Added `dev:all` script to launch backend and frontend together from one command.
- 2026-02-26: Validation passed: `npm run build:front`, server health check, and Vite dev page response.
- 2026-02-26: Verified `npm run dev:all` reaches both `http://localhost:3000/health` and `http://localhost:5173`.
- 2026-02-26: `develop-web-game` Playwright client retry still failed because skill-local `playwright` package is unresolved.
- 2026-02-26: Reworked map rendering to Phaser in `frontend/src/components/PhaserMapGeneratorPanel.vue`.
- 2026-02-26: Added reusable map data APIs in `frontend/src/lib/map-generator.js` (`createIslandShapeData`, `createTerrainMapData`).
- 2026-02-26: Preserved existing terrain randomization logic and switched display layer from DOM hex nodes to Phaser canvas.
- 2026-02-26: Applied fantasy UI styling to the map panel (gold/parchment color direction + atmospheric background).
- 2026-02-26: Re-validated after Phaser integration (`npm run build:front`, `npm run dev:all` endpoint checks).
- 2026-02-26: `develop-web-game` Playwright check remains blocked by missing `playwright` dependency.
- 2026-02-26: Added tile altitude level model (`heightLevelMap`) to terrain map output.
- 2026-02-26: Updated river generation to prioritize downhill flow based on altitude levels, with local carve behavior to escape sinks.
- 2026-02-26: Enhanced Phaser map panel to display altitude levels on tiles and in click details (`高度Lv` + `高度Raw`).
- 2026-02-26: Re-validated after altitude/rivers update (`npm run build:front`, `npm run dev:all` endpoint checks).
- 2026-02-26: Moved height-number toggle into a dedicated settings modal in `PhaserMapGeneratorPanel.vue`.
- 2026-02-26: Height numbers are now drawn directly on tiles with adaptive font size, including larger map sizes.
- 2026-02-26: Added modal UI text clarifying OFF behavior (hide height numbers).
- 2026-02-26: Re-validated settings modal update (`npm run build:front`, `npm run dev:all` endpoint checks).

TODO / next agent:
- Decide rollout strategy: serve `web-vue-dist` from Express or keep Vite dev only.
- Decide whether to deprecate legacy static frontend files under `web/js` after user confirmation.
- 2026-02-26: Added hidden special terrain layer (`specialMap`) with wet-forest -> swamp (`沼地`) probabilistic transformation while preserving base tile appearance.
- 2026-02-26: Added reveal behavior for hidden specials: click-to-reveal and settings toggle for always-visible mode in `PhaserMapGeneratorPanel.vue`.
- 2026-02-26: Added waterfall classification for rivers at height level >= 2 (`waterfallSet` / `waterfallEdgeSet`) and Phaser overlay rendering.
- 2026-02-26: Validation passed: `npm run build:front`. Playwright client still blocked due missing `playwright` package in skill runtime.
- 2026-02-26: Unified runtime URL by switching Express static root from `web/` to `web-vue-dist/` and serving SPA index from `web-vue-dist/index.html`.
- 2026-02-26: Updated scripts for single-URL workflow (`start` builds frontend then serves on 3000, `dev` uses frontend build-watch + server).
- 2026-02-26: Removed legacy `web/` frontend and unused `frontend/src/components/MapGeneratorPanel.vue` after single-URL migration to `web-vue-dist`.
- 2026-02-26: Added fantasy hidden specials `峡谷` and `洞窟` with configurable rules/probabilities in `map-generator.js`, and updated Phaser special rendering/stats.
- 2026-02-27: Reduced cave spawn probability (`洞窟化`) and added cave scale classification by connected cave size (`小/中/大`) with thresholds in special terrain settings.
- 2026-02-27: Extended map output with `caveSizeMap`/`caveScaleMap`, cave size counters, and cave-specific labels/details in Phaser panel (`洞/中洞/大洞`).
- 2026-02-27: Re-validated cave updates with `npm run build:front` (pass). `develop-web-game` Playwright client still blocked because skill script cannot resolve `playwright` module from its own runtime path.
- 2026-02-27: Mountain generation now randomly selects one profile per map (`単峰` / `群峰` / `混合`) with mountain mass spacing randomized to 1-3 tiles.
- 2026-02-27: Added mountain mass-size rules (`通常: 3-8`, `巨大: 12-15`) and profile-driven mountain placement in `applyTerrainByHeight`.
- 2026-02-27: Added `mountainProfile` to generated map data and surfaced profile details in Phaser generation stats.
- 2026-02-27: Validation passed after mountain profile changes: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client check retried and still blocked by skill-runtime module resolution (`Cannot find package 'playwright' imported from ...web_game_playwright_client.js`).
- 2026-02-27: Fixed zero-mountain edge case in mountain profile builder and revalidated (`npm run build:front` pass).
- 2026-02-27: Added configurable mountain mode input (`random/single/multi/mixed`) from Phaser settings modal and wired it into `createTerrainMapData`.
- 2026-02-27: Mountain profile now tracks selection source (`fixed` or `random`) and stats text shows fixed/random mode state.
- 2026-02-27: Validation passed after mountain mode configurability update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Extended `山岳モード定義` with per-mode min/max knobs (mass counts, mass sizes, and per-mode spacing range), especially for `群峰`.
- 2026-02-27: Mountain profile generation now reads ranges from mode definitions first, with global settings as fallback.
- 2026-02-27: Validation passed after per-mode mountain-definition update: `npm run build:front`.
- 2026-02-27: Tuned `群峰` spacing range in `山岳モード定義` to 1-3 and revalidated (`npm run build:front` pass).
- 2026-02-27: Added map-size-aware spacing for mountain masses (`群峰`/`混合`): 36x36 resolves to 1-2, 54x54 resolves to 2-3 (allowing 3), while respecting per-mode definition bounds.
- 2026-02-27: Validation passed after map-size-aware mountain spacing update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Reworked mountain-gap scaling to remove hardcoded map-size thresholds and multipliers from logic; values now come from `山岳モード定義.距離倍率` (36->1.0, 54->1.5).
- 2026-02-27: Updated per-mode base gap ranges to be definition-driven (`群峰/混合` base 1-2, then scaled by mode rule).
- 2026-02-27: Validation passed after definition-driven gap scaling update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Removed remaining hardcoded fallback scale constants in gap-scaling logic; if mode scale params are missing, scaling is skipped and base range is used.
- 2026-02-27: Revalidated after removing gap-scaling fallback constants: `npm run build:front` pass.
- 2026-02-27: Added per-mode foothill hill probability knob (`山麓丘陵化確率`) in `山岳モード定義`, plus global fallback `地形生成設定.山岳塊.山麓丘陵化確率`.
- 2026-02-27: Implemented mountain-adjacent hill conversion pass controlled by that probability before remaining hill fill by height.
- 2026-02-27: Added stats output for foothill conversion (`山麓丘陵化` and `山麓丘陵化数`) in Phaser map details.
- 2026-02-27: Validation passed after foothill-hill probability update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Mitigated transient `ENOENT web-vue-dist/index.html` during watch rebuild by setting Vite `build.emptyOutDir` to `false`.
- 2026-02-27: Added Express SPA index fallback handler for dev rebuild windows: when `index.html` is temporarily missing, return a short auto-refresh page instead of raw ENOENT.
- 2026-02-27: Validation passed after ENOENT mitigation updates: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Decoupled elevation center logic into `島中央隆起幅` and `画面中央隆起幅` with base-height config, so island center and screen center are independently tunable.
- 2026-02-27: Added connected-island analysis for elevation and introduced post-coherence island relief guarantee to avoid all-plain peripheral islands.
- 2026-02-27: Added mountain-profile stats line for island relief guarantee additions in Phaser panel.
- 2026-02-27: Validation passed after island-center/relief updates: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Added composite terrain rendering support by preserving pre-forest relief as `reliefMap` and drawing `森+丘/山` as half-split colors in Phaser.
- 2026-02-27: Replaced explicit `山岳森林化` probability approach with overlap-condition based composition (forest generation checks relief conditions; mountain tiles become forest only when forest and relief conditions overlap).
- 2026-02-27: Added composite stats (`複合地形: 森+丘 / 森+山`) and click-time relief metadata support.
- 2026-02-27: Validation passed after composite-terrain overlap update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Added strong-monster placement condition framework in `map-generator.js` (`強敵配置設定` + environment-match based candidate selection) without adding concrete monster contents yet.
- 2026-02-27: Added strong-monster output data (`strongMonsterMap`, `strongMonsterInfoMap`, `strongMonsterStats`) to terrain generation results.
- 2026-02-27: Added Phaser UI indicators for strong-monster candidates (tile marker, stats line, and click detail: match count/level).
- 2026-02-27: Validation passed after strong-monster condition framework update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Reworked strong-monster logic to explicit rule set (variables in `強敵配置設定.ルール`): `森中央`, `砂漠オアシス`, `大森林外周(>=21, 規模/7, 距離3, 各50%)`, `森環丘山`.
- 2026-02-27: Implemented rule-3 single-spawn bonus (`単独時Lv加算`) and made all thresholds/probabilities distance values definition-driven (no hardcoded condition values).
- 2026-02-27: Added helper utilities for terrain components and hex-ring extraction to support rule-driven spawn placement.
- 2026-02-27: Updated strong-monster stats/click display to show rule-based outputs (`条件別` and `Lv + ルール名`).
- 2026-02-27: Validation passed after rule-based strong-monster settings update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Added rule-overlap control in strong-monster settings (`重複ルール許可`) and defaulted to non-overlap to avoid duplicate判定 on composite forest-relief cells.
- 2026-02-27: Added rule knobs to reduce mountain+forest double判定 side effects: `森中央.複合地勢セルを含む` and `森環丘山.中央が被覆森を除外`.
- 2026-02-27: Validation passed after strong-monster overlap mitigation: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Added randomized terrain-ratio profile system (`地形比率プリセット定義`) with three presets (`均衡`, `森林豊富`, `険峻`) and candidate list setting.
- 2026-02-27: Terrain generation now resolves one ratio profile per map and uses it for mountain/forest/hill/desert/lake target calculations.
- 2026-02-27: Added `terrainRatioProfile` to map output and surfaced selected profile in Phaser stats (`地形比率:`).
- 2026-02-27: Validation passed after terrain-ratio profile randomization update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Added dedicated lower-panel meta line `地形比率` (`mapTerrainProfileInfo`) so selected terrain-ratio preset is always visible outside the stats block.
- 2026-02-27: Validation passed after terrain-ratio meta line update: `npm run build:front`.
- 2026-02-27: Added post-coherence forest top-up pass (`topUpForestToTarget`) to reduce undershoot versus target forest ratio caused by clustering constraints and孤立森整理.
- 2026-02-27: Added explicit forest target output (`forestTargetCount`) and UI stats line (`森林目標 / 実績`) for quick verification.
- 2026-02-27: Validation passed after forest-ratio alignment update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path.
- 2026-02-27: Changed terrain-ratio presets from map-level selection to per-island assignment using near-even random distribution across connected islands.
- 2026-02-27: Applied per-island ratio targets to mountain/hill/forest/desert/lake planning; generation now constrains terrain placement passes to each island and displays per-island preset summary (e.g. `均衡2 / 森林豊富1 / 険峻1`) in lower stats/meta.
- 2026-02-27: Validation passed after per-island terrain-ratio update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Added configurable large-island count flow (`largeIslandCount`) from Phaser settings modal into map generation APIs.
- 2026-02-27: Implemented configured large-island placement pass and random islet generation (each islet target size 4-8 tiles; count is randomized per generation) in `generateIslands`.
- 2026-02-27: Added island composition stats line in Phaser details (`大島 実績/設定`, `孤島 実績/乱数`) so the generated structure is visible.
- 2026-02-27: Validation passed after island composition settings update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Kept existing island pattern flow and added separate island-custom settings path (`islandCustomSettings`) so pattern mode remains unchanged by default.
- 2026-02-27: Added a dedicated custom-island modal in `PhaserMapGeneratorPanel.vue` with toggle + knobs (`大島数`, `孤島数レンジ`, `大島間距離`, `目標陸地率`).
- 2026-02-27: Implemented custom island generation plan in `map-generator.js`: when custom is ON, target land ratio defaults around 70% and islet size range is auto-adjusted from islet count (still bounded to 4-8 tiles).
- 2026-02-27: Added custom island generation stats output (`島構成(カスタム)` and target land %) to lower detail text.
- 2026-02-27: Validation passed after custom-island modal and 70% auto-adjust generation update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Fixed island touching in multi-island custom generation by replacing plain smoothing with separation-safe smoothing (`smoothLandKeepingIslandSeparation`) that only fills sea cells surrounded by a single island ID.
- 2026-02-27: Custom/extended island generation now preserves at least one sea gap between different islands during shape smoothing.
- 2026-02-27: Validation passed after non-contact island smoothing fix: `npm run build:front`.
- 2026-02-27: Identified early-stop bug in large-island growth loop (single no-progress round caused premature termination with very low land ratio despite 70% target).
- 2026-02-27: Fixed large-island growth stability by using per-island multi-trial expansion, higher guard budget, and consecutive-stagnation break (`maxStagnantRounds`) instead of immediate break.
- 2026-02-27: Validation passed after large-island early-stop fix: `npm run build:front`.
- 2026-02-27: Updated large-island size allocation for multi-island generation to non-uniform random distribution around equal baseline (75%~125% per island) while preserving the exact configured total land budget.
- 2026-02-27: Changed custom island default target land ratio from 70% to 50% (UI default + generator fallback).
- 2026-02-27: Validation passed after island size variance and 50% default ratio update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Updated custom target land area bounds from 45%~85% to 25%~60% in both generator clamp and island-custom modal range input.
- 2026-02-27: Validation passed after custom land-area range update: `npm run build:front`.
- 2026-02-27: Cleaned up dead legacy map-render bridge code from `frontend/src/lib/map-generator.js` (old DOM rendering/meta/click handlers and map-size selector helpers) that is no longer referenced by Vue/Phaser.
- 2026-02-27: Removed obsolete internal state usage (`最新高度マップ`) and narrowed map-generator exports to only active API surface (`parseCoordKey`, `hexCenter`, `createIslandShapeData`, `createTerrainMapData`).
- 2026-02-27: Validation passed after map-generator cleanup: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Added dedicated separated-pattern generation path for `twins` and `chain` in `generateIslands` (non-custom mode), so those patterns no longer collapse into connected landmasses.
- 2026-02-27: `twins` now uses fixed two-seed separated layout with stronger minimum gap; `chain` now uses curved seed placement (`buildJapanLikeChainSeeds`) to produce Japan-like archipelago flow.
- 2026-02-27: Added `seedList` override support in `placeLargeIslands` so pattern-specific seed geometry can be enforced.
- 2026-02-27: Validation passed after twins/chain pattern shape fix: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Enforced inter-island sea separation of 2 tiles by adding cross-island proximity checks to main-island growth, islet growth, and separation-safe smoothing (`島構成.島間海マス = 2`).
- 2026-02-27: Added map zoom controls in Phaser panel (`-`, `100% reset`, `+`) using camera zoom multiplier over fit-zoom.
- 2026-02-27: Validation passed after island-gap + zoom controls update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Added strong-enemy visibility toggle in Phaser settings (`強敵候補を表示する`) and wired it to marker rendering, click details, and stats visibility.
- 2026-02-27: Improved island custom settings modal usability with grouped 2-column controls, per-field helper text, modal typography normalization, and target land-tile count preview (`目標陸地率` linked to map size).
- 2026-02-27: Validation passed after strong-enemy toggle + island-custom UI update: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after UI update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Expanded map-size presets to target the requested range (min around 1200 cells, max under 7000 cells): 30x40, 36x36, 48x48, 60x60, 72x72, 83x83. Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after map-size preset expansion is still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Updated default display settings to match requested baseline: `高度Lv表示=OFF`, `高度色補正=ON`, `隠し特殊常時表示=ON`, `滝エフェクト=ON`, `強敵候補表示=OFF` (size 23px / outline 3px / mountain mode random unchanged). Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after default-display update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Improved island custom number input UX by adding +/- stepper controls for `大島の数`, `大島間の最小距離`, and `孤島数(最小/最大)` with auto-normalization on button/input change.
- 2026-02-27: Added island custom stepper styling (larger clickable controls, centered numeric fields) for easier up/down adjustments on desktop and mobile. Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after island-custom stepper update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Adjusted island-custom steppers from horizontal (- input +) to right-side vertical controls (top `+`, bottom `-`) for easier up/down operation per field.
- 2026-02-27: Updated stepper layout/styles for vertical control stack (`number-stepper` + `step-stack`) while keeping value normalization behavior. Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after vertical-stepper update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Hid native number-input spin arrows in island custom steppers (`::-webkit-inner/outer-spin-button` off, `appearance: textfield`) so only custom vertical +/- controls are shown. Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after hiding native spin arrows still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Added data-driven reusable `GenericModal.vue` supporting type switching (`modalType`), field schema rendering (`checkbox/select/range/number/text`), notes, and field-change events.
- 2026-02-27: Replaced Phaser display settings modal with `GenericModal` using schema (`displaySettingsFields`) + centralized apply handler (`applyDisplaySettingChange`) to demonstrate generic modal usage by passed data/type.
- 2026-02-27: Validation passed after generic modal integration: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after generic modal integration still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Added GenericModal usage notes to `docs/MEMO.md` (purpose, `modalType` switching, field schema, event payload, and integration example).
- 2026-02-27: Updated docs policy in `docs/MEMO.md`: simple modals should use `GenericModal` by default; dedicated modals only when complex UI is required.
- 2026-02-27: Added in-field HUD overlays on Phaser map: semi-transparent top header with `食料/資材` summary and bottom-right elapsed clock (`HH:MM:SS`).
- 2026-02-27: Resource HUD values are derived from generated terrain counts (food/material weighted totals), and elapsed clock resets on each map generation (`applyMapData`) then updates every second.
- 2026-02-27: Added overlay styles (`map-field-wrap`, `field-overlay-header`, `field-resource-chip`, `field-overlay-clock`) with mobile wrap tuning. Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after HUD/clock overlay update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Tuned map overlay header to be visibly translucent so terrain remains visible behind it (semi-transparent strip + lighter resource chip opacity + subtle blur). Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after header translucency update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Refactored Phaser panel layout to keep gameplay HUD fully inside `#mapGrid` (resource header + elapsed clock overlays now rendered as children of map container).
- 2026-02-27: Moved non-game diagnostics outside the map into `開発モード情報` section, gated by `showDevInfo` (default from `import.meta.env.DEV`) with a dev-only toolbar toggle (`開発情報: ON/OFF`).
- 2026-02-27: Updated map canvas stacking styles (`position: relative`, canvas z-index, overlay layering) and added dev-info panel styling. Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after mapGrid-contained HUD/dev-info split still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Replaced bottom-right elapsed text with circular turn clock overlay (analog hand) in map HUD: one full hand rotation per 60 seconds (`turnDurationSec`), with turn index (`Tn`) and remaining seconds to next turn.
- 2026-02-27: Added turn-clock computed values (`elapsedSeconds`, `turnClockCycleSeconds`, `turnClockHandDeg`, `turnClockTurnNumber`, `turnClockRemainingSeconds`) and increased clock update cadence to 250ms for smoother hand movement. Validation passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after circular turn-clock update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-02-27: Added provisional special-terrain rows to `data/land_base_yield.csv`: `沼地`, `峡谷`, `洞窟` (resource/disaster/difficulty values) to support future non-base terrain yield handling.
- 2026-02-27: Validated CSV parsing after updates (`Import-Csv` rows=11, no blank terrain keys) and front build passed: `npm run build:front`.
- 2026-02-27: `develop-web-game` Playwright client retry after land-base-yield update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-01: Split coastal classification into `沿岸(海接触)` and `高度差1海辺` by adding `coastTypeMap` in `map-generator.js`; click info now shows `海辺判定` and separate `海接触` so inner-ring tiles no longer appear as direct sea-contact.
- 2026-03-01: Validation passed after coast-type split fix: `npm run build:front`.
- 2026-03-01: `develop-web-game` Playwright retry still blocked by skill-runtime dependency issue (`ERR_MODULE_NOT_FOUND: playwright`).
- 2026-03-01: Adjusted coast rule per latest spec: only land tiles directly adjacent to sea are `海辺` (`coastTypeMap=direct`); removed `高度差1` coastal classification from generator/render/click text. Validation passed: `npm run build:front`.
- 2026-03-01: Updated coast rule again: `海辺` now requires both sea adjacency and height-level difference <= 1 against at least one adjacent sea tile. Validation passed: `npm run build:front`.
- 2026-03-02: Added turn progression system for generated terrain maps with new `advanceTerrainTurn` API in `map-generator.js` (supports per-turn volcano eruptions and lava flow simulation).
- 2026-03-02: Lava behavior updated per spec: each volcano advances up to 3 tiles per turn with random early stop; lava overlay stored as `lavaMap` and surfaced in stats/click info.
- 2026-03-02: Added UI controls in `PhaserMapGeneratorPanel.vue`: `ターン経過` button, `イベントテスト` toggle, and event modal (`GenericModal`) showing eruption/lava logs each turn.
- 2026-03-02: Validation passed: `npm run build:front`. Playwright client retry still blocked by skill-runtime dependency issue (`ERR_MODULE_NOT_FOUND: playwright`).
- 2026-03-02: Added event-control modal in Phaser map panel (`イベント管理`) to select execution mode per turn: `通常` / `噴火のみ` / `溶岩のみ` / `噴火+溶岩`.
- 2026-03-02: `advanceTerrainTurn` now accepts `eventMode`, supports forced event generation by mode, and returns `lavaFlowData` (node/edge/source keys) for path rendering.
- 2026-03-02: Switched lava rendering from tile tint to river-like overlay: thick connected lines + node points (`drawLavaOverlay`), with map click info still showing lava presence.
- 2026-03-02: Validation passed after event-manager/lava-overlay update: `npm run build:front`; Playwright retry still blocked by skill-runtime `playwright` dependency resolution.
- 2026-03-02: Changed lava progression to persistent-flow model (`lavaState`) so direction is fixed after first move and prior lava positions do not reshuffle each turn.
- 2026-03-02: Lava now stops permanently once it stops (`random_stop`/`direction_blocked`/`no_path`) and also stops on river collision (`river_hit`); stopped flows no longer advance on later turns.
- 2026-03-02: Added event-manager driven `eventMode` handling to `advanceTerrainTurn`; `溶岩` mode can force-create a volcano from a mountain if none exists for test execution.
- 2026-03-02: Lava rendering remains river-like (thick connected lines + nodes) using accumulated `lavaFlowData`, with persistent overlays across turns.
- 2026-03-02: Validation passed: `npm run build:front`; Playwright retry still blocked by unresolved `playwright` in skill runtime.
- 2026-03-02: Improved event-control modal UX by replacing select dropdown with 4 large mode cards (normal/eruption/lava/both), inline descriptions, active highlight, and current-mode hint; mobile switches to single-column cards. Validation passed: `npm run build:front`.
- 2026-03-02: Added shared audio controller (`frontend/src/lib/audio-player.js`) using `古の世界地図.mp3` as default loop BGM and mapped common UI SE from `assets/audio/se`.
- 2026-03-02: Extended display settings modal with section headers and audio controls (`全体音量 / BGM音量 / SE音量`) via GenericModal header field support.
- 2026-03-02: Wired settings UI to audio controller volume APIs (`setMasterVolume`, `setBgmVolume`, `setSeVolume`) and switched modal open/close paths to dedicated handlers using shared SE.
- 2026-03-02: Validation passed after audio settings update: `npm run build:front`.
- 2026-03-02: Persisted audio settings to browser localStorage (`fantasy_strategy.audio_settings.v1`): master/bgm/se volumes now restore on load and save on slider change.
- 2026-03-03: Added skill-tree modal access points in header/menu (`AppHeader.vue`, `MenuPanel.vue`) including category-specific open actions that pass payload categories.
- 2026-03-03: Added category shortcut UI for skill modal (`魔法/軍事/経済/信仰`) and supporting styles in `frontend/src/styles.css`.
- 2026-03-03: Updated `docs/MEMO.md` with skill-tree modal usage (`openModal('skill', { categories })`) and audio-settings persistence/reference notes.
- 2026-03-03: Validation passed after skill-tree entry-point updates: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND` from `web_game_playwright_client.js`).
- 2026-03-03: Reworked `SkillTreeModal.vue` from list-only view to hybrid strategy-game layout: category tabs (top), branch tree columns (center), and selected-skill detail panel (right).
- 2026-03-03: Added interactive node selection state in skill modal (active category + selected node sync), with placeholder unlock details (`必要ポイント(仮)`, `前提スキル`, `取得ボタン` disabled).
- 2026-03-03: Validation passed after skill-tree hybrid UI update: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry after hybrid UI update still blocked by unresolved `playwright` (`ERR_MODULE_NOT_FOUND`).
- 2026-03-03: Added branch-from-middle pattern support in skill tree data/view: `魔法` category now has `rootSkill` (`魔法の球`) as shared starting node before branch columns.
- 2026-03-03: Updated `SkillTreeModal.vue` selection logic to include root node IDs, root-first default selection, and prerequisite display (`分岐1段目` prerequisites now point to root when present).
- 2026-03-03: Added root-node visuals (`root-zone`, down-link, split-line) so the tree clearly shows `起点 -> 分岐` structure.
- 2026-03-03: Validation passed after root-node branch structure update: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry after root-node update still blocked by unresolved `playwright` (`ERR_MODULE_NOT_FOUND`).
- 2026-03-03: Added JSON-based race master data for selection UI in `frontend/src/data/race-selection-db.json` (name/icon/description/traits/base stats).
- 2026-03-03: Added `RaceSelectModal.vue` (left race list + right icon/detail panel + confirm action) and connected it to App modal flow (`open-modal: race`).
- 2026-03-03: Switched `App.vue` race stats source from hardcoded map to `race-selection-db.json` derived object, with default fallback stats.
- 2026-03-03: Added race modal entry buttons in `AppHeader.vue` and `MenuPanel.vue`, plus selected-race display in header.
- 2026-03-03: Added `selectedRace`/`showRaceModal` to `render_game_to_text` payload and app state.
- 2026-03-03: Validation passed after race-selection modal update: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry after race-selection update still blocked by unresolved `playwright` (`ERR_MODULE_NOT_FOUND`).
- 2026-03-03: Aligned race data location with JSON export policy by moving race source to `data/source/export/json/種族.json`; updated imports in `App.vue` and `RaceSelectModal.vue`.
- 2026-03-03: Removed temporary frontend-local race JSON (`frontend/src/data/race-selection-db.json`) after migration to export JSON path.
- 2026-03-03: Revalidated after race-data path migration: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry after race-data migration still blocked by unresolved `playwright` (`ERR_MODULE_NOT_FOUND`).
- 2026-03-03: Added `ClassSelectModal.vue` using export JSON sources (`クラス.json`, `スキル一覧.json`, `説明.json`) to show class details by selected race.
- 2026-03-03: Implemented race-to-class flow: deciding race now opens class modal automatically; class modal supports class list, base status, skill levels, acquired skill details, and confirm action.
- 2026-03-03: Added class selection state to `App.vue` (`showClassModal`, `selectedClass`) and exposed it in `render_game_to_text` (`modal.class`, `playerSetup.selectedClass`).
- 2026-03-03: Added class modal open buttons and selected-class display in `AppHeader.vue` / `MenuPanel.vue`.
- 2026-03-03: Validation passed after class-selection modal integration: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry after class-selection update still blocked by unresolved `playwright` (`ERR_MODULE_NOT_FOUND`).
- 2026-03-03: Fixed acquired-skill display bug in `ClassSelectModal.vue`: placeholder tokens (`0`, `-`, `なし`, `null`) are now excluded, unknown skill names are skipped, and duplicate render keys are eliminated.
- 2026-03-03: Adjusted class UI rule: when class type is `人族`, the acquired-skill section is hidden entirely.
- 2026-03-03: Extended `RaceSelectModal.vue` to show base status panel (HP/攻撃/防御/魔力/精神/速度/命中/SIZ) derived from `クラス.json` race-base rows.
- 2026-03-03: Validation passed after class/race status display fixes: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry after class/race display fixes still blocked by unresolved `playwright` (`ERR_MODULE_NOT_FOUND`).
- 2026-03-03: Replaced incomplete status-range draft in `PhaserMapGeneratorPanel.vue` with character-status creation rules: initial level random `5-10`, race base `Lv5 + Lv5` (no race skill gain), and class-based growth per level; human-type races additionally receive class `+5Lv` bonus.
- 2026-03-03: Added terrain-generation-time bootstrap for initial village and one named unit (`createVillageAndInitialUnit`) and surfaced generated details in dev panel (`初期村` / `キャラ生成ルール` / `選択ユニット`).
- 2026-03-03: Extended tile-click detail to include units on the tile and wired tile click to select the unit when present.
- 2026-03-03: Removed duplicate `parseMapSizeValue` declaration in `PhaserMapGeneratorPanel.vue`.
- 2026-03-03: Validation passed after character-status creation update: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry after character-status update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-03: Added character-state emission from `PhaserMapGeneratorPanel.vue` (`character-state-change`) so generated village/unit data can be consumed by `App.vue`.
- 2026-03-03: Added `CharacterStatusModal.vue` and wired new modal type `characters`; modal shows self-unit list and selected unit status details (stats/equipment/growth rule).
- 2026-03-03: Added icon entry using `assets/images/攻撃手段/肉体.webp` in both `AppHeader.vue` and `MenuPanel.vue` to open character status modal.
- 2026-03-03: Updated `App.vue` modal state and map-panel wiring (`:selected-race`, `:selected-class`, `@character-state-change`) plus `render_game_to_text` modal flag for `characters`.
- 2026-03-03: Validation passed after character-status modal/icon integration: `npm run build:front`.
- 2026-03-03: `develop-web-game` Playwright client retry after character-status modal integration still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-03: Reduced character status growth scale by applying `1/10` divisor to per-level growth values (`STATUS_GROWTH_DIVISOR = 10`) in `PhaserMapGeneratorPanel.vue`.
- 2026-03-03: Updated character rule text output to include growth scale (`成長係数 1/10`) and revalidated build (`npm run build:front` pass).
- 2026-03-04: Added ordered implementation task sheet in docs/NEXT_TASKS.md (Phase1-3 + DoD + tutorial necessity/MVP steps).
- 2026-03-04: Linked docs/MEMO.md task section to docs/NEXT_TASKS.md for sequential execution reference.
- 2026-03-04: Switched Vite build cleanup back to `emptyOutDir: true` in `frontend/vite.config.mjs` so old `web-vue-dist/assets/index-*.js` files are not accumulated.
- 2026-03-04: Validation passed after dist cleanup setting change: `npm run build:front`.
- 2026-03-04: Added `CharacterNameModal.vue` and character naming flow: after class confirmation, name modal opens (`クラス選択 -> 名前設定`).
- 2026-03-04: Added `selectedCharacterName` state to `App.vue`, wired modal kind `name`, and passed name into `PhaserMapGeneratorPanel` / `render_game_to_text` playerSetup.
- 2026-03-04: `PhaserMapGeneratorPanel.vue` now uses selected character name for initial named unit and updates existing named unit when name setting changes.
- 2026-03-04: Added name-setting entry buttons in `AppHeader.vue` and `MenuPanel.vue`.
- 2026-03-04: Validation passed after naming flow update: `npm run build:front`.
- 2026-03-04: `develop-web-game` Playwright client retry after naming flow update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-04: Added `closeOnBackdrop` option to `BaseModal.vue` (default true) and disabled backdrop-close only for `CharacterNameModal.vue`.
- 2026-03-04: Validation passed after name-modal backdrop behavior update: `npm run build:front`.
- 2026-03-04: Changed initial village flow in `PhaserMapGeneratorPanel.vue` from auto-placement to manual placement mode after character creation.
- 2026-03-04: Added village placement button and click-to-place validation (land only; excludes sea/lake/volcano), with pending village state until placement.
- 2026-03-04: Added in-tile village marker rendering (inner circle + `村` label) without changing tile outer color.
- 2026-03-04: Validation passed after village manual-placement update: `npm run build:front`.
- 2026-03-04: Added leader concept for first created unit (`isLeader: true`) and visual leader marker (`L`) on map tiles in Phaser rendering.
- 2026-03-04: Extended naming flow to support both character name and village name via `CharacterNameModal.vue`; stored in `App.vue` as `selectedCharacterName` + `selectedVillageName`.
- 2026-03-04: `PhaserMapGeneratorPanel.vue` now consumes `selectedVillageName`, applies it to pending/placed village, and syncs village name on later changes.
- 2026-03-04: Updated status UI (`CharacterStatusModal.vue`) to show leader indicator and village placement state.
- 2026-03-04: Validation passed after leader/village-name update: `npm run build:front`.
- 2026-03-04: `develop-web-game` Playwright client retry after leader/village-name update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-04: Added Phaser map hover highlight (`hoverLayer`) so the tile under cursor is emphasized with a bright frame/fill for easier targeting.
- 2026-03-04: Added territory border coloring in `PhaserMapGeneratorPanel.vue`: player territory is cyan and enemy territory is red; default border color remains unchanged for unowned tiles.
- 2026-03-04: Added map drag-pan interaction (click-drag) with drag-threshold handling so drag does not trigger click selection.
- 2026-03-04: Added mouse-wheel zoom focused on hover/cursor position; zoom now keeps camera focus stable instead of recentering every redraw.
- 2026-03-04: Updated click detail text to include territory ownership (`自領/敵領/未所属`).
- 2026-03-04: Validation passed after map interaction update: `npm run build:front`.
- 2026-03-04: `develop-web-game` Playwright client retry after hover/territory/zoom/drag update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-04: Updated dev help hint text in Phaser panel to reflect new controls (click detail / drag pan / wheel zoom) and revalidated (`npm run build:front`).
- 2026-03-04: Adjusted player territory range from 4 to 1 tile around the village (`PLAYER_TERRITORY_RANGE = 1`) per latest request; build validation passed (`npm run build:front`).
- 2026-03-04: Added click-camera-follow setting (`focusCameraOnTileClick`) to display settings; default is OFF. Click focus functions remain in code and are only applied when ON.
- 2026-03-04: Added temporary race-based village population config JSON: `data/source/export/json/種族初期村人口設定.json` and wired initial village population generation to this data (with default fallback).
- 2026-03-04: Implemented unit movement mode in `PhaserMapGeneratorPanel.vue` (`ユニット移動: ON/OFF`). Movement consumes no AP, uses path/range check, and updates unit position on map click.
- 2026-03-04: Added fog-of-war style visibility: tiles outside village vision, unit scout vision, and explored movement path are rendered gray (`不明`). River/lava/special/height overlays are hidden on unseen tiles.
- 2026-03-04: Visibility is now persistent per map via explored tiles; moved path remains revealed while dynamic visibility comes from village + units scout range.
- 2026-03-04: Validation passed after click-focus/population/movement/fog implementation: `npm run build:front`.
- 2026-03-04: `develop-web-game` Playwright client retry after this update is still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-04: Updated fog memory behavior: tiles seen once by scout/village vision are now persisted in `exploredTileKeys` and remain visible thereafter on the same map.
- 2026-03-04: Updated move-mode range visualization to blinking green border on reachable tiles (excluding current tile), and added 250ms redraw while move mode is ON for blink animation.
- 2026-03-04: Validation passed after fog-memory + blinking move-range update: `npm run build:front`.
- 2026-03-04: `develop-web-game` Playwright client retry after fog-memory/move-range blink update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-04: Renamed first-unit role concept to `統治者` and separated it from `リーダー` (leader now means squad-holder).
- 2026-03-04: Extended initial unit generation to multiple units: `統治者` x1 + random mobs (2-4). Added unit fields `isSovereign`, `isNamed`, `squadCount`, `squads`, and `moveRemaining`.
- 2026-03-04: Added named-promotion framework with city-scale cap (村2/町4/都市7). Promotion commands can now be sent from character screen and validated in map panel.
- 2026-03-04: Added squad toggle framework (`toggleSquad`) so units can hold squads and become `リーダー` when squadCount>0.
- 2026-03-04: Added move-unit selection modal when enabling move mode; user selects which unit to move before entering move mode, and modal shows role/position/move remaining/scout/squad info.
- 2026-03-04: Updated movement rule to 2-tile chunk per action using `moveRemaining`; each click moves up to 2 tiles toward target, no AP cost. Movement points reset on turn advance.
- 2026-03-04: Updated CharacterStatusModal with role labels (`統治者/ネームド/モブ`), squad display, move-remaining display, and action buttons for promote/toggle squad.
- 2026-03-04: Validation passed after multi-unit/sovereign/move-modal/2-tile-move update: `npm run build:front`.
- 2026-03-04: `develop-web-game` Playwright client retry after this update still blocked by unresolved `playwright` in skill runtime path (`ERR_MODULE_NOT_FOUND`).
- 2026-03-04: Replaced initial village population source from temporary `種族初期村人口設定.json` to `data/source/export/json/勢力.json` (`初期人数` fixed value, with fallback to first defined value).
- 2026-03-04: Added multi-resource village state in `PhaserMapGeneratorPanel.vue`: `populationByRace`, `foodStockByType(穀物/野菜/肉/魚)`, `materialStockByType(木材/石材/鉄)` and kept total fields (`foodStock`, `materialStock`) synchronized.
- 2026-03-04: Implemented per-turn economy order: `領土収入 -> ユニット維持費 -> 村人口消費 -> 不足ペナルティ(保留ログのみ)`; territory income now uses `data/source/export/json/地形.json` per-tile yield.
- 2026-03-04: Added food substitution rule for shortages (other food stocks consumed at 1.2x conversion), and appended economy breakdown lines to turn event modal.
- 2026-03-04: Added race-based upkeep/consumption source from class sheet (`クラス.json` race rows, food columns divided by 10 per unit/person).
- 2026-03-04: Updated village/status UI to show population as headcount (not ratio), race headcount breakdown, and per-resource detailed stocks.
- 2026-03-04: Added unit tile icon marker behavior for multi-unit stacks: render first unit's race glyph as tile icon and show stack count badge when multiple units share a tile.
- 2026-03-04: Added sovereign nation log storage (`nationLogsBySovereign`) and new UI button/modal (`統治者ログ`) for viewing nation logs.
- 2026-03-04: `develop-web-game` client check retried (`web_game_playwright_client.js --help`) and remains blocked by skill-runtime dependency issue (`ERR_MODULE_NOT_FOUND: playwright`).
- 2026-03-04: Added map HUD population chip (`総人口`) to field header, including quick race-count detail text when village exists.
- 2026-03-04: Added in-map header action buttons (`ログ`, `ユニット作成`) so log viewing and unit creation are usable even in map-focused/fullscreen flow.
- 2026-03-04: Added unit creation flow in `PhaserMapGeneratorPanel.vue` with modal UI (name optional / class select / count 1-20), fixed temporary costs consumption (food+material), and spawn-at-village behavior.
- 2026-03-04: Unit creation now deducts from typed village stocks and writes actions to sovereign nation log; insufficient-resource error handling added.
- 2026-03-04: Validation passed after HUD population + log button + unit creation implementation: `npm run build:front`.
- 2026-03-04: `develop-web-game` client retry after unit-creation update is still blocked by skill-runtime dependency issue (`ERR_MODULE_NOT_FOUND: playwright`).
- 2026-03-04: Refined unit creation flow per latest rule: removed free-form naming and count input; unit creation now selects only `種族` and `クラス` then creates one unit.
- 2026-03-04: Reused existing `RaceSelectModal.vue` and `ClassSelectModal.vue` for unit creation selection flow (`ユニット作成` -> 種族選択 -> クラス選択 -> 即作成).
- 2026-03-04: Unit names for created non-named units are now auto-generated as `種族名 + クラス + 連番` (e.g., `只人ファイター3`) via `buildAutoUnitName`.
- 2026-03-04: Validation passed after unit-creation modal-reuse + auto-name update: `npm run build:front`.
- 2026-03-04: `develop-web-game` client retry after modal-reuse update is still blocked by skill-runtime dependency issue (`ERR_MODULE_NOT_FOUND: playwright`).
- 2026-03-04: Removed automatic initial character injection in map generation; start state now creates village data only and leaves unit list empty until explicit unit creation.
- 2026-03-04: Updated unit creation to support batch mob creation count with cap rule `モブ総数 <= 人口/10`; added count control in map toolbar and enforcement in creation logic.
- 2026-03-04: Added mob deletion command path (`removeMob`) from CharacterStatusModal -> App -> PhaserMapGeneratorPanel; only non-named/non-sovereign mobs are removable.
- 2026-03-04: Kept squad formation flow and ensured it works for player-created mobs (toggle squad command unchanged, UI maintained).
- 2026-03-04: Added character list summary to header (`自キャラ一覧`) so current units are visible directly from header area.
- 2026-03-04: Validation passed after no-auto-char + mob-cap + mob-delete + header-list update: `npm run build:front`.
- 2026-03-04: `develop-web-game` client retry after this update is still blocked by skill-runtime dependency issue (`ERR_MODULE_NOT_FOUND: playwright`).
- 2026-03-04: Adjusted batch-create naming to avoid duplicate names in the same creation burst (`種族+クラス+連番` now increments correctly across multi-create loop).
- 2026-03-04: Revalidated after batch-name sequence fix: `npm run build:front`.
- 2026-03-04: `develop-web-game` client retry after batch-name fix is still blocked by skill-runtime dependency issue (`ERR_MODULE_NOT_FOUND: playwright`).

Deferred / memo (latest user decisions):
- 不足時ペナルティの本実装は後回し（将来イベント化）。現状は不足量をログ表示のみ。
- ユニット作成コストは仮固定（食料 20/20/20, 資材 20/20/20）。作成UI/本ルールは後続タスク。
- 勢力/NPC AI 調整は後回し（別タスク）。
- 2026-03-04: モブ作成仕様を更新。`createUnitFromSelection` 経由の `createUnitRecord` 呼び出しで `fixedLevel=5` と `fixedClassLevels=5` を渡し、モブ初期値を「Lv5 / 選択クラスLv5」に固定。
- 2026-03-04: `buildCharacterStatusFromRules` にクラスLv固定オプションを追加。固定時は人族ボーナスに依存せず指定クラスLvをそのまま採用。
- 2026-03-04: 検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアント再試行は引き続き `ERR_MODULE_NOT_FOUND: playwright`（スキル実行環境依存）。
- 2026-03-04: Phase1 Task2(建設システム)を実装。村建設モーダルを追加し、建物選択(穀倉/製材所/採石場)で資材コスト消費後に建設できるようにした。
- 2026-03-04: 村データに `buildings` を追加し、毎ターン経済処理へ建設補正収入を反映（`建設補正収入` 行をイベントログへ出力）。建設前後で収支数値が変化するDoDに対応。
- 2026-03-04: 建設条件不足をブロック（`建設失敗: 資材不足`）し、成功時は国家ログへ建設完了・コスト・補正を記録。
- 2026-03-04: 検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアント再試行は引き続き `ERR_MODULE_NOT_FOUND: playwright`（スキル実行環境依存）。
- 2026-03-04: `docs/NEXT_TASKS.md` に進捗状態を追記（Task1/Task2=完了、Task3=次着手）し、順次実装の基準を明確化。
- 2026-03-04: Phase1 Task3(ユニット行動/AP)を実装。ユニットに `actionPointMax/actionPoint` を追加し、移動時にAPを1消費する仕様へ変更（移動2マス/回の既存仕様は維持）。
- 2026-03-04: APが0のユニットは移動不可。移動モード選択候補は `AP>0 && 移動残>0` のユニットのみ表示。移動不可時は `APがありません` を表示。
- 2026-03-04: ターン経過で全ユニットの移動残量とAPを最大値へ回復するよう更新し、国家ログへ `行動ポイント回復` を記録。
- 2026-03-04: CharacterStatusModal に AP 表示を追加し、ユニット詳細でAP残量を確認可能にした。
- 2026-03-04: 検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアント再試行は引き続き `ERR_MODULE_NOT_FOUND: playwright`（スキル実行環境依存）。
- TODO(next): Phase2 Task4 索敵と遭遇（発見状態・発見ログ・戦闘遷移フック）に着手。
- 2026-03-04: 移動後に全ユニットのAP/移動残が0になった場合、`ユニット移動モード` を自動OFFにするUX補強を追加。
- 2026-03-04: AP実装後の再検証 `npm run build:front` 成功。Playwright クライアント再試行は `ERR_MODULE_NOT_FOUND: playwright` 継続。
- 2026-03-04: 要望対応: 移動時のAP表示を全廃し、移動は `移動残` のみで管理する仕様へ戻した（移動選択UI/自キャラ詳細/選択ユニット文言を更新）。
- 2026-03-04: 移動コストを地形高度対応に変更。1歩=基本1、前後タイルで高度Lvが変化する歩行は追加+1（合計2）を消費。到達可能範囲計算と経路探索を重み付きコスト方式へ更新。
- 2026-03-04: ターン経過ログ文言を `移動残量回復` に更新。検証 `npm run build:front` 成功。Playwright クライアントは `ERR_MODULE_NOT_FOUND: playwright` 継続。
- 2026-03-04: 移動ヘルプ文言を更新（高度変化マスは移動コスト+1を明記）。再検証 `npm run build:front` 成功。
- 2026-03-04: 開始フローを追加。`ゲーム開始` 押下で `統治者作成(種族→クラス→名前)` を開始し、完了後に `初期村を配置`、配置完了後に `モブを作成` へ段階遷移する制御を `App.vue` に実装。
- 2026-03-04: AppHeader/MenuPanel に `ゲーム開始` ボタンを追加し、ヘッダーに `開始フロー` 表示を追加。
- 2026-03-04: PhaserMapGeneratorPanel に `gameSetupReady` を追加し、開始前は村配置/モブ作成をブロック。開始完了で村配置待機を有効化。外部コマンド `startVillagePlacement` / `openUnitCreate` に対応。
- 2026-03-04: 検証 `npm run build:front` 成功。Playwright クライアントは `ERR_MODULE_NOT_FOUND: playwright` 継続。
- 2026-03-04: 要望対応(基本機能修正)。`createVillageAndInitialUnit` で統治者ユニットを自動生成するよう変更（開始時に自キャラ一覧へ統治者が表示される）。
- 2026-03-04: 初期化時の国家ログキーを統治者IDへ紐付けし、開始ログに統治者の種族/クラス/Lvを追記。`unitRulesInfoText` も「初期統治者は自動生成」に更新。
- 2026-03-04: `phaser-map-canvas` 内ヘッダーアクションに `自キャラ` ボタンを追加し、`PhaserMapGeneratorPanel` から `open-modal('characters')` を emit してマップ画面側から自キャラ一覧を開けるようにした。
- 2026-03-04: `App.vue` で `PhaserMapGeneratorPanel` の `@open-modal` を受ける配線を追加。
- 2026-03-04: モブ作成の種族選択を自陣営所属のみへ制限。`unitCreateAllowedRaces`（村人口内訳 + 既存ユニット種族 + 選択種族）を導入し、作成時の選択/確定/生成前チェックに適用。
- 2026-03-04: `RaceSelectModal.vue` に `allowedRaces` プロップを追加し、許可対象のみ表示・選択可能に変更（未指定時は従来通り全種族表示）。
- 2026-03-04: 統治者追加後の開始フロー判定を修正。`mob` 完了条件は `units.length > 0` ではなく `統治者以外が1体以上` へ変更。
- 2026-03-04: 検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアント再試行は引き続き `ERR_MODULE_NOT_FOUND: playwright`（スキル実行環境依存）。
- 2026-03-04: 追加調整。モブ作成の許可種族から `props.selectedRace` フォールバックを除外し、`村人口内訳 + 既存ユニット` に厳密一致する自陣営種族のみ選択可能にした。
- 2026-03-04: 再検証 `npm run build:front` 成功。Playwright クライアント再試行は同一理由で失敗（`ERR_MODULE_NOT_FOUND: playwright`）。
- 2026-03-04: 部隊編成をメンバー選択式へ拡張。`CharacterStatusModal` の「部隊」欄で候補ユニットを選択し、`toggle-squad` で `memberIds` を送信するUIに変更（最大5名、他部隊リーダーは候補から除外）。
- 2026-03-04: `App.vue` のキャラコマンド送信を拡張し、`toggleSquad` へ `memberIds` を中継可能にした。
- 2026-03-04: `PhaserMapGeneratorPanel.vue` の部隊ロジックを `configureUnitSquadState` に更新。選択メンバーで部隊を再構成し、他リーダー部隊からの再配属・`squadLeaderId` 付与・`squadCount/squads` 同期を実装。
- 2026-03-04: ユニット削除時に部隊参照を掃除する `stripRemovedUnitFromSquads` を追加。隊長/隊員の削除で不整合な部隊リンクが残らないよう対応。
- 2026-03-04: ユニット情報表示/タイルタグを更新（`隊`=リーダー、`員`=隊員）。
- 2026-03-04: 検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアント再試行は引き続き `ERR_MODULE_NOT_FOUND: playwright`（スキル実行環境依存）。
- 2026-03-04: 部隊UIの文言/導線を修正。未編成でも「部隊を解除」と見える問題を解消し、状態別に `部隊を編成 / 部隊を更新 / 部隊を解除 / 隊員状態を解除` を表示。
- 2026-03-04: 部隊候補が0人のときに案内文（モブ作成が必要）を表示し、実行不能ボタンは無効化。
- 2026-03-04: 再検証 `npm run build:front` 成功。
- 2026-03-04: 部隊管理仕様を再設計。`CharacterStatusModal.vue` に `自キャラ / 部隊` タブを追加し、部隊タブで「部隊一覧」「部隊を作成（リーダー→メンバー→名前）」のフローを実装。
- 2026-03-04: 部隊作成は同座標制約を適用。メンバー候補は `リーダーと同じ座標` かつ `未所属` のみ表示し、既に部隊所属(リーダー/隊員)のユニットは選択不可にした。
- 2026-03-04: `App.vue` で `squads` を受け渡し対象に追加し、`create-squad / rename-squad / dissolve-squad` のイベントを `characterCommand` 経由で Phaser へ送れるようにした。
- 2026-03-04: `PhaserMapGeneratorPanel.vue` に部隊サマリ生成 `buildSquadSummaryList` を追加し、`emitCharacterStateChange` で部隊一覧を返却。表示値として部隊索敵/隠密を算出（索敵=最高索敵+各員索敵/5、隠密=合計隠密÷(人数*0.75)※1人時はそのまま）。
- 2026-03-04: Phaser 側コマンドを拡張。`createSquad / renameSquad / dissolveSquad` を実装し、部隊名、リーダー/隊員リンク、メンバー再配属、削除時リンク掃除を同期。
- 2026-03-04: 再検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアント再試行は引き続き `ERR_MODULE_NOT_FOUND: playwright`（スキル実行環境依存）。
- 2026-03-04: 移動仕様を更新。`ソロ or 部隊リーダー` のみ移動対象にし、`squadLeaderId` を持つ部隊員の単独移動を禁止。移動選択モーダル候補も同条件に制限。
- 2026-03-04: 部隊リーダー選択時の移動を部隊同時移動へ変更。部隊全員が同座標に揃っている場合のみ移動可能、移動残は部隊内最小値で判定し、移動後は全員の座標/移動残を同期更新。
- 2026-03-04: `CharacterStatusModal` を拡張し、自キャラ詳細で `ステータス / 技能 / 耐性 / 装備` を表示。装備はスロットごとに装備名・レア度を選んで変更可能にした（`update-unit-equipment` emit）。
- 2026-03-04: `App.vue` に装備変更コマンド中継を追加（`updateEquipment`）。
- 2026-03-04: `PhaserMapGeneratorPanel.vue` に装備更新処理を追加。`装備.json` を基準にレア度倍率を適用（コモン1.0 / アンコモン1.25 / レア1.5 / エピック1.75 / レジェンダリー2.0）。
- 2026-03-04: Cr威力の計算を特別化。`上位桁(百の位以上)は固定`・`下2桁のみ倍率` を適用するよう変更（例: 135 x2.0 => 170）。
- 2026-03-04: ユニット状態に `skillLevels` / `resistances` を追加して emit するよう変更。生成時にクラス技能値と種族+クラス耐性値を保持。
- 2026-03-04: 検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアントは引き続き `ERR_MODULE_NOT_FOUND: playwright` で実行不可（スキル実行環境依存）。
- 2026-03-05: `クラス.json` の装備枠列（`武器1/武器2/頭/体/足/装飾1/装飾2`）をゲームへ取り込み。セルに `×` がある枠は装備不可として判定・UI表示（「× 装備不可」）・コマンド側検証に反映。
- 2026-03-05: 装備管理をスロット固定へ変更。`CharacterStatusModal` の装備欄を 7枠固定表示にし、各スロットで対応装備のみ選択可能に更新。
- 2026-03-05: 装備変更コマンドを `slotKey` 対応に拡張。部位不一致装備や装備不可枠への変更要求を拒否するようにした。
- 2026-03-05: 装備データ拡張に備えて `createEquipmentEntry` を拡張。`値段倍率`・`必要素材`・耐性列を読み込み、価格は `基本20 x 値段倍率` で `金(仮)` 表示する仕様を実装。
- 2026-03-05: 防具耐性反映に対応。ユニットに `baseResistances` を保持し、装備耐性ボーナスを合算した `resistances` を生成/再計算する処理を追加。
- 2026-03-05: 検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアントは引き続き `ERR_MODULE_NOT_FOUND: playwright`（スキル実行環境依存）。
- 2026-03-05: Added shared icon asset resolver `frontend/src/lib/icon-library.js` to unify icon usage from `assets/images/アイコン` (`DEFAULT_ICON_NAME/SRC`, icon list, name/src resolution).
- 2026-03-05: Updated `AppHeader.vue` / `MenuPanel.vue` / `CharacterStatusModal.vue` to use unified icon source instead of old `assets/images/攻撃手段` path.
- 2026-03-05: Extended `CharacterStatusModal.vue` squad member detail to include `技能` / `耐性` / `取得スキル` / `装備枠` in addition to status.
- 2026-03-05: Added per-unit icon selection UI in `CharacterStatusModal.vue` (character tab and squad detail) and emit `update-unit-icon` command.
- 2026-03-05: Wired icon update flow `App.vue -> PhaserMapGeneratorPanel.vue` via `characterCommand` type `updateIcon`; units now persist `iconName`/`iconSrc` in emitted character state.
- 2026-03-05: Added unit icon defaults on unit creation (`createUnitRecord`) with race-based fallback and shared icon resolver.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: `develop-web-game` Playwright client check attempted but blocked by missing runtime dependency (`ERR_MODULE_NOT_FOUND: playwright` from skill script runtime).
- 2026-03-05: Squad scout/stealth calculation updated to skill-only basis (missing skill now contributes 0) in `PhaserMapGeneratorPanel.vue`.
- 2026-03-05: Squad scout support formula clarified in code as `max scout + sum(other scouts / 5)`; stealth stays `sum / (count*0.75)` for multi-member squads.
- 2026-03-05: Added shared character detail component `CharacterUnitDetailPanel.vue` and reused it in both character tab and squad member detail (`CharacterStatusModal.vue`).
- 2026-03-05: Skill acquisition parser now detects dynamic skill columns (`SkillN` / `スキルN`) and supports delimited values (`/`, `,`, `、`) in `buildUnitSkillsFromClass`.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: Updated Phaser viewport policy to fixed virtual resolution 1280x720 (`GAME_VIEW_WIDTH/HEIGHT`) with `Phaser.Scale.FIT + CENTER_BOTH` for device-size scaling.
- 2026-03-05: Removed per-render `game.scale.resize(...)` and switched camera view-size calculations to fixed virtual size.
- 2026-03-05: Updated `.phaser-map-canvas` to 16:9 (`aspect-ratio`) and max width 1280 so the whole frame scales down on smaller screens.
- 2026-03-05: Build revalidated after viewport scaling changes (`npm run build:front`).
- 2026-03-05: Moved gameplay controls into map overlay (`自キャラ/スキルツリー/ログ/ユニット移動/作成人数ステッパー/ユニット作成/建設`) in `PhaserMapGeneratorPanel.vue`.
- 2026-03-05: Added clock-click turn action modal (`ターン経過` / `イベント管理`) and wired clock face as trigger.
- 2026-03-05: Added in-map `テスト` toggle button next to the clock; external map tools + dev info are now shown only when test mode is ON.
- 2026-03-05: Build revalidated after in-map UI/layout changes (`npm run build:front`).
- 2026-03-05: `PhaserMapGeneratorPanel` の `showTestControls` を親へ `test-controls-change` で通知するように変更。
- 2026-03-05: `App.vue` で `AppHeader` / `MenuPanel` をテストON時のみ表示に変更（通常時は `phaser-map-canvas` のみ表示）。
- 2026-03-05: マップ右下UIを調整し、テストON/OFFボタンを時計の左側へ移動。
- 2026-03-05: ユニット作成フローを変更。作成ボタン押下後に「作成数モーダル」で人数決定 -> 種族選択 -> クラス選択の順へ。
- 2026-03-05: 画面マス選択で常時表示される「選択マス詳細」オーバーレイを追加（町状態/土地状態/配置ユニットを表示）。
- 2026-03-05: 使わなくなった作成人数インラインUI（ヘッダーstepper/テストパネル内入力）を削除。
- 2026-03-05: 検証 `npm run build:front` 成功。
- 2026-03-05: `develop-web-game` Playwright client 実行を再試行したが、スキル側ランタイムで `playwright` モジュール解決に失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-05: 画面幅追従の不具合を修正。原因は `styles.css` の `.app { width: min(1000px, 100%) }` 固定幅。
- 2026-03-05: `App.vue` に `gameOnlyMode` を追加し、テストOFF時は `body.game-only-mode` + `.app.game-only` でフル幅/フル高さ表示へ切替。
- 2026-03-05: `phaser-map-panel` の外側余白・枠をゲーム専用モード時に解除し、`phaser-map-canvas` をビューポート幅に追従させるスタイルを追加。
- 2026-03-05: 検証 `npm run build:front` 成功。
- 2026-03-05: phaser-map-canvas を基準解像度 1280x720 の仮想ステージとして扱い、ResizeObserver で算出した倍率を 	ransform: scale(...) で適用する全体スケーリングを追加。\n- 2026-03-05: Phaser scale mode を FIT から NONE に変更し、ステージ側スケーリングを単一責務化。\n- 2026-03-05: 画面専用モード時は .phaser-stage-shell を 100vw x 100vh にして中央フィット表示。\n
- 2026-03-05: PhaserMapGeneratorPanel camera drift fix attempt: render now keeps current camera position on simple redraws (tile click etc.) unless zoom/focus request exists; only re-centers when needed.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: `develop-web-game` Playwright client could not run because `playwright` package is missing in this environment (`ERR_MODULE_NOT_FOUND`).- 2026-03-05: Input/zoom alignment fix: pointer world/view coordinates now resolved from `canvas.getBoundingClientRect()` + camera scroll/zoom instead of raw `pointer.worldX`/`pointer.x`.
- 2026-03-05: Stage centering adjusted (`phaser-stage-shell` uses grid center, anchor no longer absolute translate) to reduce left-top anchoring drift under scaling.
- 2026-03-05: Drag start threshold increased (7 -> 12) to reduce accidental camera pan on click.
- 2026-03-05: Validation passed: `npm run build:front`.- 2026-03-05: Additional pointer offset fix: world conversion now uses `camera.getWorldPoint()` after rect-based view conversion; pointer position cache added for `pointerup` cases where native event coords are missing.
- 2026-03-05: Validation passed: `npm run build:front`.- 2026-03-05: Added world-wrap toggle in Island Custom modal (`端を反対側へ接続する`) and propagated flag as `worldWrapEnabled` in map data.
- 2026-03-05: Hex-neighbor calculations in map panel now support wrap mode (movement, visibility, territory BFS, path checks use opposite-side adjacency when enabled).
- 2026-03-05: Wrap flag is preserved on turn advance and reflected in meta/stats text.
- 2026-03-05: Reinforced center-based display by fixing map panel size to viewport (`100vw x 100dvh`) and resetting camera center on wrap toggle.
- 2026-03-05: Validation passed: `npm run build:front`.- 2026-03-05: Reworked wrap rendering to be visually seamless: tile layer, river/lava overlays, village/unit markers, selection and hover are now drawn with 3x3 wrap offsets when world wrap is ON.
- 2026-03-05: Hit-test in wrap mode now normalizes pointer world coords into primary world before polygon lookup, avoiding wrong tile picks in wrapped views.
- 2026-03-05: Validation passed: `npm run build:front`.- 2026-03-05: Wrap rendering optimized to "single main map + outer ring" behavior: non-base wrap offsets now draw only boundary tiles/edges/markers/hover/selection instead of full-map duplication.
- 2026-03-05: Validation passed: `npm run build:front`.- 2026-03-05: Diagnosed zoom anomaly in `frontend/src/components/PhaserMapGeneratorPanel.vue`: wrap-mode zoom center uses raw focus-center delta without torus shortest-path normalization (`renderMapWithPhaser` around lines 3785-3788), causing apparent jump near map seams. Also confirmed `clampCameraScroll` wrapAxis remaps scroll into [-W..2W]/[-H..2H], which can look like forced teleport during zoom/drag transitions.
- 2026-03-05: Fixed zoom behavior in wrap mode by applying torus shortest-path focus deltas (`normalizeWrappedDelta` / `wrapValueNear`) and removed wrap-axis teleport remap from camera clamp (now bounded clamp only in extended 3x3 space). Build verified with `npm run build:front`.
- 2026-03-05: Simplified zoom flow per request: removed pointer/tile zoom-focus logic from wheel handling and removed pendingZoomFocus application in camera targeting. Zoom now only changes magnification around current camera center.
- 2026-03-05: Added DOM wheel fallback on Phaser canvas (`addEventListener("wheel", ... , {passive:false})`) and expanded zoom range to 20-400 with 25-step wheel increments to make zoom visibly change even if Phaser wheel input is unreliable in current layout.
- 2026-03-05: Adjusted zoom stability per user report: disabled camera scroll clamping when world-wrap is enabled (to avoid per-wheel position shifts), and set zoom lower bound to map-size baseline (min 100%, max 400%).
- 2026-03-05: Reworked map-camera baseline per user: wrap copies remain enabled at all zoom levels; min zoom is now dynamic from map size so viewport never exceeds map x1.20; drag clamp now uses center-based range and keeps camera around map center. Added `docs/map-screen-overview.md` as implementation spec.
- 2026-03-05: Extracted resource-bag pure helpers from PhaserMapGeneratorPanel into new composable rontend/src/composables/resourceEconomyUtils.js (empty/normalize/sum/add/multiply/format/split helpers).
- 2026-03-05: Updated PhaserMapGeneratorPanel.vue to import resource helpers via thin wrappers, keeping existing call sites unchanged.
- 2026-03-05: Validation passed: 
pm run build:front.
- 2026-03-05: develop-web-game Playwright client still blocked by missing playwright package in skill runtime (ERR_MODULE_NOT_FOUND).
- 2026-03-05: Extended `frontend/src/composables/resourceEconomyUtils.js` with economy demand helpers (`consumeFoodWithSubstitution`, `buildUnitUpkeepFoodDemand`, `buildPopulationFoodDemand`).
- 2026-03-05: Updated `PhaserMapGeneratorPanel.vue` to call new economy helpers through local wrappers; `processVillageEconomyTurn` behavior unchanged.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` package in skill runtime (`ERR_MODULE_NOT_FOUND`).
- 2026-03-05: Added `collectTerritoryIncome` and `applyVillageEconomyTurn` to `frontend/src/composables/resourceEconomyUtils.js` to separate economy-core calculations from component state wiring.
- 2026-03-05: Refactored `PhaserMapGeneratorPanel.vue` to call the new economy utilities; `processVillageEconomyTurn` now delegates territory income and turn application logic.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: `develop-web-game` Playwright client remains blocked by missing `playwright` package in skill runtime (`ERR_MODULE_NOT_FOUND`).
- 2026-03-05: Added `buildVillageEconomyTurnReport` to `frontend/src/composables/resourceEconomyUtils.js` to encapsulate economy turn log-line and summary text generation.
- 2026-03-05: Updated `processVillageEconomyTurn` in `PhaserMapGeneratorPanel.vue` to delegate report text building to the new utility.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: `develop-web-game` Playwright client retry still blocked by missing `playwright` package in skill runtime (`ERR_MODULE_NOT_FOUND`).
- 2026-03-05: Extended `frontend/src/composables/unitCoreUtils.js` with squad-domain helpers (`resolveDefaultSquadName`, `buildSquadSummaryList`, `stripRemovedUnitFromSquads`).
- 2026-03-05: Replaced corresponding local implementations in `PhaserMapGeneratorPanel.vue` with thin wrappers to `unitCoreUtils`.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: `develop-web-game` Playwright client retry still blocked by unresolved `playwright` package (`ERR_MODULE_NOT_FOUND`).
- 2026-03-05: Added `configureUnitSquadState` to `frontend/src/composables/unitCoreUtils.js` as pure squad-formation domain logic returning `{ ok, nextUnits, ... }`.
- 2026-03-05: Replaced component-local `configureUnitSquadState` implementation in `PhaserMapGeneratorPanel.vue` with utility delegation + state apply wrapper.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: `develop-web-game` Playwright client retry still blocked by missing `playwright` package (`ERR_MODULE_NOT_FOUND`).
- 2026-03-05: Added `renameLeaderSquad` and `dissolveLeaderSquad` to `frontend/src/composables/unitCoreUtils.js` (pure list-in/list-out squad operations).
- 2026-03-05: Replaced component-local `renameLeaderSquad`/`dissolveLeaderSquad` logic in `PhaserMapGeneratorPanel.vue` with utility delegation wrappers that apply `nextUnits`.
- 2026-03-05: Validation passed: `npm run build:front`.
- 2026-03-05: `develop-web-game` Playwright client retry still blocked by missing `playwright` package (`ERR_MODULE_NOT_FOUND`).
- 2026-03-06: Task4 索敵/遭遇判定を `PhaserMapGeneratorPanel.vue` に実装。プレイヤー側は部隊/ソロをグループ化し、敵側は同一マス敵群を1グループとして索敵/隠密を同式で計算するよう追加。
- 2026-03-06: 相互発見判定（player scout vs enemy stealth / enemy scout vs player stealth）を追加。敵に見つかった場合は襲撃判定を行い、ファンブル時は不意打ち扱いでログ出力。
- 2026-03-06: 戦闘遷移は未実装のまま、結果のみ `console.log("[EncounterCheck]")` と統治者ログへ出力する仕様で接続。
- 2026-03-06: 判定実行タイミングを「ターン経過時」と「ユニット移動成功時（移動先フォーカス）」に追加。
- 2026-03-06: Validation: `npm run build:front` pass。
- 2026-03-06: develop-web-game Playwright client 実行を再試行したが、スキルランタイムで `playwright` パッケージ未解決のため失敗（ERR_MODULE_NOT_FOUND）。
- 2026-03-06: 可視範囲ルールを更新。ユニット視界は `基本1マス + floor(索敵値/75)` に変更し、移動後/ターン更新時の可視更新に反映（従来の `unit.scoutRange` 直接半径指定は廃止）。
- 2026-03-06: ネームド補正を更新。ネームド（統治者除く）に全ステータス/技能 +15% を適用。昇格時に即時反映し、レベル再計算時も維持。索敵距離減衰は 1マスごと -50 に変更。
- 2026-03-06: 索敵成功した敵マスを可視化するため `spottedEnemyTileKeys` を追加。索敵成功時に敵タイルを記録し、マップ上に「敵」マーカーを表示する処理を `PhaserMapGeneratorPanel.vue` に実装。
- 2026-03-06: ログ表示ON/OFFを追加。ON時は画面右側に統治者ログを縦スクロールで常時表示する固定パネルを実装。Validation: `npm run build:front` pass。
- 2026-03-06: develop-web-game Playwright client を今回も試行したが、スキルランタイムで `playwright` が見つからず失敗（ERR_MODULE_NOT_FOUND）。
- 2026-03-06: 索敵ログ抑制を追加。既に発見済みの敵タイルは2回目以降 `runEnemyEncounterCheck` のログ出力対象から除外。Validation: `npm run build:front` pass。
- 2026-03-08: 経済スケールを追加。取得量(領土/建設)・消費量(ユニット維持/人口消費)・コスト(ユニット作成/建設)を 0.1 倍に統一。内部値は小数保持。
- 2026-03-08: 資源表示フォーマットを整数表示に変更（内部小数は維持し、表示時は小数を切り捨て）。Validation: `npm run build:front` pass。
- 2026-03-08: develop-web-game Playwright client は `playwright` 未導入のため失敗（ERR_MODULE_NOT_FOUND）。
- 2026-03-08: 初期資源を仕様変更。初期村配置時に「配置マスの収入値(現行経済倍率適用後) x3」を初期手持ち資源として設定。村未配置時の仮ストックは0に変更。Validation: `npm run build:front` pass。
- 2026-03-08: develop-web-game Playwright client を再試行したが、スキルランタイムで `playwright` が見つからず失敗（ERR_MODULE_NOT_FOUND）。
- 2026-03-08: 初期資源仕様を再修正。配置マス単体ではなく、初期領土(中心+周囲1)の合計収入を算出し、その値の x3 を初期手持ちに設定。Validation: `npm run build:front` pass。
- 2026-03-08: 食料カテゴリに「死体」「魂」を追加。種族別食事プロファイル生成でクラス.jsonの `死体/魂` 列を参照可能にし、全項目0時の穀物強制消費フォールバックを削除（0なら消費しない）。Validation: `npm run build:front` pass。
- 2026-03-08: 資源表示をアイコン化。ヘッダーの食料/資材内訳をテキストからアイコン+数値表示へ変更。
- 2026-03-08: 死体アイコンは `アンデット` 名を優先し、未登録時は `死者` へフォールバック。木材/石材/鉄も未登録時は既存アイコンへフォールバック。Validation: `npm run build:front` pass。
- 2026-03-08: develop-web-game Playwright client 再試行 -> `playwright` 未導入で失敗（ERR_MODULE_NOT_FOUND）。
- 2026-03-08: 資源アイコン表示を改善。表示値が0になる資源は非表示に変更し、ホバー時に資源名を表示（title属性）。Validation: `npm run build:front` pass。
- 2026-03-08: docs/equipment_material_tables.md / docs/city_system_design.md を実装反映。都市能力(鍛冶場/魔法/信仰/軍事/経済)を村データへ追加し、建設モーダルからLv1→Lv4まで資材で強化可能にした。
- 2026-03-08: 経済Lvを領土/建物収入倍率へ反映（Lv1=1.0, Lv2=1.15, Lv3=1.3, Lv4=1.5）。村情報/マス詳細に都市能力表示を追加。
- 2026-03-08: 装備変更に素材消費テーブルを接続。レアリティ→装備Lv(1-4)で木材/金属消費、魔法/信仰系装備は貴金属/宝石も追加消費。鍛冶場/魔法/信仰Lv不足時は装備変更をブロック。
- 2026-03-08: 互換のためルートにも quipment_material_tables.md / city_system_design.md を追加。Validation: 
pm run build:front pass。
- 2026-03-09: Added save-data groundwork: `PhaserMapGeneratorPanel` can emit on-demand map snapshot (`requestSaveSnapshot` command + `save-snapshot` event), and `App.vue` now builds SaveDTO draft (`buildSaveDataDraft`) plus debug helpers (`window.export_game_save_data`, `window.request_map_save_snapshot`).
- 2026-03-09: Fixed potential blank-screen runtime crash path in save snapshot conversion by hardening coordinate parsing (`buildBinaryMapFromCoordSet` now validates finite indices before writing).
- 2026-03-09: Disabled automatic snapshot emission on every `applyMapData` update; snapshot generation is now on-demand to avoid expensive/fragile startup-time conversion.
- 2026-03-09: Validation passed after fixes: `npm run build:front`.- 2026-03-09: Added top-right settings icon action in map HUD using existing icon asset (`設定.webp`) via icon library (`QUICK_SETTINGS_ICON_SRC`).
- 2026-03-09: Added quick settings modal in Phaser map panel with shortcuts: `音量/表示設定` (opens existing settings modal) and `セーブデータ保存` (downloads JSON using `window.export_game_save_data`).
- 2026-03-09: Added save export UX guards (`saveExportInProgress`) and success/failure feedback to unit info + nation log. Validation passed: `npm run build:front`.- 2026-03-09: Added test-only multi-faction slots in `PhaserMapGeneratorPanel.vue` (switch active player, add/remove faction, per-player ready state).
- 2026-03-09: Turn progression now uses ready-check in test multi-player mode; terrain turn advances only after all factions press turn end.
- 2026-03-09: Added save snapshot multiplayer payload (`map.multiplayer`) and quick settings load action (JSON file input).
- 2026-03-09: Added `window.import_game_save_data(jsonText)` in `App.vue`; imports save JSON and dispatches `loadSaveState` command to Phaser map.
- 2026-03-09: Added map-side load handler `loadSaveState` to restore map/river/lava/enemy data and faction runtime snapshots.
- 2026-03-09: Validation: `npm run build:front` passed.
- 2026-03-09: Playwright client check blocked (`ERR_MODULE_NOT_FOUND: playwright` in skill-local client environment).
- 2026-03-10: Fixed runtime error on faction add (
ormalizeEquipmentRarity is not defined) by restoring compatibility alias to 
ormalizeEquipmentRarityKey in PhaserMapGeneratorPanel. Validation: 
pm run build:front passed.

- 2026-03-10: Added game-start setup modal in App (player count + other faction count, default 1+3=4 factions, max 8).
- 2026-03-10: Added per-faction setup queue in App; existing flow (race -> class -> name -> village -> mob) now repeats for each configured faction sequentially.
- 2026-03-10: Added map commands initTestPlayerSlots and switchActiveTestPlayer in Phaser panel and raised test faction cap to 8.
- 2026-03-10: Adjusted sovereign creation path to preserve multi-faction slot state instead of collapsing back to single slot during sequential setup.
- 2026-03-10: Validation passed: 
pm run build:front.
- 2026-03-10: Added game-start placement options in App.vue (ランダム配置 default ON + プレイヤー配置方式: 全勢力ランダム / プレイヤーのみランダム / プレイヤー手動)。
- 2026-03-10: Changed game-start flow to configure sovereign profile per faction first, then trigger inalizeGameStartSetup for map generation and initial placement.
- 2026-03-10: Added command handlers in PhaserMapGeneratorPanel.vue: pplySovereignProfile and inalizeGameStartSetup.
- 2026-03-10: Reworked multi-faction start to allow slot initialization before map generation (initTestPlayerSlots no longer requires pre-generated map).
- 2026-03-10: Implemented faction-aware start placement planner:
  - reads terrain/height preference from data/source/export/json/勢力.json (土地, 高さ)
  - maps aliases (丘→丘陵, 山→山岳, 沼→沼地, 渓谷→峡谷, etc.)
  - chooses village tiles with suitability scoring (terrain/special/height) and map-size-dependent minimum distance target
  - retries terrain generation multiple times and picks best plan before applying
- 2026-03-10: Added placement strategies by mode:
  - ll_random: all factions random
  - player_random_only: player factions random, non-player factions auto (deterministic suitability-priority)
  - player_choose: player factions manual placement, others random
- 2026-03-10: Test ON now reveals entire map by forcing fog disable (shouldDisableFog checks showTestControls).
- 2026-03-10: Persisted isPlayer in multiplayer slot snapshots for save/load compatibility.
- 2026-03-10: Validation passed: 
pm run build:front.
- 2026-03-10: develop-web-game Playwright client check still blocked in this environment (ERR_MODULE_NOT_FOUND: playwright from skill runtime path).- 2026-03-10: Fixed game-start command race/overwrite by adding atch character command support and switching multi-step setup commands in App.vue to batch dispatch (pplySovereignProfile + switch / pplySovereignProfile + finalize).
- 2026-03-10: Prevented initial setup state corruption from props.gameSetupReady watcher by guarding fallback createVillageAndInitialUnit path when unit/village state already exists.
- 2026-03-10: Added in-header setup progress label (勢力作成中) so current target faction is visible during setup.
- 2026-03-10: Validation passed after fixes: 
pm run build:front.- 2026-03-10: Added setup progress subtitle support in BaseModal and passed current faction progress (gameSetupProgressText) to race/class/name modals.
- 2026-03-10: Added ClassSelectModal back action (種族へ戻る) and wired @back in App.vue to reopen race modal.
- 2026-03-10: Removed in-map header setup progress chip (moved progress display to modal headers as requested).
- 2026-03-10: Fixed manual village placement sequence for multiple player factions: after placing one player village, auto-switches to next unplaced player and keeps placement mode active until all player villages are placed.
- 2026-03-10: Validation passed after modal/placement-flow fixes: 
pm run build:front.- 2026-03-10: Fixed fog-of-war toggle regression: when test mode is turned OFF, visibility is now recomputed and the map is re-rendered so unexplored tiles return to gray.
- 2026-03-10: Added cross-faction detection support using scout/stealth contest against other factions' unit groups (in addition to monster encounter checks).
- 2026-03-10: Added persistent visibility key `spottedFactionTileKeys` to live state, per-faction snapshots, and save/load snapshots.
- 2026-03-10: Added map markers for discovered opposing-faction presence (`勢`) and extended tile detail enemy section to include spotted opposing faction units.
- 2026-03-10: Validation passed: `npm run build:front`.
- 2026-03-10: `develop-web-game` Playwright client remains blocked in this environment (`ERR_MODULE_NOT_FOUND: playwright` from skill runtime script).
- 2026-03-10: Added faction-specific territory border coloring (15-color palette, sequential assignment by slot order, wraps after 15).
- 2026-03-10: Territory border width increased for readability (default/player/enemy and faction borders tuned thicker).
- 2026-03-10: Added `territoryOwnerByTile` map so border rendering can resolve concrete owner faction IDs in multiplayer.
- 2026-03-10: Tile detail owner label now shows faction label in multiplayer (e.g. プレイヤー2領 / 別勢力1領).
- 2026-03-10: Validation passed: `npm run build:front`.
- 2026-03-10: Unit icon fallback behavior updated: when no valid icon image exists, UI now shows a one-character glyph instead of default icon image (CharacterStatusModal + CharacterUnitDetailPanel).
- 2026-03-10: Added fallback icon badge styles for character list, squad member chips, and unit detail icon preview.
- 2026-03-10: Validation passed: `npm run build:front`.
- 2026-03-10: Added race-icon display to move-unit selection modal (PhaserMapGeneratorPanel). The unit card now prefers race-side icon from class/race data and falls back to one-character glyph when image is missing.
- 2026-03-10: Validation passed: `npm run build:front` (after move-unit icon update).
- 2026-03-10: Icon alias resolution added in PhaserMapGeneratorPanel (`画像ID` missing file fallback), e.g. `只人 -> 人間`, `ヒューマン -> 人間`, `ドラゴニュート -> 竜人`, `デヴィル -> 悪魔`, `エンジェル -> 天使`.
- 2026-03-10: Validation passed: `npm run build:front` (after icon alias update).
- 2026-03-10: Removed temporary icon alias resolution per request (no `只人->人間` etc automatic mapping). Icon resolution is now strict by icon filename again.
- 2026-03-10: Added race icon rendering on map tiles (unit marker inside hex now shows race icon image when available; falls back to race glyph if icon texture is unavailable/not found).
- 2026-03-10: Validation passed: `npm run build:front` (after strict icon + map marker image update).
- 2026-03-10: Investigated icon non-display root cause: map marker previously rendered race glyph text by design, not image sprite.
- 2026-03-10: Verified class-image ID consistency against icon assets. Current class image IDs count: 17, missing IDs: 0 (`只人.webp` now exists).
- 2026-03-10: Added enemy marker icon rendering on map tiles (uses first spotted enemy class/race icon; falls back to "敵" text if icon unavailable).
- 2026-03-10: Validation passed: `npm run build:front` (after enemy marker icon update).
- 2026-03-10: Refactored marker sizing into constants in PhaserMapGeneratorPanel (`MAP_UNIT_MARKER_CONFIG`, `MAP_ENEMY_MARKER_CONFIG`, `MAP_FACTION_MARKER_CONFIG`) so icon/radius/offset can be tuned from one place.
- 2026-03-10: Validation passed: `npm run build:front` (after marker-size constants refactor).

- 2026-03-11: Added icon-based map markers for sovereigns and special tiles in frontend/src/components/PhaserMapGeneratorPanel.vue (王冠 for 統治者, 滝 icon overlay, 洞窟/峡谷 special icons with 渓谷 fallback).
- 2026-03-11: Validation passed after icon rendering update: npm run build:front.
- 2026-03-11: develop-web-game Playwright check blocked in this environment (playwright package missing).
- 2026-03-11: Refactored sovereign/special/waterfall marker sizes into commented config fields (icon size, offsets, fallback text size) in PhaserMapGeneratorPanel.vue.
- 2026-03-11: Added right-side own-faction navigator panel in PhaserMapGeneratorPanel (squad list + character list). Clicking an entry now focuses camera and selects corresponding unit/tile.
- 2026-03-11: Updated wheel zoom behavior to prioritize camera focus on player village when village is placed; falls back to world-center when village is not placed.
- 2026-03-11: Refactored own-faction navigator from in-canvas right panel to dedicated modal component (OwnFactionNavigatorModal.vue); removed related inline template/CSS from PhaserMapGeneratorPanel and wired focus events via modal.
- 2026-03-12: 自陣営一覧をモーダルから右固定パネルへ変更（常時表示）。ヘッダークリックで最小化、ヘッダー内タブで「キャラ/部隊」切替を追加。
- 2026-03-12: キャラ行に種族アイコン・HPゲージ・所属部隊表示を追加。選択で座標へフォーカスし、右パネル下部に詳細ステータス表示を追加。
- 2026-03-12: 右パネルから「詳細」押下で自キャラ詳細モーダルを開けるように連携（対象ユニットを選択状態に設定）。
- 2026-03-12: ナビゲータ用データに HP/所属部隊/基礎ステータスを追加（frontend/src/lib/own-faction-navigator.js）。
- 2026-03-12: Validation passed: npm run build:front.
- 2026-03-12: 自陣営一覧パネルでキャラ/部隊タブ切替時に消える問題へ対処。ヘッダー最小化クリックに対してタブ領域のクリック伝播を停止（OwnFactionNavigatorModal.vue）。
- 2026-03-12: プレイヤー切替時の状態取りこぼし対策として `:reset-key="activeTestPlayerId"` を right panel component に渡し、タブ/最小化/選択状態を初期化。
- 2026-03-12: Validation passed: npm run build:front.
- 2026-03-12: develop-web-game Playwright check is still blocked here (ERR_MODULE_NOT_FOUND: playwright in skill runtime).
- 2026-03-12: 全体スクロールバーを細めのファンタジー調へ統一。`frontend/src/styles.css` に共通変数と WebKit/Firefox のスクロールバー共通スタイルを追加。
- 2026-03-12: Validation passed: npm run build:front (scrollbar theme update).
- 2026-03-13: modal-card-wide を 1040px 基準へ調整し、ワイドモーダルの視認性を改善。
- 2026-03-13: CharacterStatusModal の watch 条件を修正し、ユニット更新時にタブが強制で character に戻る問題を解消。
- 2026-03-13: アイコン変更を subIcon 用途へ変更。updateIcon コマンドは subIconName/subIconSrc を更新し、メイン iconName/iconSrc は維持。
- 2026-03-13: CharacterStatusModal と CharacterUnitDetailPanel にサブアイコン背景（ウォーターマーク）を追加。UI文言を サブアイコン に統一。
- 2026-03-13: 検証: npm run build:front は成功。Playwright クライアントは playwright 依存未解決で実行不可（ERR_MODULE_NOT_FOUND）。
- 2026-03-14: Updated own-faction icon policy. Map unit marker now prefers `squadIconName` when available (fallback race icon).
- 2026-03-14: Updated own-faction navigator entries so `.own-faction-icon` stays race-fixed and `subIconSrc` is provided separately for row background rendering.
- 2026-03-14: Updated `OwnFactionNavigatorModal.vue` rows to render sub/squad icon as a subtle background overlay while keeping icon frame race-based.
- 2026-03-14: Validation passed: `npm run build:front`.
- 2026-03-14: CharacterStatusModal squad tab updated to grouped tree-style list on the left (squad row expands member rows). Selecting a member in the left group now directly sets the active squad member detail.
- 2026-03-14: CharacterStatusModal squad tab cleaned up: removed duplicate right-side member list and kept only selected member detail panel. Left grouped squad/member list remains the single selector source.
- 2026-03-14: CharacterUnitDetailPanel redesigned to 2-column detail layout: right side fixed skill list, left side switchable tabs for status/equipment. Added responsive fallback to single-column under 980px.
- 2026-03-14: Modal scaling sync added. `stageScale` now updates global CSS var `--game-modal-scale` (clamped 0.5-1.0), and BaseModal/GenericModal/settings modal/game-start modal all read this var via `transform: scale(...)`.
- 2026-03-14: Removed JS stage fit scaling path from Phaser map panel (updateStageScale, ResizeObserver, stageScale watch, modal-scale sync) to eliminate double-scaling drift.
- 2026-03-14: `phaser-stage` now uses fixed logical size style only (no CSS transform scale from Vue), leaving zoom control to Phaser camera path.
- 2026-03-14: Kept wrapper classes (`game-only-mode` / `.app.game-only` / `.phaser-map-panel` / `.phaser-stage-shell`) as layout-only containers; no transform/zoom applied on these wrappers.
- 2026-03-14: Validation: `npm run build:front` passed.
- 2026-03-14: Removed body `game-only-mode` class toggle and related CSS block; keep only `.app.game-only` for game-only layout state.
- 2026-03-14: Removed `.phaser-stage-shell` wrapper from map template. `phaser-stage` is now the direct gameplay container inside `phaser-map-panel`.
- 2026-03-14: Implemented viewport-fit sizing on `.phaser-stage` via CSS (`min(100vw, 100dvh*16/9)` and paired height rule). Map canvas now fills stage with `width/height: 100%`.
- 2026-03-14: Removed inline stage style binding (`stageScaleStyle`) so no JS/CSS double-scaling path remains.
- 2026-03-14: Reintroduced single viewport-fit scale on `phaser-stage` (fixed logical 1280x720 + transform scale from host size).
- 2026-03-14: Synced modal/global UI scale by updating `--game-modal-scale` from the same stage scale value (`updateStageViewportScale`).
- 2026-03-14: Added `ResizeObserver` on stage host + resize handler to keep stage/header/modal scaling in sync.
- 2026-03-14: Reverted per-user request: removed `phaser-stage` local scaling path again and stopped mutating `--game-modal-scale` from map panel.
- 2026-03-14: `phaser-stage` now relies on external/global scaling only; internal map panel no longer applies an additional scale layer.
- 2026-03-14: Restored scaling by moving to single global root scale on `App` (`.app.game-only`) based on viewport vs 1280x720.
- 2026-03-14: `phaser-map-panel` switched to `width/height: 100%` to follow root-scaled container; removed dependency on viewport units for panel sizing.
- 2026-03-14: Keeps `phaser-stage` unscaled locally to avoid double scaling.
- 2026-03-19: 研究ツリーを `都市研究と施設ルールまとめ.md` 準拠で5系統（鍛冶Lv/魔法Lv/信仰Lv/軍事Lv/経済Lv）に更新。別ファイル `frontend/src/lib/research-tree-config.js` を新設し、カテゴリ順・Lv要件・時間短縮技能・既定分岐データを集約。
- 2026-03-19: `SkillTreeModal.vue` を研究ツリー表示に差し替え。カテゴリ正規化・未登録カテゴリ警告・研究必要ユニットLv/時間短縮技能の詳細表示に対応。
- 2026-03-19: 研究ツリー呼び出しカテゴリを `App.vue` と `PhaserMapGeneratorPanel.vue` で5系統へ統一。
- 2026-03-19: 検証 `npm run build:front` 成功。- 2026-03-19: develop-web-game Playwright クライアント再実行。スキル実行環境で playwright が解決できず ERR_MODULE_NOT_FOUND（web_game_playwright_client.js）で失敗。
- 2026-03-19: 研究ツリー仕様を一本ルートへ変更。`research-tree-config.js` でカテゴリごとに分岐を単一路へ正規化（同Tier分岐は `A / B` 形式で統合）。
- 2026-03-19: `SkillTreeModal.vue` の文言/表示を一本ルート前提へ更新（分岐表現を段階表現へ変更、列レイアウトを自動幅に調整）。
- 2026-03-19: 検証 `npm run build:front` 成功。- 2026-03-19: 研究ツリー一本化後に develop-web-game Playwright クライアント再実行。playwright 未解決（ERR_MODULE_NOT_FOUND）のため実行不可。
- 2026-03-19: 軍事ユニット仕様を追加。`frontend/src/composables/militaryUnitUtils.js` を新設し、ユニット作成モード（個体/軍隊/強化軍隊）・軍事Lv解放・人口消費・HP倍率・攻撃回数を定義。
- 2026-03-19: `PhaserMapGeneratorPanel.vue` のユニット作成モーダルに種別切替を追加し、作成時に軍事Lvに応じたモード適用（軍事Lv2: 人口4/HPx2.5/攻撃4回、軍事Lv3: 人口5/HPx3/攻撃5回）。人口不足時エラー表示とログ出力を追加。
- 2026-03-19: `createUnitRecord` / 再ビルド処理で `combatProfile` を保持し、HP倍率を継続反映するよう更新。
- 2026-03-19: `CharacterUnitDetailPanel.vue` に軍事ユニット補正表示（HP倍率/攻撃回数/人口消費/単純行動）を追加。
- 2026-03-19: `toUnitRoleLabel` を更新し、モブ以外の `unitType`（軍隊/精鋭軍隊）を表示可能に。
- 2026-03-19: 検証 `npm run build:front` 成功。- 2026-03-19: 軍事ユニット実装後に develop-web-game Playwright クライアント実行を再試行。playwright 未解決 (ERR_MODULE_NOT_FOUND) のため失敗。
- 2026-03-20: 研究UIを `研究.json` 直接参照に変更。`frontend/src/lib/research-tree-config.js` を再構築し、行データ（項目名/技術対象/Lv/詳細）からカテゴリ・Lv・候補を生成するように更新。デフォルトツリー依存を廃止。
- 2026-03-20: `SkillTreeModal.vue` を研究専用UIへ刷新。カテゴリ切替 + Lvタブ + 候補一覧 + 右側詳細表示 + 「Lvごとに1つ選択」ローカル選択状態を実装。
- 2026-03-20: 残っていた表記を `スキルツリー` -> `研究` に統一（`AppHeader.vue`, `MenuPanel.vue`, `PhaserMapGeneratorPanel.vue`）。
- 2026-03-20: 検証 `npm run build:front` 成功。
- 2026-03-20: `develop-web-game` Playwright クライアント実行を再試行。`playwright` 未解決（ERR_MODULE_NOT_FOUND）のため失敗。- 2026-03-20: 研究モーダル (`SkillTreeModal.vue`) を表形式へ改修。Lvヘッダーを横並び（1行目）にし、候補を縦3行ベースで表示するグリッドUIへ変更。
- 2026-03-20: 研究カテゴリ（鍛冶/魔法/信仰/軍事/経済）タブにアイコン表示を追加。`icon-library` 経由でフォルダ内アイコンを解決。
- 2026-03-20: 研究モーダルから「選択状況」サマリー枠を削除。選択済みはセル枠色で判別する仕様に統一。
- 2026-03-20: `npm run build:front` 実行成功。
- 2026-03-20: develop-web-game Playwrightクライアント実行を再試行したが、スキル実行環境で `playwright` 未解決のため失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-20: モーダルのスケーリング適用ルールを共通化。`styles.css` に `--ui-effective-modal-scale` を追加し、`modal-backdrop / generic-modal-backdrop / settings-backdrop / game-start-backdrop` 配下のモーダル本体へ一律適用する方式へ変更。
- 2026-03-20: `styles.css` の `.app.game-only ... !important` 上書きスケールを削除。モーダルごとの差異で縮尺が崩れる経路を解消。
- 2026-03-20: `GenericModal.vue` / `App.vue(game-start-modal)` / `PhaserMapGeneratorPanel.css(settings-modal)` の個別 transform 指定を削除し、共通ルールに一本化。
- 2026-03-20: 検証 `npm run build:front` 成功。
- 2026-03-20: develop-web-game Playwrightクライアント再試行。スキル実行環境で `playwright` 未解決（ERR_MODULE_NOT_FOUND）のため実行不可。
- 2026-03-20: モーダルUI固定化。`calc(100% - 24px)` 系指定を廃止し、`styles.css` でモーダル幅/高さを固定変数（normal/wide）で統一。内容量に依存せずサイズが変わらないように変更。
- 2026-03-20: `modal-body` を共通スクロール領域にし、モーダル外形は固定・内容だけスクロールする構成へ変更。
- 2026-03-20: モーダル内文字の下限サイズを `--modal-min-text-size: 15px` として反映（small系含む）。
- 2026-03-20: `GenericModal.vue` / `App.vue(game-start-modal)` / `PhaserMapGeneratorPanel.css(settings-modal)` / `CharacterStatusModal.vue` を固定サイズ + 共通スケール前提へ調整。
- 2026-03-20: 検証 `npm run build:front` 成功。
- 2026-03-20: 文字倍率の対象を全体ではなく研究モーダル限定へ修正。`SkillTreeModal.vue` に `--research-text-scale` を追加し、主要テキストサイズへ倍率を適用。
- 2026-03-20: 直前に追加した全体文字倍率（`styles.css` の `--ui-manual-text-scale` / `html font-size` と `UI_MANUAL_SCALE_CONFIG.text`）は撤回して削除。
- 2026-03-20: 検証 `npm run build:front` 成功。
- 2026-03-20: モーダル縮尺異常の原因を修正。`app.game-only` のスケーリングに加えてモーダル側でも `--game-modal-scale` を掛けていたため二重拡縮になっていた。
- 2026-03-20: `styles.css` の `--ui-effective-modal-scale` を `--ui-manual-modal-scale` のみへ変更し、モーダル倍率を単一経路化。
- 2026-03-20: `App.vue` の `--game-modal-scale` set/remove 処理を削除。`panel modal-card modal-card-wide` を含む全モーダルで縮小時の比率崩れを抑制。
- 2026-03-20: 検証 `npm run build:front` 成功。
- 2026-03-20: 研究モーダルにカテゴリ別研究進行を追加。上タブに現在Lv表示、カテゴリ別EXP蓄積/消費でLvアップ（必要EXP=100*2^(現在Lv-1)）を実装。
- 2026-03-20: 研究候補の解放条件を「そのカテゴリの現在研究Lv以下」に変更。
- 2026-03-20: 研究モーダルにEXP表示・Lvアップ操作を追加（テスト用EXP+100ボタン含む）。
- 2026-03-20: 検証 `npm run build:front` 成功。
- 2026-03-20: 研究モーダルにカテゴリ別進行（Lv/EXP）を導入済み構成を App 側状態へ接続。`researchProgress` と `researchSelection` を `App.vue` で保持し、`SkillTreeModal` の `update:*` イベントで同期するように変更。
- 2026-03-20: セーブ/ロードに研究データを追加。`systems.research.progress` と `systems.research.selection` をエクスポートし、ロード時に復元するように更新。
- 2026-03-20: `render_game_to_text` 出力へ研究進行情報（カテゴリ配列と進行Map）を追加。
- 2026-03-20: 検証 `npm run build:front` 成功。`develop-web-game` Playwright クライアントは依存 `playwright` 未解決で実行失敗（ERR_MODULE_NOT_FOUND）。- 2026-03-20: 研究進行をカテゴリLv管理から「研究対象ごとのEXP管理」へ変更。`targetExpMap`（対象別EXP）, `completedByCategoryLevel`（完了研究）, `carryByCategory`（繰越EXP）を導入。
- 2026-03-20: 研究完了時に超過EXPをカテゴリ繰越として保持し、次の研究対象を選択したタイミングで繰越EXPを適用する仕様を実装。
- 2026-03-20: 研究モーダルのヘッダーに手動テスト用 `+50 / -50` ボタンを追加。研究対象に設定済みかつ未完了の対象のみ増減できるよう制限。
- 2026-03-20: セーブ/ロード側の `systems.research` 正規化を新構造（targetExpMap/completedByCategoryLevel/carryByCategory）に更新。
- 2026-03-20: 検証 `npm run build:front` 成功。Playwright クライアントは `playwright` 依存不足で実行失敗（ERR_MODULE_NOT_FOUND）。- 2026-03-20: 研究仕様を更新。Lvごとに複数研究を完了できるように変更（同時進行は選択中の1件のみ）。完了データ `completedByCategoryLevel` は `level -> [researchId...]` の配列管理へ変更。
- 2026-03-20: 研究項目セルに個別EXPゲージを追加。`currentExp/requiredExp` を項目名下に表示し、進捗が視覚的に分かるように調整。
- 2026-03-20: 保存データ正規化を新形式に対応（旧: 文字列1件完了、 新: 配列複数完了）。- 2026-03-20: `Lv内複数研究` 対応。研究完了判定をレベル単位1件から項目単位に変更し、完了済みは `completedByCategoryLevel[category][level] = [id...]` で保持。
- 2026-03-20: Playwright クライアント再実行は依存 `playwright` 不足で失敗（ERR_MODULE_NOT_FOUND）。- 2026-03-20: 研究モーダルUI調整。`対象EXP/繰越EXP/+50/-50` を `research-pane-head` へ移動し、研究項目セル内の `0/100` 数値表示を削除（ゲージのみ表示）。
- 2026-03-20: 研究モーダルの文字コントラスト改善（ヘッダー、非アクティブセル、詳細文、補助テキスト、ロック状態の可視性を調整）。- 2026-03-20: `SkillTreeModal.vue` の `research-pane-head` を簡素化（進行Lv表示削除）し、`research-head-controls` を横並び固定に調整。`npm run build:front` 成功。
- 2026-03-20: 装備機能を在庫管理化。`village.equipmentInventory` を追加し、装備変更時は在庫消費/旧装備返却に対応。`craftEquipmentItem` コマンドを追加し、装備作成を在庫追加方式へ変更。作成コストは `消費量.json(種別=装備, Lv)` と `装備.json` の `鉱石/木材` 比率で算出するよう更新（魔法/信仰付与コストは現時点で未適用）。CharacterUnitDetailPanel に小型アイテム一覧（レア度・数）と詳細表示、選択スロット装備UIを追加。`npm run build:front` 成功。
- 2026-03-20: 自キャラステータスモーダル上部に「装備在庫」バーを追加。`village.equipmentInventory` を集約表示（装備名/レア度/個数）。在庫0件時は「在庫なし」表示。`npm run build:front` 成功。
- 2026-03-20: 武器生成の無反応対策を追加。`EquipmentInventoryModal.vue` の生成ハンドラprop名を `onCraftWeapon` から `craftWeaponHandler` に変更し、`on*` イベント名衝突を回避。
- 2026-03-20: 武器生成ボタン押下時の失敗理由表示を強化。生成不可理由（武器未選択/鍛冶Lv不足/武器データなし）を明示し、ハンドラ例外時もモーダル内にエラー文言を表示。
- 2026-03-20: `submitWeaponCraft` で Promise戻り値にも対応し、完了/失敗のステータス表示を追加。
- 2026-03-20: 検証: `npm run build:front` 成功。
- 2026-03-20: `develop-web-game` Playwrightクライアント実行は環境側 `playwright` 未導入で失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-20: キャラ装備変更UIを改善。`CharacterUnitDetailPanel.vue` で選択スロットに適合する在庫のみ表示するようにし、在庫装備/装備変更/在庫作成の実行ステータス文言を追加。
- 2026-03-20: キャラ装備変更導線を「道具一覧モーダル」経由に統一。`CharacterUnitDetailPanel.vue` から在庫リストを外し、`EquipmentInventoryModal.vue` の pickerMode + filterSlotKey で選択して装備反映する方式へ変更。
- 2026-03-20: キャラ装備UIを再整理。スロット行の `在庫へ作成` を削除し、装備モーダル起動を装備ヘッダーの単一ボタンへ統一。あわせて `craft-equipment-item` のイベント配線（CharacterUnitDetailPanel/CharacterStatusModal/App）を削除。
- 2026-03-20: キャラ装備欄のプルダウン（種類リスト）を撤去。スロット行は情報表示＋「このスロットを変更」ボタンのみ、実際の装備選択は道具一覧モーダルに一本化。

## 2026-03-20 22:18:59 防具生成対応
- 道具一覧モーダルの生成タブに 種別(武器/防具) を追加。防具を選んで生成可能に変更。
- 防具生成時は 装備.json の 耐性 と 消費量.json(防具_物理/防具_魔法) を参照して 物理耐性/魔法耐性 を算出。
- レア度3/4/5で魔法耐性に追加補正(物理耐性の15%/30%/50%)を適用。
- 生成ハンドラは武器/防具の両方を受け付けるように変更。
- 装備表示に 物/魔耐 を追加（値がある場合のみ）。

## 2026-03-20 22:40:21 UI最小フォント15px対応
- App.vue に最低フォント補正処理を追加。ゲーム画面/各モーダル配下で computed font-size が15px未満の要素へ 15px を自動適用。
- MutationObserver + resize + gameOnlyMode監視で再適用。
- styles.css に --ui-min-font-size を追加し .small を最低15pxへ。
- game-start modal 内の 0.88rem/0.86rem/0.84rem も max(15px, ...) 化。
- 2026-03-21: ユニット種別ルールを更新。通常ユニットを`ヒーローユニット`へ統一、軍隊ユニットの解放Lvを`軍事Lv1`へ変更（強化軍隊はLv3維持）。
- 2026-03-21: `勢力.json`参照の上限へ移行。軍隊上限=`軍隊`列（0<x<1は人口倍率、1以上は固定値）、ヒーロー上限=`ヒーロー`列（未設定時は人口/10フォールバック）+都市段階補正(+1/段階)を実装。
- 2026-03-21: ユニット作成モーダルを上限分離に対応。`ヒーロー`/`軍隊`の現在数・上限・残数を表示し、選択種別ごとの上限到達時は作成不可に変更。
- 2026-03-21: ターン処理にヒーロー自動増加を追加。確率=基礎1% + 軍隊Lv10補正20% + 居住化追加数*10% + 都市段階*50%。100%超過は確定生成+余剰確率ロールで処理。
- 2026-03-21: 文言整理。画面表示上の`モブ`表記を`ヒーロー`へ置換（作成導線・削除導線・進行ステータス含む）。
- 2026-03-21: 検証: `npm run build:front` 成功。
- 2026-03-21: `develop-web-game` Playwrightクライアント実行を再試行したが、スキル実行環境で `playwright` パッケージ未解決のため失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-21: ヒーロー自動増加ロジックをターン処理へ組み込み後、`npm run build:front` を再実行して成功。
- 2026-03-21: Playwrightクライアント再試行（2回目）も `ERR_MODULE_NOT_FOUND: playwright` で実行不可を確認。
- 2026-03-21: ヒーロー自動増加を仕様変更。自動ユニット追加ではなく「英雄が誕生しました。」通知で `heroBirthUnlock` を増やし、ヒーロー作成枠を解放する方式へ移行。
- 2026-03-21: ヒーロー作成時は解放枠を消費するよう変更。作成モーダルに「解放」表示を追加し、未解放時はヒーロー作成不可（誕生待ち）表示に変更。
- 2026-03-21: 検証: 上記変更後に `npm run build:front` 成功。
- 2026-03-21: Playwrightクライアント再試行（誕生解放仕様変更後）も `ERR_MODULE_NOT_FOUND: playwright` のため実行不可。
- 2026-03-22: 都市ステータス計算を更新。総人口チップ展開に「生産力/徴兵率/人口保有率/保有可能人数/治安/幸福度/環境安定度/浮浪者率」を表示し、指定式（人口保有率・浮浪者率・生産力）を実装。SIZ補正（SIZ170=1人分）で保有可能人数を算出し、軍事ユニットは populationCost を人数換算として徴兵率に反映。
- 2026-03-22: 検証: `npm run build:front` 成功。
- 2026-03-22: `develop-web-game` Playwright クライアント再実行は `ERR_MODULE_NOT_FOUND: playwright` で実行不可。
- 2026-03-22: 住居区分システムを追加。土地/村/町/都市/大都市の定義（収容人数・使用マス・アイコンサイズ）を `phaser-map-panel-config.js` に追加。
- 2026-03-22: 保有可能人数計算を住居区分ベースへ変更。`resolveVillagePopulationCapacityByTerritory` が住居区分設定を検出した場合、各タイルの `収容人数 x 使用マス` 合計で収容上限を算出。
- 2026-03-22: 領土タイル詳細に「領土運用」「住居区分」を表示。
- 2026-03-22: タイル行動に「住居拡張」を追加。条件は居住化タイル + 隣接する自陣営住居マス。テストON時は条件を無視して拡張可能。
- 2026-03-22: 住居拡張時に `territoryResidentialLevelMap` を更新し、収容上限を即時再計算。
- 2026-03-22: マップ描画の居住化アイコンを住居区分連動に変更（村/町/都市/大都市でサイズも変更）。
- 2026-03-22: 検証: `npm run build:front` 成功。
- 2026-03-22: `develop-web-game` Playwrightクライアント再実行は `ERR_MODULE_NOT_FOUND: playwright` で実行不可。

## 2026-03-22 住居クラスター実装
- 住居拡張を「中心マス + 付属領域」モデルへ変更。
- 住居区分マップに加えて `territoryResidentialCenterMap` を導入し、中心/付属の紐づけを保持。
- 町(2マス)/都市(3マス)は住居拡張ボタン後に隣接候補をマップクリックで選択して確定。
- 大都市(7マス)は中心周囲6マスを自動割当で拡張。
- 付属領域は単体機能を持たないようにし、描画マーカーも中心のみ表示。
- 選択マス詳細の住居区分表示を中心/付属の情報付きに調整。
- マップ再生成・村配置・移動モード切替時に住居拡張選択状態を自動クリアするように修正。
- build確認: `npm run build:front` 成功。
- Playwright確認: `web_game_playwright_client.js` 実行時に `playwright` パッケージ未導入で `ERR_MODULE_NOT_FOUND`。

## 2026-03-22 住居クラスター改修(別ファイル化)
- 住居クラスター処理を `frontend/src/composables/territoryResidentialClusterUtils.js` へ分離。
- `PhaserMapGeneratorPanel.vue` の住居関連ロジックは新ユーティリティ呼び出しへ置換。
- 住居拡張は町/都市/大都市すべて「複数マス選択モード」で確定する方式へ統一。
- 選択中はカーソルを `crosshair` に変更し、`選択解除` ボタンを追加。
- 住居表示を中心だけでなく付属領域にも描画（付属は縮小＋半透明）して範囲が見えるように調整。
- build確認: `npm run build:front` 成功。
- 住居クラスターを「付属マスも中心と同レベル扱い」に変更。
- 容量計算をクラスター対応へ修正（町=50x2=100 / 都市=100x3=300 / 大都市=150x7=1050）。
- 住居画像を付属マスにも同種で描画するように調整。
- 2026-03-22: 住居拡張を即時反映から「建築キュー方式」に変更。`territoryResidentialUpgradeQueueMap` を村状態へ追加し、拡張開始時は素材消費＋必要ターン設定のみ行い、ターン経過で完了時にレベル反映するよう実装。
- 2026-03-22: 住居拡張ターン短縮を追加。必要ターンは `TERRITORY_RESIDENTIAL_UPGRADE_BASE_TURNS(3)` を基準に、`生産力100%ごとに-1T`（下限1T）で算出。
- 2026-03-22: 住居拡張コストを `施設.json` 参照へ変更。目標区分（町/都市/大都市）に対応する施設名を解決し、`food/material` をタイル数分（中心+付属）消費。コスト未設定時は拡張不可理由を表示。
- 2026-03-22: 住居拡張中タイルは `居住化/資源化` 切替を不可に変更。選択マス詳細の「領土運用」に拡張中表示（残りT）を追加。
- 2026-03-22: 住居拡張キュー対象タイルの住居マーカーを半透明表示するよう調整。
- 2026-03-22: 検証: `npm run build:front` 成功。
- 2026-03-22: `develop-web-game` Playwright クライアント実行を試行したが、スキル実行環境で `playwright` パッケージ未解決のため失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-22: 都市ステータスに「穢れ/浄化/回復」を追加。タイル別データ（tileCorruptionMap ほか）を ensureVillageStateShape で正規化し、人口ヘッダー展開に表示。
- 2026-03-22: 都市維持率ペナルティを追加。維持率 = 現在人口 / 保有可能人数 とし、しきい値(<70/<50/<30)に応じて生産倍率・幸福度・治安へ反映。しきい値/倍率は定数化して調整可能にした。
- 2026-03-22: 毎ターン処理に「浄化(穢れ減衰)」と「回復(自ユニットHP回復)」を追加。軍隊ユニットは hpMultiplier 分だけ回復量を乗算。
- 2026-03-22: ユニットHPランタイム値（maxHp/currentHp）を作成時・レベル再計算時に保持するよう調整。ターン回復でも不足時に補正。
- 2026-03-22: ユニット死亡時の穢れ加算用フック recordUnitDeathCorruptionAtTile を追加（今後の戦闘死亡処理から呼び出し予定）。
- 2026-03-22: 検証 npm run build:front 成功。
- 2026-03-22: develop-web-game Playwrightクライアント実行を再試行したが、スキル実行環境で playwright パッケージ未解決のため失敗（ERR_MODULE_NOT_FOUND）。
- TODO: 戦闘でユニット死亡が確定した経路（将来の戦闘解決処理）から recordUnitDeathCorruptionAtTile を呼び出して穢れ加算を本接続する。
- 2026-03-24: 施設建設の資材表示を生資材キー基準に統一。建設画面に所持資材と必要比 (現在/必要) を表示し、資材不足理由も不足キー単位で出すよう修正。
- 2026-03-24: 建設モーダルを左右レイアウトへ再構成。ヘッダーは都市規模/研究Lv/残り土地のみに整理し、施設.json の 建築時間 を 村/町/都市/大都市 は土地上限、それ以外は土地消費として扱うよう更新。
- 2026-03-24: 建設モーダルを VillageBuildModal.vue + VillageBuildModal.css に分離。PhaserMapGeneratorPanel からは表示ロジック呼び出しに集約し、親CSSの建設モーダル専用定義を削除。
- 2026-03-24: フィールド遭遇ルールを更新。移動中の敵同マス判定は「未発見なら通過可」「発見済みでも非好戦なら通過可」に変更し、好戦敵のみ停止/戦闘トリガー対象に整理。
- 2026-03-24: 敵に発見されたタイルを `alertedEnemyTileKeys/alertedFactionTileKeys` で保持し、マップ上の敵アイコンへ `!` マーカーを表示するよう実装。可視状態スナップショット/セーブデータにも永続化。
- 2026-03-24: 隠密中の好戦敵へ同マス進入した場合は `stealthAmbush` として奇襲扱いにし、仮戦闘モーダル（勝利/敗北選択）を開くよう追加。
- 2026-03-24: タイル詳細に攻撃ボタンを追加。押下で攻撃モード（赤カーソル）に切替し、隣接マスクリックで仮戦闘モーダルを開く暫定フローを実装。
- 2026-03-24: 検証 `npm run build:front` 成功。
- 2026-03-24: `develop-web-game` Playwright クライアント実行を試行したが、スキル実行環境で `playwright` パッケージ未解決のため失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-28: 川/滝/溶岩の画面描画を edge 基準へ寄せるため、PhaserMapGeneratorPanel.vue のタイル中央滝アイコン描画と川ノード（円）描画を削除。川・滝・溶岩は共有辺ライン描画のみを使用。
- 2026-03-28: 関連する未使用定義（esolveWaterfallIconName / MAP_WATERFALL_ICON_CONFIG 参照 / waterfallTextureKey）を整理。
- 2026-03-28: 検証: 
pm run build:front 成功。
- 2026-03-28: develop-web-game Playwrightクライアント実行は playwright パッケージ未導入のため失敗（ERR_MODULE_NOT_FOUND）。
- 2026-03-28: Height-difference borders now use Δ-level to choose line count (diff>1 draws 2 or 3 lines, ≤1 hides), colors/alpha keyed to strong drops, matching the spec for multi-line borders.
- 2026-03-28: ビルド: 
pm run build:front 成功 (chunk warning unchanged).

- 2026-03-29: 平地/荒野を分離。`地形定義`に`荒野`を追加し、色を調整（平地=黄緑系、荒野=旧平地色）。
- 2026-03-29: 生成ルールを追加。砂漠隣接・乾燥度・森隣接などを使って`平地 -> 荒野`へ変換する`applyWastelandTransition`を実装し、「森寄りは平地、砂漠寄りは荒野」を反映。
- 2026-03-29: 森の目標補充が荒野を上書きしないよう`topUpForestToTarget`を修正。
- 2026-03-29: 地形塊の整形対象に`荒野`を追加（孤立荒野の補正含む）。
- 2026-03-29: 勢力地形名の正規化とカテゴリに`荒野`を追加（`FACTION_TERRAIN_ALIAS_MAP` / `BASE_TERRAIN_KEYS`）。
- 2026-03-29: 検証 `npm run build:front` 成功。
- 2026-03-29: `develop-web-game` Playwright クライアントは今回も `playwright` パッケージ未解決で実行不可（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-29: 数値入力UIを「右側△▽ステッパー」基準に統一。`PhaserMapGeneratorPanel.vue` の島カスタム/攻撃射程/ユニット作成数を更新し、`App.vue` のゲーム開始設定（プレイヤー数・別勢力数）にも同形式を追加。
- 2026-03-29: `App.vue` にゲーム開始数値のステップ調整関数 `nudgeGameStartCount` を追加。合計上限（最大勢力数）に従う既存 `normalizeGameStartCounts` を継続利用。
- 2026-03-29: 検証 `npm run build:front` 成功。- 2026-03-29: develop-web-game Playwrightクライアント再実行は playwright パッケージ未解決のため失敗（ERR_MODULE_NOT_FOUND）。
- 2026-03-29: 修正: 戦闘勝利後の敵マーカー残留を抑止。`applyFieldBattleResultV2` で調査文脈を含む全勝利時にタイル敵クリア処理を通すよう変更し、`clearMonsterTileByAmbush` の即時再抽選を停止（次回調査時再抽選）。
- 2026-03-29: 修正: 選択マス詳細の敵表示を改善。発見時の敵名を `spottedEnemyNamesByTile` に記録し、現在敵がいない場合でも `発見履歴:` として表示。
- 2026-03-29: 修正: ターン終了時HP回復の適用条件を見直し。再生値回復は常時適用、地形回復は自領または村中心で適用するよう `applyVillageTileRecoveryTurn` を更新。
- 2026-03-29: 検証: `npm run build:front` 成功。`develop-web-game` Playwright クライアントは `playwright` パッケージ未解決で実行不可（ERR_MODULE_NOT_FOUND）。
- 2026-03-29: 追補: 奇襲ログの「再抽選:0体」表示を抑止。再ビルド確認 (`npm run build:front` 成功)。
- 2026-03-29: 危険度ルール更新。自領タイルは `applyDangerRulesByTerritory` で常時危険度0%に補正し、危険度0%タイルは `clearEnemyPresenceAtTile` で敵自然配置を抑止。
- 2026-03-29: 無主地の危険度自然上昇を追加。3ターンごとに +20%（上限100%）をターン進行時のみ適用。
- 2026-03-29: 村配置時/マップ適用時に危険度ルールを再適用し、`rerollEnemySpawnAtTile` 側でも危険度0%時は敵再抽選しないよう修正。
- 2026-03-29: 検証 `npm run build:front` 成功。
- 2026-03-29: 初期村配置直後の危険度0化不具合を修正。マルチ勢力作成中に `syncActiveTestPlayerSlotFromLiveState` より前に領土再計算していたため中心1マスのみ0化されるケースがあり、同期→領土再計算→危険度適用の順へ変更。
- 2026-03-29: 検証 `npm run build:front` 成功。
- 2026-03-29: 危険度0化条件を拡張。`applyDangerRulesByTerritory` で「自勢力のみ」から「領土化済みタイル全体（全勢力）」を危険度0%維持に変更。
- 2026-03-29: マルチ初期配置直後の同期差分対策として、`rebuildTerritorySets` のアクティブ勢力判定は live `villageState` を優先し、activeId未設定時は先頭スロットIDへフォールバック。
- 2026-03-29: 検証 `npm run build:front` 成功。
- 2026-03-29: 初期配置直後の危険度反映を強化。`syncDangerRulesForCurrentMap` を追加し、村配置完了後 `nextTick` で領土再計算→危険度同期→再描画を再実行して開始時ズレを抑止。
- 2026-03-29: 検証 `npm run build:front` 成功。
- 2026-03-29: ターン進行を自動時間経過へ変更。共通基準 TURN_SECONDS（既定60秒）を追加し、時計・ターン進行・移動時間計算をこの基準へ統一。
- 2026-03-29: 自動進行は AUTO_TURN_PAUSE_EVERY_TURNS（既定10T）ごとに停止するように変更。時計モーダルから「開始/停止」で再開・停止可能化。
- 2026-03-29: 移動を時間経過式へ変更。1マス移動時間 = (MOVE_TIME_BASE_TURNS * TURN_SECONDS) / 移動値（既定 2*60/移動）で待機し、停止中は移動進行も停止。
- 2026-03-29: unNextTurn に showEventModal オプションを追加し、自動進行時は毎ターンのイベントモーダル表示を抑止。
- 2026-03-29: 検証: 
pm run build:front 成功。
- 2026-03-29: ユニット移動の全体ロックを撤廃し、ユニット単位の移動中管理へ変更。`useUnitMovePanel.js` に `movingUnitIdSet` / `isMoveGroupInProgress` を追加し、移動中でも他ユニット選択・別ユニット移動指示・各UI操作が並行可能な構成へ更新。
- 2026-03-29: 移動中ユニット以外の操作性を維持するため、移動ステップ中の `setSelectedTileKey` / `onMapTileSelected` は「現在選択中ユニットが当該移動グループに含まれる場合のみ」反映するよう修正。
- 2026-03-29: 攻撃可否の移動判定を「誰かが移動中」から「選択中ユニット(移動グループ)が移動中」に変更（`resolveSelectedTileAttackActionState`）。
- 2026-03-29: 検証 `npm run build:front` 成功。
- 2026-03-29: `develop-web-game` Playwright クライアント実行を試行したが、実行環境で `playwright` パッケージ未解決のため失敗（`ERR_MODULE_NOT_FOUND`）。
- 2026-03-29: own-faction-panel に移動中インジケータを追加。`unitEntries` に `isMoving` を付与し、移動値の右に `👣` を点滅表示するよう更新。検証: `npm run build:front` 成功。
- 2026-04-05: 強敵出現ルールを調整。map-generator.js の 強敵配置設定 に 出現率倍率: 0.5 と テリトリー半径 を追加し、強敵候補生成時にテリトリー重複チェックを導入（重複時は候補生成をスキップ）。PhaserMapGeneratorPanel.vue 側でも強敵タイルは常にテリトリー付きで敵スポーンするよう統一し、既存テリトリー重複チェックを適用。
- 2026-04-05: 修正: map-generator.js で未定義の clampNumber を使用していたため clamp に統一。Uncaught ReferenceError: clampNumber is not defined を解消。
pm run build:front 成功。
- 2026-04-05: 修正: map-generator.js に 	oSafeNumber ヘルパーを追加し、強敵テリトリー関連変更で発生した 	oSafeNumber is not defined を解消。
pm run build:front 成功。
- 2026-04-05: ゲーム中クリック時の文字選択ハイライトを無効化。PhaserMapGeneratorPanel.css で user-select none と tap-highlight 無効化を追加し、input/textarea/select/contenteditable は除外。

- 2026-04-05: 河川生成を仕様変更。generateRivers を主河川/小河川の2段生成へ再構成。
  - 主河川: 連結陸地サイズごとの本数テーブル（1〜39=0, 40〜119=1, 120〜219=2, 220〜359=3, 360〜539=4, 540〜759=5, 760以上=6+200毎+1）で生成。
  - 主河川: 下り方向のみで流路作成、最小長6、河口間距離>=6、中間距離>=4を満たす候補のみ採用。
  - 小河川: 主河川生成後に密度ベース（大陸サイズ/係数）で短距離（3〜8）を追加。
  - 既存の riverData 返却形式（riverSet/sourceSet/branchSet/mouthSet/edgeSet/waterLinkSet/corner*Set/meshCenterSet/largeRiverSet）を維持。
- 2026-04-05: 検証: 
pm run build:front 成功。- 2026-04-05: 河川分岐率を既定25%に調整（河川.分岐.幹線確率=0.25）。小河川生成数を分岐率でスケーリングし、分岐流路は llowEarlyStop:false + 長さレンジ拡張で分岐先が伸びるよう修正。検証: npm run build:front 成功。
- 2026-04-05: 川分岐の生成起点を主河川隣接へ変更し、分岐開始エッジを明示接続。分岐ルートの近接判定を先頭数マスで緩和して『分岐してすぐ止まる』状態を改善。検証: npm run build:front 成功。
- 2026-04-11: 敵配置調整。森モンスターの地形キー付与を『周囲隣接がすべて森の内部タイル』に限定し、森端での出現を抑制。平地隣接時のテリトリー中心ズレを軽減。検証: npm run build:front 成功。

- 2026-07-20: 他プロジェクトへコピーして使える `配布用/アニメーション再生機能` を追加。Vue非依存の `PhaserEffectPlayer`、Vue操作部品、Vite素材一覧例、導入例、README、簡易テストを収録。
- 2026-07-20: 現行の `assets/effect/320×240` と `assets/effect/アニメーション1` を配布用へコピー。235ファイル・24.58MiBをSHA256で原本一致確認。
- 2026-07-20: 配布版は現行仕様に合わせ、1素材1500ms固定、連続間隔10ms、幅320px素材は縦120px分割、`アニメーション1`は2倍表示を初期設定。`npm test`、Vue SFC解析、`npm run build:front` 成功。
- 2026-07-20: develop-web-game Playwrightクライアントは `playwright` パッケージ未解決 (`ERR_MODULE_NOT_FOUND`) のため画面キャプチャ未実施。

- 2026-09-13: v39新UIを圧縮HTMLのビルド時置換から通常の `frontend/index.html` 初期画面へ展開。`v39-bootstrap.js` を唯一の初期化入口にして、地図・フッター・研究・設計書を接続。
- 2026-09-13: Phaser地図にホイール拡縮、ドラッグ移動、ピンチ拡縮、ダブルタップ拡大、画面上の＋−ボタンを追加。リサイズ後もズーム倍率を維持。
- 2026-09-13: `npm run build:front` 成功。Playwright状態確認で初期倍率0.1321から拡大後0.1717への変化を確認。WebGLキャンバス画像はヘッドレス環境では黒く取得された。
- 2026-09-13: v39 Phaser地図の入力座標を、DOM表示比率を補正したカメラ座標からPhaser逆変換する方式へ統一。六角形内判定によるタイル選択、選択枠、`v39:tile-selected` イベントを追加。
- 2026-09-13: ズーム中心をカーソル/指位置へ固定し、＋−ボタンは実際に見えている地図範囲の中央を使用。標準カメラ境界との競合を独自境界補正へ変更。Playwrightで通常時・拡大後のタイル選択と中心誤差ほぼ0を確認。

- 2026-04-12: フィールド非表示の原因を修正。isForestCoreSpawnTile 内で未定義の getHexNeighborCoords を呼んでいたため実行時に初期化停止。getHexNeighborCoordsBySize(..., resolveWorldWrapEnabled(data)) に差し替え。uild:front と Playwright で pageerror 解消・描画復帰を確認。

- 2026-09-13: v39地図の最大ズームを初期フィット比4倍から6倍へ拡張。
- 2026-09-13: デスクトップの上側フィールド/下側コマンド領域を、ヘッダーを除いた残り高さの6:4へ固定。Playwright状態値で390px/260px、比率0.600を確認。
- 2026-09-13: v39 Phaser地形描画へ旧実装の高度色補正を復旧。陸地は高度Lv -2〜8を明度1.18〜0.74へ線形補間し、海は深度Lvごとに暗くする。
- 2026-09-13: `npm run build:front` 成功。Playwrightで拡大操作、山岳タイル選択、高度値取得、コンソールエラーなしを確認。ヘッドレスWebGLのスクリーンショットは引き続き全面黒。
- 2026-09-13: 6:4レイアウトを残り領域基準から画面全体基準へ修正。下部UIを40svh固定とし、Playwright実寸で上側432px(60%) / 下側288px(40%)を確認。
- 2026-09-13: 6:4比率の基準を再修正。ヘッダーを除いた残り領域に対しフィールド3fr/下部UI 2frを最終CSSでデスクトップ・スマホ縦へ適用。実測390px/260px、0.600/0.400を確認。
- 2026-09-13: ヘッダーを除いたフィールド/下部UI比率を5:5へ変更。Playwright実測325px/325px、0.500/0.500、コンソールエラーなし。
- 2026-09-13: 下部メインタブ5種を左サイド縦並びへ変更し、右側だけ内容切替する構成へ更新。
- 2026-09-13: 管理内にモーダルを使わない表示設定画面を追加。文字倍率、高低差境界のみ、高度濃淡、ズームボタン、動き軽減、初期値復元をlocalStorage保存・即時反映。
- 2026-09-13: 高低差境界のみ表示を初期ON化。同じ高度Lv同士の黒いヘックス線を省略し、設定変更時は地形レイヤーだけ再描画。
- 2026-09-13: 440x956実機相当で左76px/右364px、表示設定幅352px、モーダル0、ツールチップ重複0を確認。全タブ排他表示と各表示設定操作を確認し、npm run build:front成功・エラーなし。
- 2026-09-13: 下部の「土地」「土地データ」を「土地」へ統合し、基本情報6項目と詳細情報6項目を同一パネル表示へ変更。
- 2026-09-13: 下部「戦闘」を「行動」へ名称・内部タブキーともに変更。左タブを2文字前提へ縮小し、幅をPC58px/縦スマホ52pxに設定。
- 2026-09-13: 440x956で左52px/右388px、各ボタン41px、土地12項目がスクロールなしで収まることを確認。4タブ排他表示、build成功、エラーなし。
- 2026-09-13: 画面幅で変える対象をフィールドと操作UIの配置方向だけに限定。操作UI内部の文字、ボタン、カード、列構成、配色を全画面サイズで共通化し、重複していた旧 `.faction-panel` を全画面で非表示化。
- 2026-09-13: 1280x720、440x956、900x500で検証。下部UIは共通14px、左タブ52px、タブボタン41x42pxを維持し、横画面だけフィールド左・操作UI右へ配置。`npm run build:front` 成功、実行時エラーなし。
- 2026-09-13: 下部操作UIの完成済みHTMLとサンプル値を `frontend/index.html` から削除。`v39-operation-ui.js` のタブ・土地・部隊・行動・管理定義から空の `.footer` へ初期描画する構成へ変更。
- 2026-09-13: 操作UI初期配列を `V39_INITIAL_GAME_STATE` としてゲーム状態にも共有し、後段の部隊バインドが空状態で表示を上書きする二重データ源を解消。旧 `.faction-panel` のDOMと専用イベント、部隊レンダラー、footer切替fallbackを削除。
- 2026-09-13: 巨大インライン処理を `v39-legacy-ui.js` へ分離し、`v39-bootstrap.js` で操作UI生成から機能接続までの順序を固定。初期モジュールを800ms遅延しても旧UI・仮マップが表示されないことを確認。
- 2026-09-13: 1280x720、440x956、900x500で、4タブ排他表示、部隊5/3/2体、ゲーム状態10体、旧faction-panel 0件、エラーなしを確認。`npm run build:front` 成功。
- 2026-09-13: v39ゲーム状態を複数プレイヤー前提の `players[] + activePlayerId + players[].factionState` 構造へ変更。トップレベルの単一 `units[]` を廃止し、部隊・土地UIは操作中プレイヤーの `factionState.units[] / squads[]` を参照。
- 2026-09-13: `setV39ActivePlayer(playerId)` と操作中勢力更新APIを追加。プレイヤー1（10体・3部隊）とプレイヤー2（1体・3部隊）を切り替え、一覧・部隊数・詳細が混在せず復元されることを確認。
- 2026-09-13: v39画面の固定サンプル値を `frontend/src/v39-test-data.js` へ分離。操作UI本体からプレイヤー・部隊・キャラクターの変換処理を除去し、専用テストデータから初期ゲーム状態・土地初期値・行動スキルを読み込む構成へ変更。
- 2026-09-13: `npm run build:front` 成功。Playwrightでテスト状態が2プレイヤー・10体/1体として読み込まれ、トップレベル`units`なし、プレイヤー2切替時にガルドだけが表示されることと実行時エラーなしを確認。
- 2026-09-13: v39テストキャラクターの技を `data/source/export/json/スキル一覧.json` 参照へ変更。テストデータは技名だけを割り当て、AP・基礎威力・射程・範囲・詳細をJSONから生成する。JSONにない旧仮技を除去。
- 2026-09-13: `npm run build:front` 成功。Playwrightで闘気撃AP60/威力25/射程1、火球AP8/威力49/射程2/炸裂0.5などJSON値との一致、未記載射程の1マス補完、実行時エラーなしを確認。
- 2026-09-13: `data/source/export/json/テストゲーム状態.json` を追加。テスト側は種族・クラス・Lv・装備・所属・配置などの選択だけを保持し、HP・ステータス・技能・取得技を `クラス.json`、装備性能を `装備.json`、土地性能を `地形.json` から生成する構成へ変更。
- 2026-09-13: `npm run build:front` 成功。Playwrightでレオンの最大HP112/攻撃107/防御99、取得技、剣威力35、平地危険度20%が各JSONから生成され、2プレイヤー10体/1体、実行時エラーなしを確認。
- 2026-09-13: 1プレイヤーの共通型を `frontend/src/lib/player-state.js` に追加し、v39状態、テストJSON読込、Phaserの新規勢力・ライブスナップショット・セーブ復元へ接続。`config/player_state_schema.json` に必須項目を定義。
- 2026-09-13: Playwrightで両プレイヤーの必須factionState 11項目、索敵配列6項目、研究progress/selectionが補完されること、プレイヤー2切替後もガルド1体だけになること、実行時エラーなしを確認。`npm run build:front` 成功。
- 2026-09-14: v39フィールド画像の参照先を整理。敵は `assets/images/illust`、プレイヤーユニットは `assets/images/units/<種族>` から検索し、未対応時は `assets/images/アイコン` を使用する。拠点は旧仕様の村/町/都市/大都市画像と固定サイズを復元。
- 2026-09-14: Phaser描画ツリー検証で `只人/ファイター`、`オーガ/オーガ_ファイター`、`illust/スネーク`、画像なしユニットの `兵士` アイコン、画像なし敵の `爪` アイコン、拠点 `村` 60x60pxを確認。実行時エラー0件、`npm run build:front` 成功。標準Playwrightは生成完了を確認したが、ヘッドレスWebGLの画像は既知の制約で黒く取得された。
- 2026-09-14: v39地図へプレイヤー領土の外周線、ユニット/拠点の索敵範囲外周線、未発見タイルの暗転、プレイヤー別発見済み座標保存、索敵範囲外の敵非表示を追加。
- 2026-09-14: 未配置キャラのnull座標が(0,0)として描画・索敵される問題を修正。検証用配置で索敵1マス=7タイル、索敵75で2マス=19タイル、領土3タイル外周、近距離敵のみ表示、探索履歴保存、実行時エラー0件を確認。
- 2026-09-14: v39初期拠点の領土登録を中心1マスから半径1へ修正。中心+隣接6マスの通行可能・未所有タイルを取得し、中心を拠点、周囲を領土として登録。再配置時の旧自領データと新規マップ配置開始時の探索履歴を消去する。
- 2026-09-14: Playwrightで内陸配置は7マス、沿岸配置は通行不能地形を除いた3マスとなることを確認。中心施設/状態、周囲の領土状態、完了イベント、陣地外周用データ、再配置時の旧陣地削除、実行時エラー0件を確認。`npm run build:front` 成功。
- 2026-09-14: `docs/ALL_TASKS_UNIFIED.md` を現行v39移行状況に合わせて全般棚卸し。陣地、索敵、火山/噴火/溶岩、AP戦闘、反撃、死亡回収、ターン処理、外交、敵AI、マルチ、テスト、性能、UIの不足仕様と完了条件、推奨実装順を追加。
- 2026-09-14: `data/source/export/json` をゲーム内容の正本とし、既存方式の種類追加をJSONだけで行えるようにする `docs/DATA_DRIVEN_RULES.md` を追加。共通データ登録口、識別キー、固定配列廃止、参照検証、セーブ時のID参照を全般タスクへ追加。
- 2026-09-14: JSONデータ駆動の対象を主要データだけでなく `data/source/export/json` 内の全21ファイル・全レコードへ明確化。新規JSONの自動登録、未接続列の検出、コード側の重複定義禁止を仕様とタスクへ追記。
- 2026-09-14: `frontend/src/lib/game-data-registry.js` を追加し、`data/source/export/json/*.json` を自動登録する共通データ入口へ全Vue/v39/Phaserの直接importを移行。ブラウザで21テーブル605レコード、既存テスト2プレイヤー、レオンHP112/攻撃107/防御99/剣を確認。`npm run build:front` 成功、実行時エラー0件。
- 2026-09-14: v39初期拠点配置後に `出現敵.json` と `クラス.json` から敵を生成する `v39-enemy-spawn.js` を追加。拠点4マス以内を除外、10マス以内をLv10以下、出現可能タイル120マスにつき1体・8～30体で決定的配置する。60x60検証で29体、安全距離5、近傍Lv超過0、無効生成0、実行時エラー0件を確認。`npm run build:front` 成功。
- 2026-09-14: v39行動タブを実ゲーム状態へ接続。選択キャラの装備武器と行動A、AP不足表示、黄色射程、赤範囲、オレンジ炸裂、AP消費、HP/死亡更新、戦闘ログを共通攻撃処理へ統合。爪2回が8+8、火球炸裂0.5が32→16、Lv軽減8、物理/魔法の防御参照一致を確認。
- 2026-09-14: 配布用 `PhaserEffectPlayer` をv39へ接続。231素材を `/assets` から遅延読込し、ビルドへの画像複製を0件に維持。アニメ未設定時の斬撃、`:`連続再生、10ms間隔、炸裂倍率、最上位描画を確認。被弾点滅、累積ダメージ値、小型HP遅延減少バーも戦闘ログイベントへ接続。`npm run build:front` 成功、実行時エラー0件。
- 2026-09-14: v39死亡ライフサイクルを追加。HP0で死亡情報を記録し、30秒間フィールドへ残す、自軍同マスで回収、期限で消滅、回収済み死亡者の共通復活APIを実装。キャラクターモーダルへキャラクター/部隊/死体回収/死亡者一覧を実データ表示し、回収・消滅・復活と実行時エラー0件を確認。
- 2026-09-14: v39共通状態へターン番号・停止状態・実時間とプレイヤー別戦闘時間状態を追加。手動ターン終了、生存者のみAP全回復、停止/再開、上部テロップを実装。ターン前後でカメラ座標・ズーム・選択タイルが完全一致し、死亡者AP/HPが変化しないことをPlaywrightで確認。`npm run build:front` 成功、実行時エラー0件。
- 2026-09-14: v39の停止可能な実秒時計へ魔法発動6秒、JSON待機・CT・効果時間、発動中スキル状態を接続。火球はAP先払い後、停止中と5999msでは未発動、6000msで一度だけ解決することを確認。
- 2026-09-14: 好戦的な敵の12秒間隔AIを追加。敵の索敵内にいる生存ユニットを対象に、射程・AP・CTを満たす行動Aだけを選び、同じダメージ式・複数ヒット・エフェクト・ログ・死亡処理へ接続。ワイバーンが12000msで翼2ヒットを実行することを確認。
- 2026-09-14: 単体近接の反撃を共通戦闘へ追加。直前または装備中の近接武器、自然攻撃7種だけを1回使い、範囲・炸裂・待機・CT・AP・再反撃を除外。剣への爪反撃と弓への反撃なしを確認。同時に武器APが攻撃APと魔法APを誤加算していた不具合を修正し、弓は攻撃AP65で使用可能にした。
- 2026-09-14: v39研究画面を `研究.json` の60項目から生成し、カテゴリ別研究選択、担当ユニット、必要Lv、項目別EXP、100%完了、繰越EXPをプレイヤー状態へ接続。研究IDを行番号非依存へ変更した。
- 2026-09-14: ターン終了時の研究進行を追加。基礎10EXPへ担当ユニットの対応技能を割合加算し、レオン指揮84で18EXP進行、100%完了、28EXP繰越、2プレイヤー間の状態分離、実行時エラー0件をPlaywrightで確認。
- 2026-09-14: 既存の火山・溶岩エンジンをv39ターンへ接続。休火山噴火、低地優先溶岩流、停止理由、流路を共通状態へ保存し、カメラを維持した地形・溶岩・アイコン再描画と土地詳細表示を追加。
- 2026-09-14: 溶岩を通常通行不可にし、炎耐性100/耐熱を例外化。敵味方へ最大HP10%の耐性軽減ダメージ、死亡処理、ダメージポップアップを接続。JSON由来の全耐性がv39派生キャラクターから欠落していた問題も修正。強制噴火+溶岩、耐性20でHP100から91、耐性0で88、カメラ維持、エラー0件を確認。
- 2026-09-14: v39都市経済をプレイヤー別 `village` 状態へ統合。初期領土産出3ターン分の在庫、全プレイヤーのターン収支、実在庫ヘッダー、施設JSON全25件、地形・研究・資材・施設枠判定、資材先払い、建設キュー、土地施設反映を実装。市場2ターンの開始から完了までPlaywrightで確認。
- 2026-09-14: `地形.json` の能力補正を保存基礎値と分離し、敵味方の通常攻撃・反撃・外部ダメージAPIへ統一適用。部隊詳細、土地詳細、ダメージログへ補正値と地形名を表示。
- 2026-09-14: `範囲.json` に放射・散弾・縦・爆発・炸裂と処理タイプを追加。スキル範囲参照の検証警告9件を解消し、全JSON検証はエラー0件・未収録クラス技警告39件になった。
- 2026-09-14: 経済と研究へ処理済みターン番号を保存し、同一ターンイベントの再通知で二重収入・二重研究EXPが発生しないようにした。
- 2026-09-14: v39管理タブへ国家・外交画面を追加。`体制 / 外交姿勢 / 組織` をJSONから生成してプレイヤー別に保存し、勢力ペア単位の宣戦・停戦、外交評価-20の20ターン保持、魔族同士の免除を実装した。視界内の他プレイヤー部隊を描画し、未宣戦攻撃を拒否、戦争中は共通戦闘式でHP・死亡状態を更新することを確認。
- 2026-09-14: v39専用セーブ形式v1を追加。全プレイヤー・外交・経済・研究・戦闘・地形イベントとマップ、選択タイル、カメラを保存し、Set/Mapも型付き復元する。ターン7、方針ID、川43要素、カメラの往復一致をPlaywrightで確認。
- 2026-09-14: v39管理タブ内へユニット作成を接続。初期職業JSON、軍事Lv、勢力別上限、種族人口、資源を検証し、軍隊作成時の人口消費・HP倍率・クラス固定装備・プレイヤー状態追加を実装。只人ファイター1体で人口50→46、HP123、実行時エラー0件を確認。
- 2026-09-14: v39装備画面を固定HTMLから実状態へ接続。一覧・キャラ装備・生成、装備済み/残数、JSON素材費、鍛冶Lv、ネームド在庫変更、モブ固定装備レア度一新、防具耐性再計算を実装。生成・装備・解除・モブ拒否・一新をブラウザで確認。
- 2026-09-14: ターン処理をイベント登録順依存から段階実行へ変更。AP回復、地形、経済・建設、研究、外交、生存者HP5%回復、完了の順を固定し、処理済みターンと段階列を状態へ保存。死亡者・選択・カメラの維持を確認。
- 2026-09-14: v39装備画面へ `付与.json` と `消費量.json` を使う付与タブを追加。対象分類、5系統LvのAND条件、素材費、武器最大3件・付与Lv合計品質上限、能力・耐性・攻撃属性反映を実装し、魔力強化装備で魔力+10となることを確認。
- 2026-09-14: v39土地タブへ1ターン調査を追加。`地形.json` からレア資源候補を生成し、ワールド共通の未発見地点とプレイヤー別の調査・発見履歴を分離して保存。金山発見、土地表示、毎ターン金+8、ターン処理順、セーブ復元をPlaywrightで確認。
- 2026-09-14: 固定サンプルだった統治者ログをプレイヤー別活動ログへ変更。戦闘・地形被害・建設・研究・調査・ターンを最大300件保存し、実ログ2件の表示を確認。
- 2026-09-14: 中立一般村と放浪者をワールド共通状態へ追加。`勢力.json / クラス.json` 由来の村生成、放浪者の通行可能隣接マス移動、同マス時のプレイヤー別発見、一般村研究EXP+10をターン処理へ接続し、Playwrightでエラー0件を確認。
- 2026-09-14: 土地タブへ発見済み放浪者の勧誘を追加。基本50%、同種族+20%、異種族-20%、幸福度+10%、加入30～70%、失敗時10%離散を決定的判定し、失敗時20人から18人への減少と活動ログ保存を確認。
- 2026-09-14: プレイヤー所有拠点を `factionState.settlements[]` と安定 `settlementId` で正本化。旧単一 `village` は読込移行・互換参照へ限定し、ワールド拠点一覧は所有拠点配列から再構築する構成にした。
- 2026-09-14: `territoryStateByTile` を状態と所属拠点IDのレコードへ移行。初期領土・調査取得領土へ所属拠点を保存し、拠点ごとの領土収入、全拠点の個別ターン経済、ユニット所属拠点、全拠点索敵を接続した。
- 2026-09-14: 下段へ `拠点` タブを追加。拠点名横スクロール、視覚的な選択状態、人口・食料・資材・施設・領土・修復の複数同時展開可能な折りたたみを実装。2拠点の選択、ターン処理、セーブ復元、索敵、390x844表示を確認。
- 2026-09-14: v39実行状態から `factionState.village` を除去し、経済・建設・装備・ユニット生成・探索・敵生成・初期配置・回復・描画を `factionState.settlements[]` 参照へ統一。旧 `village` はセーブ読込時だけ移行入力として受け付け、正規化後には保持しない。
- 2026-09-14: 複数拠点、旧セーブ移行、経済、装備、施設効果、ユニット生成、探索、ターン、火山境界、視界分離、状態クローンをPlaywrightで再検証し、実行時エラー0件を確認。
- 2026-09-14: `施設.json` の拠点規模行へ分類、識別キー、規模Lv、下限人口、ネームド上限、表示画像、表示サイズ、1マス収容人数、占有マス数を追加。規模判定、ネームド上限、施設枠、居住設定、建設候補除外、マップ上の拠点画像サイズを同じJSON定義へ統一した。
- 2026-09-14: データ静的監査へ理由付き予約列を追加し、現行21テーブル556列は参照542・予約14・未接続候補0。人口境界0/159/160/259/260/419/420で規模Lvと画像サイズをPlaywright検証した。

- 2026-09-14: `敵AI・巣・生態系仕様.md` の確定部分を反映。敵巣 `enemyNests[]`、敵の `nestId`、部隊 `cargo`、地上戦利品 `groundLootByTile` を正規化・セーブ対象に追加。敵死亡時は巣の所属IDと人口を同期する。肉収入量や人口増加式などの未確定値は未実装。
- 2026-09-14: 味方部隊・単独ユニット・敵部隊の帰還時自動搬入を追加。単独枠は `cargoByUnitId`、敵側は `enemySquads[]` で運搬品を分離し、`v39:unit-moved / v39:enemy-moved` 後に対応在庫へ移す。ブラウザ結合テストで資源・装備・セーブ復元を確認。
- 2026-09-14: 部隊全滅時の運搬品を死体へ移す処理を追加。一部生存時は共有物資を維持し、死体回収時は回収者の部隊へ移す。期限切れ時は食料だけ消失し、その他の資源・装備を未発見の地上残留品として保存する。
- 2026-09-14: 地上残留品を既存の1ターン調査へ接続。発見後は土地タブから回収でき、モンスターも索敵内の残留品へ移動・回収して巣へ搬入する。死亡・探索・敵AI・物流・セーブの回帰、専用ブラウザ結合テスト、標準ゲームクライアント、`npm run build:front`、データ監査を通過。
- 2026-09-14: 敵味方共通のターン活動履歴 `lastMovedTurn / lastCombatTurn` を追加。移動または戦闘した個体は自然回復せず、未行動の生存者だけ基本5%と現在地補正で回復する。敵の巣に回復値が設定された場合も同じ式へ加算する。
- 2026-09-14: 敵AIへ縄張り内徘徊、好戦性別の追跡限界、攻撃者の個体別記憶、追跡終了時の帰還、巣1マス侵入時の群れ防衛を追加。巣あり敵のHP30%/55%逃走と、巣なし敵のHP30%時30%一度限り判定・索敵外後の追加1回移動も接続した。
- 2026-09-14: 敵AI専用ブラウザ試験で徘徊、防衛攻撃、群れ反応、非好戦的追跡境界、巣帰還、巣あり/なし逃走を確認。既存敵攻撃・残留品回収テストと `npm run build:front` も成功。
- 2026-09-14: 60x60・敵79体の200ターン連続試験を実施。敵・一般村・放浪者数を維持し、Phaser子要素、Graphics、タイマーの継続増加0、実行時エラー0件を確認。

## 2026-09-14 拠点固有データと規模更新の整合

- `normalizeV39Village` が各拠点へ、`施設.json` の拠点規模行から求めた表示名・`scaleKey`・`scaleLevel` を保持するようにした。
- 人口が存在する拠点では旧 `type` より人口境界を優先し、ターン経過後も村の表示名に固定されず町・都市・大都市へ更新されるようにした。
- 初期拠点の `constructionQueue` を `{}` ではなく空配列で初期化するように統一した。
- 拠点規模のブラウザ試験を画像まで拡張し、村60pxから大都市78pxへのサイズ変更と、`村` から `大都市` へのテクスチャ変更を検証対象にした。
- 地形JSONの `移動条件` を解釈する敵味方共通判定を追加。名前分岐だった海・湖・溶岩通行を廃止し、遊泳・飛行・耐熱・炎耐性などをJSON側の条件だけで差し替え可能にした。
- 溶岩ターンダメージの最大HP割合と軽減耐性名も地形JSONへ移し、敵味方共通の能力値参照で軽減するようにした。
- `研究.json` 60件、`出現敵.json` 84件、`災害.json` 25件へ明示的な一意 `ID` を追加。研究の既存保存IDは維持し、登録口では旧複合IDも検索可能にした。
- 生成敵の `sourceDefinition` 全体コピーを廃止し、`sourceDefinitionId` だけを状態へ保持するようにした。専用ブラウザ試験で全IDの一意性、旧ID互換検索、敵85体の生成元参照、セーブ往復、データ監査エラー0件を確認した。
- コード固定だったコモン～レジェンダリーの品質キー、表示名、略称、Lv、倍率を `消費量.json(種別=装備)` へ移した。装備一覧・生成・レア度一新はJSONから選択肢を作り、既存装備統合試験で生成、着脱、一新、付与、能力・耐性反映を確認した。
- 勢力の優先配置判定で使っていた基本地形10件・特殊地形3件のコード固定セットを削除し、`地形.json` の `勢力配置区分` から生成するようにした。初期配置、敵スポーン、勢力AI、勢力間戦闘、データ監査を再検証した。
- 勢力データの地形略称8件をコード固定表から `地形.json` の `別名` へ移し、正規名を含む対応表を起動時に自動生成するようにした。略称を使う既存勢力の初期配置とデータ監査を再検証した。
- 研究カテゴリの一覧は引き続き `研究.json` の `技術対象` から生成し、既存5種以外のカテゴリでも表示処理が停止しない汎用メタ情報を追加した。研究選択、進行、完了、プレイヤー分離を再検証した。
- v39索敵範囲へ隠密発見判定を統合した。距離減衰と部隊集約を共通関数化し、敵・他勢力画像、土地詳細、敵AIの新規標的取得へ同じ判定を接続。高隠密/高索敵/視界外と敵AI認識をPlaywrightで検証した。
- 火山生成・噴火・溶岩流・周辺効果の固定値を `災害.json` と `地形.json` へ移した。毎ターン噴火率を基本率×地形相対補正で算出し、噴火イベントへ半径内座標と継続効果値を保存。実効1.2%、半径1、周囲6マス、継続2ターンをブラウザで検証した。
- マップ生成対象11地形の名前・順序・色・抽選重み・略称を `map-generator.js` の固定配列から `地形.json` へ移した。不足・不正値・地形名または生成順の重複は起動時エラーにし、旧順序と値を維持。ビルド、データ監査、初期配置、火山処理、60x60実画面を再検証した。
- キャラクター詳細と旧Vue装備処理に残っていたコモン～レジェンダリーの固定品質配列・表示名・倍率・素材費を削除し、`消費量.json(種別=装備)` から作る共通品質定義へ統一した。旧処理だけにあった防具魔法耐性の固定表二重加算も除去し、`装備耐性 × 品質倍率 × 防具_物理/防具_魔法` に統一。装備結合テスト、キャラクターモーダル、実画面、データ監査を再検証した。
- `装備.json` の武器13件へ `武器分類=近接 / 射撃 / 魔法 / 盾` を追加し、武器名・盾名の固定配列と名前正規表現によるスロット推測を削除した。装備モーダルの固定品質・固定素材費も共通JSON定義へ統一し、軽盾を主武器欄では拒否、副武器欄では装備できることを終了コード付きPlaywrightテストで検証した。
- 旧Vue本体とキャラクターモーダルに重複していた食料・素材キー配列を削除し、`都市基本データ.json` から生成する `FOOD_RESOURCE_KEYS / MATERIAL_RESOURCE_KEYS / RESOURCE_GROUPS` へ統一した。経済、装備、キャラクターモーダルのPlaywright試験と建設・資源HUD画像を再確認した。
- 地図の主要資源アイコン優先順17件を固定配列から `都市基本データ.json` の `地図表示優先度` へ移した。全資源の優先度必須・重複禁止を起動時検証し、旧順序一致、探索資源、経済、建設、装備の結合試験を通した。
- 研究カテゴリの時間短縮技能を固定対応表から `都市基本データ.json(分類=研究Lv)` の `対応技能` へ移し、装備付与の研究条件走査も `研究.json` 由来のカテゴリ順へ統一した。ビルド、データ監査、研究・装備・経済のPlaywright試験を通過した。
- 研究Lvごとの必要ユニットLv固定表を削除し、`研究.json` の全60研究へ `必要ユニットLv` を追加した。欠落・不正値・同一Lv内の不一致を起動時検証し、v39研究画面へ `5 / 15 / 25 / 35` が届くことをPlaywrightと画像で確認した。データ監査は589列中未接続0件。
- 種族8種の能力参照クラス固定表を `種族.json.className` へ、勢力11種のマーカー文字・色を `勢力.json` へ移した。種族→勢力名の固定表は廃止し、勢力行の `種族 / カナ` から直接検索する。初期配置、ユニット作成、一般村・放浪者、画像フォールバック、標準ゲームクライアントを再検証し、実画面にも崩れがないことを確認した。
- ヒーロー成長だけに残っていた拠点規模5段階固定表とネームド上限表を削除し、`施設.json(分類=拠点規模)` の4段階へ統一した。人口560以上でも大都市Lv4を維持する境界試験を追加し、複数拠点・ユニット作成・経済・データ監査を再検証した。ユニット作成費の表示グループも都市基本データ由来の資源グループへ統一した。
- コード固定だったユニット作成費を `消費量.json(種別=ユニット作成, Lv=1)` へ移し、旧20×0.1縮尺を削除した。軍隊1体の作成で穀物・野菜・肉・木材・石材・鉄がJSON値どおり各2減ることをPlaywrightで検証し、装備・経済試験も再通過した。データ監査は597列中未接続0件。
- ヒーロー・軍隊・強化軍隊の必要軍事Lv、人口消費、HP倍率、攻撃回数、簡易行動限定、表示順を固定表から `都市基本データ.json(分類=ユニット作成)` へ移した。作成された軍隊の `combatProfile` がJSON行と一致すること、戦闘・セーブ・データ監査が通ることを確認した。

## 2026-09-16 ターン進行・戦闘時間・ガード

- v39のゲーム進行を `プレイヤーターン -> エネミーターン -> 全体終了処理` へ統一した。実時間による自動ターン、12秒敵行動、秒単位の待機・CT・効果時間・死体期限を廃止し、すべて絶対ターン番号の期限へ移行した。
- 敵AIを1体1ターン1行動へ変更し、発動待機、CT、徘徊、追跡、逃走、待機を敵ターン中に解決するようにした。行動済み記録のない逃走状態更新がループする経路も修正した。
- 攻撃エフェクトの総再生時間をフレーム枚数によらず1.5秒へ変更し、配布用プレイヤーの既定値も揃えた。
- 死体のフィールド期限を仮値30ターンへ変更した。ターン完了時に消滅判定、移動・攻撃解決時に回収判定を行い、定期タイマーは使用しない。
- セーブ形式をv3へ更新した。v2のミリ秒待機、CT、効果、死体期限は読込時に残りターンへ一度だけ移行し、以後はターン期限だけを保存する。
- `ガード` を1ターン有効な消費型軽減値として実装した。複数ヒットを先頭から吸収し、残量は同じターンの次の攻撃へ持ち越す。プレイヤー側は次のプレイヤーターン開始、敵側は次のエネミーターン開始で消去する。
- 純粋なガード技へ武器威力が誤加算される問題を修正した。`闘気守` は支援対象を選べるようになり、防御判定でガード値を補正し、レオンではAP50消費・ガード50・期限T2を確認した。
- ブラウザ結合試験で、実時間待機中にターンとカメラが変化しないこと、手動ターン終了でT1からT2へ進むこと、ガードの連続ヒット吸収・次攻撃への残量引継ぎ・陣営別期限消去、v2からv3へのセーブ移行、実行時エラー0件を確認した。
- `npm run build:front`、`npm run audit:data`、`git diff --check` を通過。データ監査は21テーブル、606列、未接続0件。

## 2026-09-16 種族別人口成長・領土稼働率・巣経済

- `クラス.json` の `増加条件 / コスト / 資源列` を正本に、プレイヤー拠点と敵巣で共有する種族別人口成長関数を追加した。維持消費は各資源値の2%、通常ユニット1人分、軍隊4人分、強化軍隊5人分とした。
- 通常食料だけ1.2倍代用を許可し、魂・死体は代用不可かつ在庫1個を資源値100として扱う。複数種族の維持消費と成長余剰は必要量比で配分し、1種族1ターン1回だけ人口増加する。
- 種族別成長ゲージ、必要量、維持不足、飢餓段階を状態・セーブへ追加した。人口変動時は進捗率を維持し、人口許容上限中はゲージ加算を停止する。通常食料の成長加算は当該ターン収入から維持消費を引いた正の余剰だけを使用し、既存備蓄を一括消費しない。
- 食料不足4ターン未満の消費50%、人口減少、自然回復停止、能力・技能-15%、AP上限80、資源0時の最大HP5%ダメージと、1ターン1段階の回復を接続した。成長ゲージがそのターンに0になった場合は、次の不足ターンから人口減少する。
- 資源化を人口許容5・雇用枠10・産出2倍、居住化を人口許容15・雇用枠5・産出1倍とし、`min(1, 拠点人口 / 総雇用枠)` を地形産出と施設補正へ接続した。拠点タブへ人口許容、雇用枠、稼働率、種族別ゲージを表示した。
- 敵巣へ縄張り地形収入、全食料在庫、所属個体維持費、種族別人口成長と飢餓を接続した。巣人口をフィールド個体数から分離し、敵死亡時は所属IDだけを外す。初期備蓄は実維持量4ターン分とした。
- ブラウザ試験で人口50の初期領土が人口許容45・雇用枠65・稼働率76.9%になること、魂・死体100換算、上限中のゲージ保持、ゲージ枯渇後の人口減少、飢餓HP/AP、敵巣経済、巣人口独立、セーブ往復一致、実行時エラー0件を確認した。

## 2026-09-16 火山領土被害・溶岩冷却・人口過多

- 領土マスへHP / 最大HPを追加し、正式値未確定の最大HP100を共通設定へ隔離した。既存セーブの領土は読込時に全快状態へ補完する。
- 噴火と新規溶岩到達時に `25 + 噴火元高度Lv × 25` の領土ダメージを適用する。同じターンに同一マスへ重なった場合は最大値1回とし、被災直前の収容人数から直接人口被害を計算する。
- 領土HP率を土地用途別人口許容へ接続した。人口過多中は成長を止め、毎ターン `ceil(超過人口 × 10%)` を流出させ、幸福度・治安の一時補正を拠点状態とUIへ表示する。
- 溶岩ノードごとに発生ターンと2〜4ターンの冷却期限を保存し、冷却後は溶岩判定・描画から除外して地形を荒野へ変更する。冷却期限はセーブ/ロードで維持する。
- 高度Lv3の強制噴火試験で噴火中心と周囲6領土がHP100→0、人口50→5、次の経済処理で人口4・許容0・人口過多4・流出1になることを確認した。3ターン連続進行、カメラ維持、セーブ復元、実行時エラー0件、ビルド、データ監査、diff checkを通過した。
- TODO: 施設HP、損壊施設、保管先別在庫被害、特殊鉱石イベント、領土/施設修復、放棄コマンドは次段階で実装する。

## 2026-09-16 テストモード操作パネル

- テストモードON時だけ管理タブに `テスト操作` を追加した。選択マスの強制噴火、溶岩進行、1ターン進行、拠点資源・人口、選択キャラクターのLv・HP・AP、拠点技能Lv、選択研究EXP、選択領土HPを手動操作できる。
- 強制噴火は選択した陸地マスを対象に固定し、検証中に別マスのランダム噴火が混ざらないようにした。
- ブラウザ試験でテストモードOFF時の非表示、木材85.5→185.5、Lv8→9、領土HP100→75、選択マスの火山化、実行時エラー0件を確認した。
- 敵AI診断を追加し、生存敵の切替、判断と理由、好戦性、索敵、標的、攻撃候補、巣、縄張り、追跡限界、逃走、前回行動、発動待機、CTを表示する。診断は通常AIと同じ索敵・標的・射程・AP・CT判定を読み取り専用で使用する。
- 実データ19体で診断対象の切替を確認し、マンティコアが好戦的・索敵半径2・縄張り内徘徊と判定されること、実行時エラー0件を確認した。
- AI判断ログを勢力別に追加した。敵巣を1勢力、巣なし敵を個体単位として、判断、理由、実行者、対象、位置、診断詳細を各200件保存する。テストモードON時の活動ログモーダルで、自勢力、敵巣、巣なし敵、`isPlayer:false` の国家AIをタブ切替表示する。通常モードでは自勢力ログだけを表示する。
- 実敵AIを1回行動させ、マンティコアの `縄張り内を徘徊` が所属する肉食生物の巣へ1件だけ記録されること、勢力タブ表示、セーブJSON内のログ保持、実行時エラー0件を確認した。

## 2026-09-16 マップ画像レイヤー・敵巣表示

- Phaserの描画順を地形タイル、森林・山岳等の地形画像、拠点・敵巣、ユニットへ整理した。地形画像はタイル内をほぼ満たす大きさとし、森・沼・洞窟は既存画像、画像のない山岳等は拡大記号を使用する。
- `enemyNests[]` を現在視界内だけ巣種別画像で描画し、テストモードON時は全巣を表示する。巣画像と橙色の外周をユニットより大きくして、同じマスへ敵が重なっても巣を識別できるようにした。
- 固定シードの30x30マップで地形画像101件、巣18件、ユニット・敵31件を描画し、深度が地形画像2、巣10、ユニット12であること、飛竜の巣とワイバーンが同じマスで実画像表示されること、ブラウザーエラー0件をPlaywrightで確認した。
- 敵巣の `territoryRadius` を使い、縄張り内で接する辺を除いた外周だけを赤橙色で描画するレイヤーを追加した。通常時は現在視界内の巣だけ、テストモードでは全巣を表示し、未発見部分はFogの下へ隠す。

## 2026-09-16 敵AI Worker化・索敵内戦闘演出

- 敵AIの索敵、標的選択、逃走、移動候補、攻撃候補、待機判断を純粋プランナーへ分離し、Viteのmodule Workerから共通利用する構成へ変更した。敵はID順に処理し、Worker内部の仮状態へ先行行動を反映してから次の敵を判断する。
- WorkerにはAI判断用の軽量状態だけを送り、戦闘、HP/AP/CT、回収、巣搬入、状態保存、UI、Phaserはメイン側へ残した。戦闘・回収後は確定状態をWorkerへ同期する。Worker失敗時は同じプランナーを8行動ごとにyieldするフォールバックを使用する。
- 敵ターン進行を非同期化し、右通知欄へ処理件数と進捗率を表示する。TEST計測へWorker計算時間、メイン反映時間、Worker経路全体、フォールバック有無、演出件数を追加した。
- 索敵内の敵攻撃をイベントキューへ保存し、状態確定後にカメラ移動、既存1.5秒攻撃エフェクトを順番に再生する。標的追跡中の移動だけを移動演出対象とし、通常徘徊と索敵外イベントは演出しない。
- 319体負荷試験では全319体が行動し、最終計測はWorker計算約483ms、メイン反映約6.1秒、全体約11.3秒だった。10msのUIタイマーは322回進み、最大停止は約307msで、変更前に確認された約10.8秒の連続停止を解消した。
- 30体のWorker経路と強制フォールバック経路で位置、AP、逃走状態、行動済みターンが完全一致した。敵19体の通常ターンは敵処理約303ms、ターン全体約967msで全フェーズを完了し、単体戦闘ではダメージ、カメラ移動、エフェクト、行動済み状態を実ブラウザで確認した。

## 2026-09-17 敵巣の食料不足探索AI

- 巣の種族別人口状態が通常消費換算4ターン未満になると、所属1体は0体、2〜3体は1体、4体以上は基本2体を探索役へ割り当てるようにした。基本数を超える動的増員条件は未確定のため未接続。
- 探索範囲を縄張り半径+2から開始し、探索役が外周へ到達しても候補がない場合は次回準備時に+2する。戦闘・逃走・地上物資回収を優先し、それ以外では未訪問マスを優先して探索する。
- 通常の索敵判定を使い、地形、他勢力領土、拠点、巣、確認済みユニット、食料候補を探索役に保持する。他勢力の食料在庫がある領土と地上食料は、`クラス.json` の種族別消費資源に合うものだけを候補にする。
- 食料候補発見時または不足解消時は所属巣へ帰還し、帰還した時点でのみ探索情報を巣の既知情報へ統合する。探索役・探索半径・個体情報・巣既知情報は通常セーブデータで保持する。
- 純粋関数試験、Viteビルド、データ監査、標準ゲームクライアント、実ブラウザ3ターン試験を実施。探索役2体、索敵情報、帰還切替、帰還報告、セーブ/ロード復元、ブラウザーエラー0件を確認した。
- TODO: 不足深刻度による探索役増員、動物・モンスター同士の通常戦闘を接続する。

## 2026-09-17 敵AIの領土略奪と運搬上限

- 巣へ帰還して報告された `food-territory` を、食料不足時の後続略奪対象へ接続した。襲撃担当は対象領土まで移動し、使用可能な `行動A` で領土HPを攻撃する。
- 領土HPが0になると、そのマスの土地用途・稼働率・施設補正を含む通常食料産出3ターン分を算出し、敵部隊 `cargo` へ積載する。略奪済み領土は再略奪を拒否し、所有者の通常収入から除外する。
- 個体上限 `100 × (SIZ / 170)` の生存部隊員合計を部隊運搬上限とし、超過分は保持しない。満載または略奪完了後は所属巣へ帰還し、巣到着時に在庫へ自動搬入する。
- 襲撃任務中の再観測で `raid` が `return` に上書きされる不具合を修正した。テストモードで領土HPを1以上へ戻した場合は襲撃済み印も解除するが、通常プレイの資材修復処理は引き続き未実装。
- Viteビルド、データ監査、食料探索・経済・物流回帰試験、実ブラウザの直接略奪とWorker AIターン試験を通過した。HP1→0、産出3ターン分27.6、容量100で超過破棄、再略奪拒否、巣への全量搬入、略奪状態と運搬品のセーブ復元、ブラウザーエラー0件を確認した。
- TODO: 不足深刻度による探索役増員、動物・モンスター同士の通常戦闘、通常プレイ用の領土修復処理、巣規模拡大・巣立ちを接続する。
# 2026-09-17 巣成長・競合戦闘・領土修復

- 巣なし敵の未設定中心座標が `(0,0)` と解釈される問題を修正し、現在位置基準・縄張りなし表示へ変更。
- 敵AIの逃走閾値を設定ファイルへ集約し、好戦的10%、非好戦的30%へ変更。非好戦的は巣防衛または被攻撃時だけ反撃状態になるよう調整。
- 初期巣の縄張り半径を2へ統一し、表示名を `種族名の巣1...` の数値連番へ変更。
- テストモードの敵AI診断へ所属巣名・巣ID・距離を追加。
- プレイヤーと共通のJSON生成費を使う巣ユニット生成、周囲満員時の出現待ち、食料不足時停止を追加。
- `施設.json` の規模段階、90%判定、50%分岐、人口・食料25%移送による規模拡大・巣立ちを追加。
- 縄張り衝突中の別巣を戦闘対象へ追加し、同種吸収、異種巣破壊、備蓄の戦利品化を追加。
- 領土の一斉修復・自動修復、敵と溶岩による阻害、比例資材消費を追加。正式な領土拡張費は未定義のため修復費基準は暫定定数。
- `npm run build:front` と `artifacts/check-v39-nest-growth-repair.mjs` を通過。
- 2026-09-17: `スキル一覧.json` の `効果=蘇生_Lv-N` を戦闘処理へ接続。フィールド上の自軍死亡者だけを対象に、成功時はLvをN低下させて `回復` 値のHPで復活し、低下後Lvが0以下の場合はHPを回復せず蘇生しない。魔法待機・AP・CTと死亡履歴を既存のターン制処理へ統合し、ブラウザでLv10→5/HP75の成功、Lv5対象の失敗時HP0/AP未消費、実行時エラー0件を確認。`npm run audit:data` と `npm run build:front` 成功。
- 2026-09-17: 優先残件の実装を開始。敵巣の探索情報・探索役・食料不足/回復段階・待機個体・縄張り・所属・逃走状態のセーブ往復を確認。命中/回避式とHitごとのMiss表示、部隊長・統治者・拠点担当者の死亡時引継ぎ、拠点別の幸福度・不満度・治安と不満度による産出補正を追加。暫定調整値は `v39-gameplay-balance.js` へ集約。`npm run build:front` 成功、ブラウザ試験エラー0件。
- 2026-09-17: 反乱時に拠点人口を減らし、減少人数を保持する反乱軍を敵として生成する処理を追加。反乱軍は元所属勢力を優先して攻撃可能な領土へ進軍・攻撃し、低HPや既存逃走状態に関係なく逃走しない。発生閾値と人口率・再発間隔は未確定値として `v39-gameplay-balance.js` へ隔離した。Viteビルドと実ブラウザ試験を通過し、反乱生成、人口減少、HP1での領土攻撃、逃走状態解除、ブラウザーエラー0件を確認した。
- 2026-09-17: 不満度・治安・幸福度の残る数値を暫定決定し、`v39-gameplay-balance.js` へ集約。異種族混在、火山災害、占領状態値、領土警備を内政目標値へ接続し、不満度65以上・治安40以下の人口2%流出を追加した。反乱条件成立時は人口流出を重複適用しない。
- 2026-09-17: 内政ターンの実ブラウザ試験で、人口100から2人流出、追加種族-2、災害-10、警備+9、反乱クールダウン中の非発生、前回反乱ターン保持を確認。反乱軍はWorker経路でフォールバックなし・エラーなしの領土攻撃と移動を再確認し、`npm run build:front` と `git diff --check` を通過した。
- 2026-09-18: `v39-gameplay-balance.js` の後で調整する数値へ、日本語の用途・単位・影響範囲コメントを追加。変数名は既存参照を壊さないため維持し、数値だけを変更して調整できる状態にした。`npm run build:front` と起動画面のPlaywright確認を通過。
- 2026-09-19: `都市基本データ.json` に存在しない `軍隊Lv補正` 行を必須にしていた誤りを修正。通常軍隊の軍事Lv補正は `v39-gameplay-balance.js` の `V39_MILITARY_UNIT_LEVEL_BALANCE` へ移し、基本人数・HP・攻撃回数は既存の `分類=ユニット作成 / army` 行を使用する。現行のLv1・Lv2は倍率1.0で既存値を維持する。
- 2026-09-19: 部隊タブの自キャラ・ユニット作成ボタンをアイコン専用に変更。ホバー・フォーカス・タッチ中に説明を表示する。長押し用のグローバルイベント抑止は既存クリックと競合したため使わない。
- 2026-09-19: 部隊タブ内のユニット作成で、非表示にした部隊一覧が旧CSSにより高さを占有していたため、作成中は部隊タブ直下の一覧要素を明示的に非表示にし、ユニット作成パネルを部隊表示領域全体へ固定した。
- 2026-09-21: Excel再出力後、`テストゲーム状態.json`の地形術試験官が参照する`ジオマンサー`行が`クラス.json`から欠落して起動全体を停止していた。テスト状態のクラス定義欠落ユニットだけを除外して起動を継続し、コンソールへ種族・クラス・不足定義を出力するよう変更。地形変換テストを復帰するには、Excelのクラス表へ`ジオマンサー`行、スキル表へ地形変換スキル行を追加する必要がある。

- 2026-09-24: 地形、高低差、Fogの静的`Graphics`を半解像度の`RenderTexture`へ焼き込む共通キャッシュを追加。キャッシュ再生成は地形更新、高低差表示変更、Fog可視範囲更新時のみで、ユニット、河川、選択枠、索敵境界は従来どおり動的描画のまま維持する。60x60負荷ベンチマークで全体FPSは28.1から52.7へ改善し、ブラウザで元`Graphics`が非表示・コマンド0、各キャッシュが表示されることとFog再描画を確認。`npm run build:front`、`npm run audit:data`を通過した（未接続6件はテストクラスのみ）。
- 2026-09-24: 視界レイヤーを描画結果の署名で分離した。選択・研究・資源更新などで視界入力が同じ場合はFog/索敵/領土境界を維持し、ユニット索敵値だけが変わる場合も探索済みFogの`RenderTexture`を再利用する。索敵探索のキューも`shift()`を廃止して線形走査に変更した。
- 2026-09-24: マップ上の拠点・巣・ユニット・敵マーカーを表示用署名で更新し、無関係なゲーム状態変更時のコンテナ全破棄・再生成を停止した。地形アイコンも地形/特殊地形の表示対象が同一なら、溶岩等の`field-data-updated`で再生成しない。60x60・味方40・敵40・溶岩120のブラウザ負荷試験で、無関係更新時のFog・マーカー・地形アイコンの再利用、選択/索敵変更時の必要更新を確認し、全体58.0 FPS、実行時エラー0件を確認した。
- 2026-09-24: 一般村の初期数を面積比例ではなくゲーム開始設定へ移した。既定2、0〜8件で設定・保存・ロードでき、全初期拠点の設置完了後に配置する。種族は未指定かつ中心地形適性の一致を優先し、`人間` と `只人` を同一種族としてプレイヤー使用済み判定する。60x60実ブラウザ試験で一般村2件、プレイヤー種族との重複なしを確認した。
- 2026-09-24: 一般村マーカーを通常拠点と区別した。未探索の一般村はFogで隠し、発見後は既存の`村`画像を中心マスに表示する。テストモードでは未探索でも全一般村を表示し、60x60実ブラウザ試験で2件の村マーカーと縄張りを確認した。
- 2026-09-24: 一般村数を`0`に指定してもループ先頭で1村を生成してしまう境界不具合を修正した。`0 / 2 / 3`件の設定値、プレイヤー種族との重複回避、開始設定画面の既定値`2`、テストモードでの村マーカー表示を60x60実ブラウザベンチマークの必須判定へ追加した。Viteビルド、データ監査、描画ベンチマーク、通常のPlaywright画面生成を通過し、実行時エラー0件を確認した。
# 2026-09-26

- シングル通常プレイの初回統治者設定を、マップ生成後ではなくゲーム開始設定の前へ移動した。v39起動ページでは全体の`App.vue`を重ねず、`RaceSelectModal.vue`、`ClassSelectModal.vue`、`CharacterNameModal.vue`だけを`V39InitialSovereignFlow.vue`として独立マウントする。
- 選択済みプロフィールはゲーム開始設定の生成時に`player-1`へ反映してからフィールドを生成する。2勢力目以降の統治者作成は、既存の初期配置フローから同じVueモーダルを開く。
- マルチプレイのロビー種族選択とゲーム開始後のクラス・名前選択も同じVueモーダルへ接続した。`npm run check:play-mode-select` と `npm run check:multiplayer-start-flow` で、通常・テスト・通信導線、統治者作成、初期拠点配置、ブラウザー例外0件を確認した。
- `#characterModal` は `v39-character-modal.js` が `innerHTML` で描画する実画面であることを確認。`window.openV39CharacterModal()` を表示APIとして追加し、ヘッダー・モバイルメニューのキャラクターボタンから必ず再描画して開くようにした。ゲーム状態未初期化時も空白にせず案内を表示する。

- 2026-09-28: 火山以外の災害とアンデッド自然発生の暫定ターン処理を追加した。災害は `災害.json` のIDをキーにし、正式な数値列が未追加の間は `V39_PROVISIONAL_DISASTER_BALANCE` を使用する。発生中の災害、継続効果、発生履歴は `worldEnvironment` に保存し、セーブ・ロードで復元する。TEST ONでは選択マスへ災害またはアンデッドを強制発生できる。一般村の選択マス情報には、住民と守備軍を含む `必要物資(1T)` の確認表示を追加した。検証: `npm run build:front`、`npm run audit:data`、`git diff --check`。

- 2026-09-29: 人口構成から算出する農業・林業・漁業・工業の技能倍率を、通常土地・発見資源・単体土地の収入へ接続した。対応技能は`都市基本データ.json`の資源行を正本とし、稼働率と施設補正に乗算する。TEST ONの一般村拠点情報へ、7マスの推定産出、必要物資、不足候補、得意資源を追加した。一般村の実在庫・消費・人口変動は変更していない。選択イベントの座標をテストツールでも保持するよう修正し、再描画後の選択情報が消える経路を解消した。検証: `npm run build:front`、`node scripts/check-v39-neutral-village-economy.mjs`、一般村守備・勝利条件回帰試験。

- 2026-10-01: 勝利対象土地を初期拠点配置後に生成するよう変更し、実際の全開始拠点から遠い候補だけを採用するようにした。候補数は長辺36以下=1、60以下=2、72以下=3、83=4。対応する地形の連結地域、太陽の山・星の火口の高地、宇宙の海の低地、候補間の距離を検証してから決定する。高地帯は山岳・丘陵・火山を一体として広さを測る。守護者は候補地生成完了イベントから追加する。検証: `npm run build:front`、`npm run check:victory-landmark-placement`、`node scripts/check-v39-victory-landmarks.mjs`、`node scripts/check-v39-victory-guards.mjs`、`node scripts/check-v39-victory-conditions.mjs`、`node scripts/check-v39-faction-ai-objective.mjs`。
- 2026-10-01: 勝利対象土地の高地条件が高度Lv2かつ距離優先だったため山裾へ配置される問題を修正した。太陽の山・黄昏の樹・星の火口は高度Lv3以上とし、開始地点との距離条件を満たす候補の中で最高高度を最優先する。黄昏の樹は高地へ連続する広い森林に限定し、宇宙の海は従来どおり低い海域を優先する。固定シード試験では太陽の山が36/60/72/83マップで高度Lv5/5/3/5となり、候補数、守護者、表示、勝利判定を維持した。
- 2026-10-01: 勝利対象土地の種類と必要地形をマップ生成前に確定し、その計画を地形生成器へ渡す順序に変更した。太陽の山は山岳帯、黄昏の樹は高地森林、星の火口は火山を中心とした山岳帯を必要連結数まで生成し、宇宙の海は島生成時の深海域を使う。正確な座標は全初期拠点の配置後に距離条件を加えて確定する。36/60/72/83マップで事前計画・生成地形帯・最終配置の対象ID一致、表示、守護者、勝利判定、NPC目的選択、実画面を確認した。
- 2026-10-01: マップ最大サイズを83×83から100×100（10000マス）へ拡張した。83×83は最大級として選択肢を維持し、標準・推奨は36×36のままとする。100×100固定シード試験で勝利対象4種類、必要地形帯、高度Lv5〜6、深海Lv-8、開始地点距離69〜146マス、ブラウザーエラー0件を確認した。
- 2026-10-01: 実際の勝利対象を地形だけで判別できないよう、全マップへ4種類すべての成立地形を生成するよう変更した。太陽の山は半径2・19マスの山岳帯中央をマップ最高高度Lv+1、星の火口は半径2・19マスの山岳帯中央と隣接3マスを火山、黄昏の樹はマップサイズ別に半径4〜7・61〜169マスの高地森林中央、宇宙の海は深海域を使う。実際の対象件数、マーカー、守護者、勝利判定は従来の選択対象だけに付与する。36/60/72/83/100固定シード試験、表示、守護者、勝利判定、NPC目的選択、ビルド、起動画面を確認した。
- 2026-10-01: 勝利対象土地を大都市相当へ変更した。本体は中心＋周囲6マスの7マスを占有し、その外側2リングを含む半径3・37マスの成立地形を必須とする。占領時は本体7マスを一括領土化し、勝利判定も7マスすべての支配を要求する。守護領域は半径3、画像は既存の大都市表示サイズ78pxを使う。36/60/72/83/100固定シード配置、守護撃破後の領土化、勝利判定、表示、NPC目的選択を確認した。
- 2026-10-01: 勝利対象用地形の整った六角形と進入不能な高低差を修正した。全対象で半径3・37マスの必要核を維持しつつ外縁を不規則化し、太陽の山・星の火口は56マス、黄昏の樹は61〜169マスのランダム輪郭にした。黄昏の樹は中心37マスが必ず森林であることを保証する。高地型は中心から1リングごとに高度Lvを1段下げ、対象外側まで麓を延ばした。36/60/72/83/100固定シードで必要地形、外縁の張り出し、高度差1以内の進入経路を確認した。
- 2026-10-01: 100×100の既定多島海だけ島面積目標を1.2倍にした。島シード数74個は維持し、陸地目標率を従来28〜40%から33.6〜48%へ拡大する。固定シード試験では倍率1.2、目標陸地率43.4%、生成後15島、平均288.9マスを確認した。カスタム島設定は変更しない。
- 2026-10-01: TEST ONのテスト操作パネルが操作ごとの全再描画で先頭へ戻る問題を修正した。再描画前のスクロール位置を保持し、DOM更新直後と次フレームで復元する。モバイル幅の実ブラウザ試験でHP変更前後とも420pxを維持し、操作成功・ブラウザーエラー0件を確認した。
- 2026-10-01: `クラス.json` の現行仕様（系統別の`種類`、`合計Lv`、`条件クラス`、`条件スキル`、`条件施設`）へ初期統治者、ユニット作成、クラス変更、人口処理、詳細表示を追従させた。表内の区切り・説明行は共通データ登録時とExcel変換時に除外し、`#N/A`は参照値として扱わない。生成JSONは手修正していない。検証: `npm run build:front`、`npm run check:class-schema`、`npm run check:play-mode-select`、`npm run audit:data`、汎用Playwright起動、`git diff --check`。
- 2026-10-01: 基礎クラスを `V39_BASE_CLASS_NAMES` の12件（ファイター、ナイト、フェンサー、モンク、シーフ、レンジャー、アーチャー、ウィザード、アルケミスト、クレリック、パラディン、ドルイド）へ固定した。初期統治者、通常ユニット作成、一般村初期職は同じ定数判定を使い、条件4列が空の上位クラスを初期候補に含めない。検証: `npm run build:front`、`npm run check:class-schema`、`npm run check:play-mode-select`、実画面確認。
- 2026-10-01: 勝利対象土地の表示を、旧汎用アイコンから `太陽の山 / 黄昏の樹 / 星の火口 / 宇宙の海` の専用画像へ変更した。中心マスへ画像1枚を配置し、本体の中心＋周囲6マスの外接範囲（現行タイル設定で186×186px）を覆う。通常プレイでは未発見対象を描画せず、TEST ONだけ未発見画像を不透明度60%で表示する。最新ビルドの一時サーバーで専用テクスチャ、表示寸法、透過率、通常時0件、実画面を確認した。
- 2026-10-01: 自領地を選択した状態で土地タブから開始できる `居住化` ボタンを追加した。開始後は既定2ターンで土地用途を居住化へ変更し、進行中・完了済み・他勢力領地などはボタンを無効化して理由を表示する。全拠点の変換待ちを通常の経済ターンで進行させ、完了ログも記録する。検証: `npm run build:front`、`npm run check:settlement-development`、`npm run check:local-session`、実画面確認、`git diff --check`。
- 2026-10-01: 拠点発展後も世界側の拠点一覧に旧 `scaleKey` が残り、町へ発展しても村画像が描画される問題を修正した。発展完了時に規模キー・規模Lv・占有マップを世界拠点へ同期し、同座標に古い複製がある場合も選択中拠点の最新状態を優先描画する。町への発展後に占有2マス、`町`テクスチャ、ローカル複数勢力進行を自動確認した。現状仕様メモに残っていた人口自動昇格の旧記述も手動発展仕様へ統一した。
- 2026-10-02: v39の拠点画像が規模にかかわらず中心1マスへ固定表示されていたため、居住クラスターの占有マス中心座標から重心と外接表示サイズを算出するよう変更した。町は横2マスへ `町` 画像1枚を119x57pxで表示し、都市3マス・大都市7マスも実際の占有形状全体へ画像1枚を広げる。占有マップ変更も描画署名へ追加した。ビルド、拠点発展試験、実画面の拡大スクリーンショットで確認した。
- 2026-10-02: v39の人口許容が土地用途の `+5/+15` しか計上せず、町の2マス占有や `施設.json` の `1マス収容人数` を無視していた経路を修正した。人口許容を「全領土の土地用途分 + 拠点規模の1マス収容人数×実占有マス数」とし、拠点画面へ土地分・規模分の内訳を表示する。町2マスの試験では130、追加マス資源化で135、居住化完了で145になること、ビルド、ローカルセッション、汎用Playwright起動、ブラウザーエラー0件を確認した。規模下限人口と収容力の表計算側バランス調整は未確定タスクとして残す。
- 2026-10-02: 居住化マスを資源化マスと視覚的に区別する暖色の敷地区画レイヤーを追加した。元の地形、高低差、森林・山画像は維持し、居住化完了または資源化への変更に合わせて再描画する。居住化中は「居」と残りターン、完成後は「居」を表示する。施設は専用画像が未整備のため、建設中は施設名の頭文字と残りターン、完成後は頭文字だけを対象マスへ表示する。農場の「農」、居住化中の「居」、完成居住マス5件を自動試験と実画面で確認した。
- 2026-10-02: 施設を1マス1施設へ制限した。完成施設または建設中施設が存在するマスでは新規建設を拒否し、既存セーブの施設データは削除しない。マップ上の施設文字マーカーも各マス1件だけ表示する。
- 2026-10-02: `建築_アイコン一覧1.webp / 建築_アイコン一覧2.webp` を各4列×3行のスプライトシートとして読み込み、24施設を施設名から対応フレームへ割り当てた。完成施設は通常画像、建設中は半透明画像と残りターン、未対応施設は従来の頭文字を表示する。農場が `facility:農場` フレーム・29pxで描画されること、拠点発展・海上拡張・ブラウザーエラー0件を自動試験と実画面で確認した。
- 2026-10-02: 施設画像を村画像と同程度の60pxへ拡大した。拠点占有マス以外の居住化完了マスは「居」の文字ではなく既存の村画像を60pxで表示し、町・都市・大都市の本体画像は従来仕様を維持する。農場と追加居住マスがともに60pxで描画されることを自動試験と実画面で確認した。
- 2026-10-02: 施設アイコンをマス中央へ移動。土地タブで居住化解除（資源化へ2ターン）を追加し、拠点占有・発展工事中マスは解除不可とした。居住化完了時に完成施設・建設待ち・施設HP・拠点施設効果・世界施設一覧を撤去し、居住化済みと用途変更中の施設建設を拒否する。実ブラウザの拠点発展試験で撤去、建設禁止、解除、村画像消去を確認し、ビルドと試験が成功、例外0件。

- 2026-10-02: 施設と居住地の相互変更・居住化解除に確認ポップアップを追加。居住地から施設への建設禁止を、確認後に置換可能な方式へ更新した。@game_dataの施設シートへ土地用途列と入力規則を追加し、原本のXLSXから施設.jsonを再生成。施設マスは居住化の人口許容+15・雇用5・基礎産出1倍、既存の対応技能100で施設補正2倍。キャンセル時に資材や工事が変わらないこと、兵舎の建設・撤去・居住化解除、農場補正2倍をブラウザ試験で確認。ビルド、データ監査、差分検査成功、ブラウザ例外0件。

- 2026-10-02: UI文字サイズをv39-typography.cssへ集約。PC15px・スマホ12pxと表示倍率から通常文字・補助文字・見出し・既存サイズ段階を算出し、43ファイルの固定px指定を共通変数参照へ変更した。v39-readable-fonts.jsの後付け補正を描画元へ移し削除。PC/スマホ、倍率120%、基準変数の変更、後付けstyle不在、建設ターン進行を自動検証。ビルドと拠点発展回帰試験が成功、ブラウザ例外0件。

- 2026-10-02: スマホで補助文字が6.4pxまで縮む問題を修正。共通文字変数にPC11px・スマホ10pxの可変下限を追加し、行動名を通常文字サイズへ変更。行動カードを名前・威力/AP・射程の3行に整理。実ブラウザでPC/スマホ、下限、行動名/AP、倍率変更、建設進行を検証し例外0件。

- 2026-10-02: ヘッダーと資源内訳の増減表示を整数へ四捨五入。内部の資源値は変更しない。負数も絶対値で丸め、-0を0表示へ統一。PC/スマホの実ブラウザ試験で-57.599999999999994→-58、17.6→+18、-0.4→0、8.5→+9を確認。ビルド成功。

- 2026-10-02: マス上の建築・居住化の残りターン文字をタイル幅12%から18%へ1.5倍に拡大。マップ表示設定へ文字比率・縁取り幅・テクスチャ解像度を集約し、縁取り2pxと解像度2で潰れを軽減。実描画11.16px・12T表示の画面・拠点発展回帰試験・ビルド成功を確認。

- 2026-10-02: 建築・居住化のターン文字をさらに18%から24%へ拡大（初期の2倍）。実描画14.88px、12T表示と拠点発展回帰試験、ビルド成功を確認。

- 2026-10-02: ターン文字をタイル幅30%（初期の2.5倍）へ拡大。文字の濃色背景・余白を追加し、縁取りを1pxへ縮小して施設や枠線との同化を軽減。実描画18.6px・12T表示の画面・回帰試験・ビルド成功を確認。

- 2026-10-02: 領土線がターン文字の上を通って潰れる原因も修正。文字を専用depth18レイヤーへ移し、領土線・選択枠より上に描画。実画面と回帰試験で確認、例外0件。

- 2026-10-02: 居住化工事中は村画像を50%半透明で表示し、中央少し上へ🔨2T形式の残りターンを表示。撤去予定施設の画像を隠し、完成後は通常の村画像へ戻す。施設建設も同じ形式を使用。半透明率・位置・表示文字・完成遷移・実画面・ビルドを確認し例外0件。

- 2026-10-02: 死亡後も保存済みAI移動演出で死体が動く経路を修正。最新状態で死亡した敵の移動演出と行動計画適用を停止し、statusName死亡も判定。HP0・負のHP・死亡状態の敵の座標/AP維持と、生存敵の移動演出継続を実ブラウザで検証。ビルド成功、例外0件。

- 2026-10-02: 峡谷の表示を既存の渓谷.webpへ変更。索敵未準備時の敵・他勢力ユニットの表示を禁止し、一般村守備兵を発見判定へ追加。勝利対象アイコンをテスト設定・視界更新時にも再描画し、TEST OFF後の残留を解消。通常/テスト切替、操作勢力切替、未準備時の非表示、実画像テクスチャ、勝利対象の発見・セーブ回帰、画面とビルドを検証。例外0件。

- 2026-10-02: 調査を土地からキャラの行動一覧へ移動。残りAPを全消費して累計100APで結果待ち、足りない進捗は同じキャラで次ターン以降に継続。必要APをバランス変数へ集約。土地側は結果・残留品回収を維持。AIも部分調査を継続可能に。AP40→40%、未完了保持、AP70→100%・残AP0、結果確定、AP0禁止、現在地への操作、勝利対象発見・NPC探索回帰と画面・ビルドを検証。例外0件。

- 2026-10-02: 同じ攻撃の再押下で解除できず再選択していた処理を修正。別行動・非攻撃技への切替でも対象選択と強調を解除。調査不可時もクリックを受けて攻撃を解除し理由を表示、AP消費仕様は維持。実マウスクリックで調査発動/AP0・同じ攻撃解除・移動/待機/非攻撃技/調査への切替・調査不可理由を検証。調査進捗回帰、画面とビルド成功、例外0件。

- 2026-10-02: 待機はAPを保持し、そのターンの移動・攻撃・調査を終了する方式に変更。ターン終了時の未行動確認を表示設定へ追加（初期ON、OFFを保存）。未行動ならターン進行を止めて選択とカメラを合わせ、待機・死亡・AP0・行動済み・発動待機は除外。一括テスト進行は確認省略。表示設定の重複管理・getter上書きを除去して一本化。待機AP保持/行動禁止、順次フォーカス、次ターン解除、OFFと再読込保持、PC/スマホ設定・一括進行、調査と行動切替回帰、ビルド・画面を検証。例外0件。

- 2026-10-02: @game_data施設シートへ船着き場と必要拠点段階・採取資源/範囲・改築元/短縮ターンを追加し、XLSXから施設.jsonを再生成。港は町以上・範囲2、船着き場は村以上・範囲1で建築1ターン/経済Lv1を仮設定。改築短縮値は船着き場の建築時間を数式参照。既存の原本変更（生産施設4種の土地用途=資源化）も生成結果へ反映。数式と入力規則のAPI読み戻し、変換dry-run/生成、データ監査と差分検査成功。新項目のゲーム接続・周辺漁業・改築は未実装、隣接港+20%は未確定として資料へ記録。

- 2026-10-02: 船着き場・港の採取資源/範囲を周辺水域の拠点自動収入と設置マス収入へ接続。地形JSON産出、人口稼働率・技能・施設・災害・HPを反映。領土との二重取得、同勢力内複数拠点/施設の重複、同ターン完成時の重複を防ぐ暫定ルールを資料へ記録。建設中/破壊済み/略奪済みは採取不可。新列を施設ステータス効果から除外。漁業ブラウザ試験・ビルド・データ監査成功。旧拠点試験は未行動確認と原本更新済み農場用途の期待値が古いため、その2点を調整した一時コピーで回帰成功。必要拠点段階・改築・隣接港補正は今回未接続。

- 2026-10-02: 拠点タブへ輸送用の軍隊ユニット指定・解除を追加。対象は生存軍隊かつ拠点中心/付属占有マス内、ヒーロー・ネームド・死亡・拠点外は新規指定不可。個体にoriginSettlementId/status=awaiting-route/assignedTurnを保存し、通常部隊移動から除外、本人の手動移動は単独扱い。拠点外でも元の拠点から解除でき、積載物/所属/APは指定で変更しない。PC/スマホUI、移動からの除外・復帰、貨物保持、セーブ/ロード保持のブラウザ試験・ビルド成功。集積所・採取・経路設定・自動往復は未実装と画面/仕様/タスクへ明記。

- 2026-10-02: 拠点間の自動往復輸送を実装。拠点「輸送」で同一プレイヤーの搬入先・JSON由来資源を指定し、担当ターン終了時の残りAPで積込→搬入→空荷帰還を繰り返す。運搬上限、通常地形/高度差/世界端/マス占有、在庫待ち、通行待ち、処理済みターン、停止・再開へ接続。個別荷物は既存 cargoByUnitId を使い、共有cargoを分配せず、死亡時は死体へ移す。停止時の拠点内荷下ろしと、荷下ろし後再開で積み直さない不具合も修正。集積所・採取は未実装のまま明記。検証: build:front、check-v39-auto-transport（木材250保存・複数往復・AP・途中ロード・停止再開・通行不能・死亡）、既存transport-assignment/wait-focus、標準web_game_playwright_client成功、PC/440pxスクリーンショット確認、pageerror 0件。
- 2026-10-02: 領土外の森・洞窟での手動採取を追加。キャラ行動に採取カードを配置し、地形.json産出と都市基本データ.json分類から資源を取得、既存収入スケールの基礎1ターン分を積載する。暫定AP100はV39_GATHER_BALANCE.apCostへ集約。部隊共有/単独/輸送指定の個別cargo、運搬上限、帰還搬入へ接続。採取済みターンを探索データに保存し、全プレイヤー共通1マス1ターン1回としロード後の二重取得を防止。自領/他領の二重収入、死亡、待機、調査中、自動輸送中、AP不足、満載を拒否。集積所・採取地点自動往復は未実装と明記。検証: build:front、check-v39-gather（森・洞窟・AP・容量・搬入一回・個別積載・保存復元・他プレイヤー重複拒否）、既存survey-ap/auto-transport/wait-focus、標準web_game_playwright_client成功、PC/440pxスクリーンショット確認、pageerror 0件。生成JSONは変更していない。
- 2026-10-02: 初期拠点の候補評価と序盤敵Lv帯を実装。マス選択後に安全半径・序盤Lv・出現種族候補・11マス付近の通常敵Lvを表示し、設置ボタンで確定する（PC/スマホ共通）。生成と評価は同じ出現敵JSONとLv選択関数を使用。V39_START_AREA_BALANCEで安全4/序盤10/Lv1〜3を集約。JSONにLv1〜3候補がないため最低Lv帯の種族のみ開始拠点周辺で序盤個体化しbeginnerAdjustedを保持、遠方のJSON Lv範囲は変更しない。序盤圏の強敵マーカーを通常個体化し、配下にも距離制限を適用。既存APIの直接配置・マルチ設置リクエストは維持。検証: build:front、check-v39-start-area（設置前確認・設置ボタン・高度8の近傍低Lv化・安全圏・遠方通常Lv・複数拠点・世界端折返し）、wait-focus、標準web_game_playwright_client成功。PC/440pxスクリーンショット確認、pageerror 0件。永久安全地帯・勝利守護者・自然発生の排除やキャラ/軍隊初期Lvの変更は行っていない。
- 2026-10-02: 初期配置プレビューをマップ上から footer-body の専用画面へ移動。配置可能な低地候補を最大3件提示し、選択時に実際のタイル選択処理で選択枠・カメラを更新する。高度の配置制限は未確定で追加せず、既存の有効マスも選択可能。拠点追加・勢力切替・新規マップで候補を再生成する。非ラップ地図の境界も配置条件へ反映。build:front、check-v39-start-area、標準Playwrightクライアント成功。PC/440px幅の下部表示・設置確認・海で設置不可・初期敵Lv・複数拠点ラップ距離を確認、ブラウザー例外0件。

- 2026-10-02: 序盤敵Lv範囲を半径10から8へ変更（初期敵なし半径4は維持）。初期配置は低地候補3件と周囲1マスの有効マスだけに制限し、入力・設置・通信ホストの共通配置APIで同じ判定を使う。選択範囲を薄水色で表示し、終了時に消す。候補周囲半径は暫定の placementRadius に集約。自動配置も同じ候補を利用。build:front、check-v39-start-area、標準Playwrightクライアント成功。候補外クリック不変・直接設置拒否・隣接マス配置可・二勢力自動配置・周囲8マスLv・PC/スマホ表示を確認し、ブラウザー例外0件。

- 2026-10-02: 初期配置の候補周囲半径を暫定2マスへ拡張。選択範囲外だけを72%黒で暗くする反転GeometryMaskを追加し、全マス分の描画や新しい大判テクスチャは増やさない。配置中は通常Fogを停止し、終了時に通常Fogを再生成する。選択範囲表示は探索履歴を変更しない。範囲半径と暗さはV39_START_AREA_BALANCEで調整可能。build:front、check-v39-start-area、check-v39-map-visibility、標準Playwrightクライアント成功。PC/スマホで表示確認、2マス先可・3マス先不可・範囲外設置拒否・探索履歴保持・配置後Fog復帰を確認。

- 2026-10-03: 初期配置範囲の自動表示を修正。シーンcreate途中の通知を初回POST_UPDATEへ移し、候補クリック前からマスクと選択可能範囲を描画する。未実装の描画APIに対して表示済み扱いにしない。範囲外は黒く隠す設定へ変更。高度同値の走査順による左上集中を廃止し、選択範囲が端で切れにくい有効な低地を優先、同条件なら中央寄りかつ候補範囲が互いに重ならない場所を選ぶ。build:front、check-v39-start-area、check-v39-map-visibility、標準Playwrightクライアント成功。クリック前の範囲表示・確定ボタン無効・候補の端偏り防止・PC/スマホ・配置後Fog復帰・複数勢力自動配置を確認し、ブラウザー例外0件。

- 2026-10-03: 初期配置の範囲外を完全な黒ではなく地形が見える72%の暗さへ戻し、候補数を暫定最大20件へ拡張。配置条件と候補間隔は維持し、有効地が不足する場合は20件未満とする。下部一覧は既存スクロールを利用。build:front、check-v39-start-area、標準Playwrightクライアント成功。スマホで多数候補表示・範囲外地形の視認・クリック前表示・配置制限・設置・複数勢力自動配置を確認。

- 2026-10-03: 初期配置の範囲外表示を現行v39の通常Fogと同じ色・透明度へ統一。phaser-map-panel-config.jsのV39_FIELD_FOG_STYLEを両方で参照し、専用placementOutsideAlphaを削除。通常Fogの既存見た目は変更しない。build:front、check-v39-start-area、check-v39-map-visibility、標準Playwrightクライアント成功。

## 2026-10-03 初期敵Lvバランス
- 通常敵の初期上限Lv15、ボスLv20〜25、極端高度（暫定±7以上）Lv30をV39_ENEMY_LEVEL_BALANCEへ集約。開始拠点周囲の安全範囲とLv1〜3帯は維持。
- 勝利対象守護者Lv40・配下Lv38。守護者の種族候補も通常敵と同じ有効出現定義を使用し、存在しないクラス参照で生成されない問題を修正。
- クラス追加候補: ホース・ボア・ドレイク。出現地形未決定のため生成JSONは変更しない。
- 検証: build:front、check-v39-enemy-level-balance.mjs、check-v39-start-area.mjs、標準web_game_playwright_client成功。Lv各帯と開始範囲を実ブラウザで確認、pageerrorなし。モバイルの配置画面画像を確認。
- 同Lv撃破でLvアップする経験値調整は今回未変更。既存セーブの敵Lvも変更しない。

## 2026-10-03 出現敵追加
- @game_data（1M55erZwPIapl8-fw7NS1Souy1SiW1iH6J56C6C85NPg）の出現敵 A108:T113 / W108:W113に6件追加。U/Vの巣検索表は変更しない。
- ホース:平地・荒野/Lv1〜5、ボア:平地・荒野・森/Lv3〜8、ドレイク:洞窟/Lv8〜15（数値・好戦性は暫定）。
- シートをXLSXへエクスポートし、game_data_converter.py --sheet 出現敵でJSON再生成。警告0・エラー0。既存84定義の内容不変、追加6定義。列番号・空行の検査値のみ除去。
- ビルド、実ブラウザの3種・各地形出現とLv帯回帰、標準ゲームクライアント成功、pageerrorなし。Google表示とゲーム画面画像を確認。


## 2026-10-03 種族の土地適性・幸福度
- ユーザー追加済みクラス.jsonの種族行の適正土地・苦手土地をRaceSelectModalへ表示。生成データは未編集。空欄は非表示。
- 苦手土地は拠点中心と所属居住化/居住用途マスを数え、種族幸福度目標に苦手マス割合×暫定30の減点。全体は人口加重、最大5/ターンの変化速度維持。設定値はV39_CIVIC_BALANCEへ集約。住民状態の補正内訳にも表示。
- 初期配置候補の制限・移動産出補正・適正土地の幸福度ボーナスは未変更。
- build:front、check-v39-race-terrain.mjs（PC/スマホ、種族切替、半分/全部の苦手土地、混合人口、経済ターン接続）、標準ゲームクライアント成功。モバイル画面を視覚確認、pageerrorなし。


## 2026-10-03 初期配置UIのコンパクト化
- 候補番号ボタン一覧を削除。候補生成とフィールドの明暗表示は維持し、フィールドタップ→位置確認→OKで配置する。詳細領域だけをスクロール、確定ボタンを下端固定。
- check-v39-start-area.mjsで実キャンバスクリック、候補数、範囲外拒否、確定前未設置、OK後設置、Fog解除を確認。440x900/440x600/320x568の確定ボタン可視範囲も検証。追加済みホースの自然Lv1〜5に合わせ、Lv帯テストはbeginnerタグで確認。
- build:front・ブラウザテスト成功、pageerrorなし。小画面画像を視覚確認。


## 2026-10-03 初期配置中の左タブ切り替え対策
- 通常タブ切り替えで配置画面が隠れ、説明・OKが消える原因を修正。activateFooterTabは初期配置モード中に配置画面を維持する。完了後は通常の切り替えに戻る。
- build:front、check-v39-start-area.mjs成功。配置前/選択後の各左タブ押下、選択とOKの維持、完了後の4タブ切り替えを確認。pageerrorなし。


## 2026-10-03 種族向け初期候補と追加動物画像
- 候補周囲の適正土地の種類・広さと苦手土地を評価。河川Setも参照し、種族変更時に候補キャッシュを再生成。評価半径は共通バランス変数。
- @game_dataの出現敵X108:Z113にホース/ボア/ドレイクの画像ファイル・番号7・サイズ連動falseを記載。該当JSONのみ再生成、他84件は変更なし。
- build:front、check-v39-start-area、check-v39-enemy-level-balance、check-v39-placement-artwork、標準ゲームクライアントを実行。人間の河川平地優先・エルフの森林優先・種族切替・3種のPhaser画像フレーム7を検証。pageerrorなし。

## 2026-10-03 広い適正低地を初期配置範囲に追加
- 種族の適正地形で高度の絶対値1以下の連続7マス以上を、候補20件の周囲とは独立して選択範囲に追加。最低連続数・高度上限はv39-gameplay-balance.jsの暫定変数。既存の陸地7マス・占有・敵配置チェックを維持。
- build:front、check-v39-start-area、check-v39-placement-artwork、標準ゲームクライアント成功。候補周囲外の広い森林が選択可能なことと従来の配置操作を検証、pageerrorなし。表示を視覚確認。

## 2026-10-03 全サイズの多島海を拡大
- 100x100限定の陸地目標1.2倍補正からサイズ制限を除去。島数とカスタム設定優先を維持。設定名を多島海設定へ整理し、現行メモ・地形ルールを更新。
- build:front、check-v39-archipelago-island-size、標準ゲームクライアント成功。30/36/60/83/100の面積倍率・島シード数・陸地目標を確認。pageerror/console errorなし、生成画面を視覚確認。

## 2026-10-03 属性動物のクラス復元・画像対応表
- @game_dataの最新クラスシートだけを変換し164レコードを再生成。属性アニマル7種に加え、原本の既存アンデッド調整も反映。シート原本への変更なし。
- animal-artwork-config.jsへ画像対象・ファイル・番号と属性クラス対応を分離。種族+クラスで専用画像を選択、未対応属性は通常画像、Lvでの画像変更なし。個体の直接画像指定を優先、定義IDの基礎画像より属性対応を優先。新しい出現条件は作らない。
- build:front、check-v39-animal-attributes（63組み合わせ/8個体のPhaser画像）、check-v39-placement-artwork、check-v39-enemy-level-balance、標準ゲームクライアント成功。pageerrorなし、実フィールド画像を視覚確認。

## 2026-10-03 強敵動物の追加クラスとLv配分
- 強敵動物に属性アニマル7種から1クラスを追加。ホースはエンジェル・デヴィルも候補に含め、ユニコーン・バイコーンの名称と画像へ変更。元クラスと同じ候補は除外、通常個体と取り巻きには追加しない。
- 強敵化の増加Lvだけを追加クラスに割り当て、元の種族・クラスは通常相当Lvで計算。追加クラスの成長・技能・スキル・耐性を反映し、保存後の再計算でも配分を維持。成長タブに追加クラスLvを表示。
- 狼・馬の12枠を画像対応表へ登録。月ホースの画像枠は登録するが、未指定の月属性クラスは新設しない。現行メモと敵AI仕様を更新、生成JSONへの編集なし。
- build:front、check-v39-strong-animal、check-v39-enemy-level-balance、check-v39-animal-attributes、標準ゲームクライアント成功。強敵1235体・通常/取り巻き692体、全候補の抽選、Lv配分と成長数値、保存再計算、馬の画像枠8/9を確認。pageerrorなし、実フィールド画像を視覚確認。

## 2026-10-03 種族区分別のユニット初期Lv
- 人族は通常/統治者Lv7・軍隊Lv3、亜人はLv10・Lv6、魔族はLv12・Lv9。V39_UNIT_INITIAL_LEVEL_BALANCEへコメント付きで集約。プレイヤー/NPCの新規ユニット作成、統治者、一般村守備軍に適用し、軍事研究Lvや編成人数とは分離。
- 一般村守備軍は再同期時に既存Lvを保持し、新規補充のみ初期Lvを使用。既存セーブ、明示Lv付きテストJSON、テスト勢力の編成複製、自然生物のLvは変更しない。勢力JSONの種族名も経験値分類へ解決し、クラスの種類を共通参照。
- 現行メモとCHARACTER_STATUS_RULESの旧初期Lv記載を更新。JSONとスプレッドシートへの編集なし。
- build:front、check-v39-initial-unit-level（全開始種族の統治者・通常/軍隊/強化軍隊をプレイヤーとNPCで生成、初期HP/EXP、村守備軍Lv、Lv17の再同期保持）、check-v39-enemy-level-balance、標準ゲームクライアント成功。pageerrorなし、操作UIのLv7/軍隊Lv3とステータスを視覚確認。

## 2026-10-03 通常軍隊の3人編成復元と生成Lv表記
- 再出力コミット8ccc31eで通常軍隊が4人・HP2.5倍・4回攻撃へ戻っていた。ユーザー確認に従い、@game_dataの都市基本データD51/I51:K51を3人説明・人口3・HP2倍・攻撃3へ修正。原本から都市基本データだけを再生成、53件・警告/エラー0。他の生成JSONは変更しない。
- 生成画面の種別選択を「必要軍事Lv」に変更し、概要へ種族に応じた実際の初期Lvを追加。必要軍事Lv1/3、強化軍隊5人、種族別初期Lvは維持。
- build:front、check-v39-initial-unit-level成功。全種族のプレイヤー/NPC生成で通常軍隊3人・人口3・HP2倍・攻撃3、強化5人を検証。必要軍事Lvと初期LvのUI表記も確認、pageerrorなし。

## 2026-10-03 部隊タブの実ユニット参照修正
- 既存の部隊配列がある場合、未登録の初期統治者や新規ユニットが表示されなかった。表示用部隊一覧を実ユニットから補完し、未所属は単独へ表示。実部隊IDの数字抽出変換を廃止し、保存IDをそのまま参照する。
- 削除済みユニット参照は表示から除き、人数と一覧を共通の解決結果へ統一。保存済み部隊編成は変更しない。
- build:front、check-v39-squad-current-units、標準ゲームクライアント成功。初期キャラ、新規軍隊、数字を含む部隊ID、別プレイヤーへの切替、選択キャラ同期を確認。pageerrorなし、部隊画面を視覚確認。

## 2026-10-03 拠点タブ切替のカメラ移動
- 拠点名タブの選択処理に、HEX_TILE_CONFIGによる中心座標へのカメラ移動を接続。ズーム倍率・キャラ選択は維持、未配置/座標未設定は移動しない。再描画・ターン更新で自動移動しない。
- build:front、check-v39-settlement-tab-focus、標準ゲームクライアント成功。二拠点の相互切替、中心座標、ズーム維持、キャラ維持、未配置拠点の無移動を検証。pageerrorなし、実画面を視覚確認。

## 2026-10-03 出現敵・CSスキル・依存クラス再出力
- @game_data最新XLSXを取得。出現敵90→110件（昆虫8種・地形別20行追加）、CSの出力確認TRUEからスキル233→578件。追加敵の依存クラスも164→180件へ再生成。対象3JSONだけを更新、原本への編集なし、更新前コピーと変換レポートはartifactsに保存。
- 出現敵・クラス変換は警告/エラー0。CSは同名4グループ（盾/聖域は競合）・警告5行。スキル爆裂/死者復活/完全蘇生/浮遊は今回出力から除外。クラスの残存参照と4クラスのSkill1〜10の文字列#N/Aは原本未修正のまま報告し、ALL_TASKS_UNIFIEDへ優先確認を追加。
- build:front、check-v39-spreadsheet-refresh、check-v39-enemy-level-balance、check-v39-initial-unit-level、標準ゲームクライアント成功。180/578/110件のランタイム読込、昆虫8種の種族定義・出現定義・ステータス導出を確認。pageerrorなし。新規スキル全効果の実行対応を確認済みとはしない。

- 2026-10-03: ヘッダーを食料(穀物/野菜/肉/魚)、資材(木材/石材/鉄)、金、特殊資源の4分類へ整理。その他の既存資源は特殊在庫へ集約、特産品一覧は特殊資源内のタブに統合。簡易モードの独自換算を廃止、両モードで同じ在庫を使用。既存の消費・装備レシピ・生成JSONは変更しない。check-v39-specialtiesで4項目/分類/食料100資材6金5特殊120/入力非変更/簡易内訳/390px/保存・描画検証成功、build・Webゲームクライアント成功、スマホ画像目視確認。

- 2026-10-03: 特殊資源6種の周期採取を実装。原本game_dataに特産品シート14件追加、変換器/レジストリ登録、XLSXから特産品.json生成（エラー0）。基本5ターン1個/マス、完了研究Lv+20%はシート暫定設定。拠点/勢力別進捗とセーブ、未発見/領土外/襲撃/溶岩除外、領土喪失リセット、同ターン重複防止。通常特産品は自領保有数表示・非消費、特殊素材の幸福度除外。在庫採取メモは選択拠点だけを集計。check-v39-special-resource-harvest成功（5T2マス=2個、複数拠点/勢力、研究Lv2で4T、停止/喪失、実セーブ3T進捗維持）、既存specialties/UI390px/エラー0、build・Webゲームクライアント成功、画像目視確認。既存マップへ新地点の自動追加はしない。

- 2026-10-03: 採取表示を×2 ⌛5形式へ簡略化。研究補正とマス別進捗から次の採取までの最短残りターンを算出し、説明はtitle/ariaへ。3ターン進捗時に⌛2を確認、採取テスト/スマホ画像/Webゲームクライアント確認。

- 2026-10-03: 既存game_data特産品シートを拡張。最低高度/最高高度/出現重み列追加、暫定高度は空欄(制限なし)、全重み1。薬草を平地/森/湿地で追加し15件を変換器からJSON再生成。生成処理は高度条件(0含む)と相対重み、重み0除外へ対応。薬草回復補正は後回し、既存群生地処理は維持。specialtiesテスト高度有効212地点/重み9対1=219対36/薬草存在/表示保存確認、harvest回帰/エラー0、build/Webゲームクライアント成功。原本16行11列の再読確認。

- 2026-10-03: 出現地形を森, 丘_2, 山岳_3~5のカンマ記法へ対応。負高度/高度0/別名丘→丘陵/旧配列互換、共通最低最高高度とのAND条件。条件パースは生成前に一度のみ。原本15行のB列をカンマ記法へ変換・ヘッダー注記追加、XLSXからJSON再生成。既存出現条件の高度値は勝手に追加せず保持。notationValid/notationGenerated、高度・重み・採取回帰・エラー0、build/Webゲームクライアント成功、画面目視確認。

- 2026-10-03: 特殊素材の欠落対策。適正マスが連続8マス以上の地域ごとに各1地点を補充し、全体でも操作プレイヤー数以上を目安に確保。地域閾値8は暫定・V39_SPECIALTY_BALANCEで調整可。地形/高度/重み0/予約地/溶岩/既存地点を維持、条件不足は全体警告。Sheet/生成JSONは変更なし。研究による採取解禁は提案のまま、既存速度補正のみ。既存保存マップへは遡及追加しない。1人/3人各18マップ検証で欠落0、3人時の素材別地点数は36x36=3~8、60x60=3~15、100x100=3~39。地域/複数人数/同seed/重み/高度/UI/採取保存の回帰成功・ページエラー0、build成功（既存チャンク警告のみ）、Webゲームクライアント・画面目視確認。各プレイヤーの到達距離公平性は未保証。

- 2026-10-04: 敵AIを残APで可能な移動・攻撃を繰り返す方式へ変更。待機/発動待ち/訓練/回収/無料行動/失敗は終了。Workerと分割処理で共通の終了判定を使用。視界内の通常徘徊もスライド、視界外経路/ワールド端横断/死亡者の移動は省略。移動時間は既存V39_MOVEMENT_PRESENTATION_BALANCEを共有。敵攻撃/発動待機/AI判断/被攻撃対象ログにLvを追加。check-v39-enemy-ap-presentationでAP100から30消費3回、CT/待機/AP不足/死亡/無料攻撃/Workerフォールバック/徘徊経路のTween/視界外省略を確認。cave-native回帰、指定Webゲームクライアント、ビルド成功、ページエラー0。

- 2026-10-04: 洞窟の通常部隊移動を選択キャラ先頭の1マス遅れ追従へ変更。地下のみ登録順で前のキャラの旧位置へ進み、離れた後続も通路沿いに1歩ずつ合流。死亡者は除外、壁/他ユニット占有/AP判定と既存Tweenを共用。初回入洞時は先頭を進行方向側、後続を入口側に配置し、再訪座標は保持。地上の平行移動は維持。check-v39-cave-followersで曲がり角の2回移動、各人AP100→62→24、障害物、死亡者、先頭切替、地上リーダー維持を確認。cave-native回帰/指定クライアント/build成功、ページエラー0。専用並び替えUIは未実装。

- 2026-10-04: 地下限定の視界+2マスと正の射程2倍をV39_CAVE_BALANCEに集約。射程0/未記載は隣接1マス維持。味方Fog/索敵境界、通常攻撃範囲プレビュー/実行、武器射程、敵AI診断/探索/逃走/Worker、国家AIの射程へ同じマップ条件を渡す。索敵/隠密の値と生成JSONは変更なし。近接反撃の内部射程は0にして地下倍率の対象外にした（地上の隣接1マスは同じ）。check-v39-cave-vision-rangeで通常1→地下3視界、射程0/10/20/40の地下1/2/4/8、未記載1、武器4、通常プレイヤープレビュー4、敵Workerが距離3から攻撃/AP消費を確認。cave-native/cave-followers回帰、指定クライアント、ビルド成功、ページエラー0。

## 2026-10-04 洞窟の残作業統合
- 壁越しの視界/攻撃、マップ所属別の戦闘/移動/回収、入口グループと別入口退出/前階層復帰、通常部隊の隊列↑↓を修正。
- 既存処理をマップ別コンテキストで進め、地上の生産/建設/研究は1ターン1回、訪問済み地下の敵AI/待機技/死亡処理を進行。非表示マップ演出とカメラ上書きを抑制。
- セーブ時の表示中階層同期、全階層の待機スキル復元、採取残量・視界・調査履歴を保存。
- scripts/check-v39-cave-worlds.mjs: 地上+2階層の実画面検証。既存 native/followers/vision-range/enemy-ap テストも確認。正式鉱床値・最終階層・多数階層/複数プレイヤー長時間検証は残作業。

## 2026-10-04: EXP不足・洞窟隣接採取・戦闘/チャット新着
- 戦闘EXPを対象の次Lv必要EXP基準へ変更。同マップの生存部隊員は各自同額、人数割りなし。実HP割合・回復して削り直す報酬上限・端数保持は維持。調整値はV39_UNIT_EXP_BALANCE。
- 洞窟採取のmap渡し忘れとcargo形式を修正。隣接鉱床を通常行動欄に自動表示。AP30、鉱石/宝石1個を部隊運搬品へ追加、残量減少を同時確定。AP不足/待機/枯渇は無効。採取ログも保存。
- 右ログを通知/戦闘/チャットに切替可能。戦闘と閉じたチャットの新着は上側に4秒/最大3件のポップアップ。タップで該当ログへ。HTMLエスケープ、期限別削除、既存テロップとの重なり回避。V39_LOG_PREVIEW_BALANCEで調整。
- check-v39-cave-rewards-logs.mjs: 実戦闘EXP、死者/別マップ除外、鉱石/宝石獲得、待機/AP不足/枯渇、保存残量、活動ログ/戦闘欄、新着チャット、上限/期限、390px収まりを検証。
- check-v39-cave-native.mjs、check-v39-cave-worlds.mjs、check-v39-cave-sites.mjs(70 checks)、規定web_game_playwright_client、build:front成功。スクリーンショット確認済み。ビルドには既存大チャンク警告あり。
- 生成JSON/スプレッドシートは未変更。既存作業差分は保持。

## 2026-10-04 メイン画面の重複コピー・更新削減
- 保存済み世界を含めない内部スナップショット、状態変更イベントの遅延スナップショット、保存世界の更新時再コピー削減。通常の全スナップショットは独立コピーを維持。
- ターン番号はタイムラインのみ参照。敵演出の生存対象一覧は一度構築。表示中世界では段階ごとの地図保存・復元を省略し、中間通知をまとめる。別世界への投影と背景処理は維持。
- 部隊/行動パネルのrAFを集約。ログ追加では視界・マーカー・部隊・行動パネルを不要更新しない。
- 同じ固定seed/敵数でターン終了60x60(92体):21013.8→4365.3ms、100x100(256体):91212.7→13043.7ms。100x100の非表示演出判定14521.9→0.1ms。単発デスクトップheadless計測でありスマホ/実GPUメモリの保証ではない。
- cave-worlds、cave-rewards-logs、performance-regressions、enemy-ap-presentation、cave-native、cave-followers成功。規定web_game_playwright_client/画像確認/build:front成功。既存大チャンク警告あり。
- 調査・比較: output/performance/main-screen-after/比較結果.md。100x100の描画反映はまだ約4秒ずつ残る。生成JSONは今回未変更。既存差分保持。
## 2026-10-04 タブ反応・スクロールの処理負荷
- ターン終了ではなく操作中を計測。100x100/390px/CPU4倍低速相当で拠点タブ197.4msを再現。状態変更で準備済みの内容を開くたび再計算/DOM交換していたので削除。別世界のコピーも不要にした。変更時の表示更新・拠点選択は維持。
- 静止地図は入力・Timer更新を続けながらGPU描画だけ省略（Phaserの更新専用step）。変更通知/カメラ/入力/Tween/エフェクト時は通常描画。未通知の変更は最大1秒の再描画で拾う。MAP_IDLE_RENDER_CONFIGに日本語コメント付き間隔を集約。
- 同じ低速CPU相当の拠点タブは197.4→3.8ms。回帰テストで静止500msの描画0回/更新31回、Tween20フレーム、エフェクト24フレーム、実ホイールによる地図拡大と下部スクロールを確認。UI形式は変更していない。
- check-v39-ui-input-performance、performance-regressions、cave-native、cave-followers、cave-worlds、enemy-ap-presentation成功。規定クライアント・画像確認・build:front成功（既存大チャンク警告）。実スマホGPUでは未測定。
- JSON・スプレッドシート未変更。計測資料: output/performance/ui-input/改善結果.md。

## 2026-10-04 フィールド更新ロード
- v39-field-update-loading.jsに共通runV39FieldUpdateを追加。フィールド内のみ「更新中…」、2フレーム描画機会後に処理開始、設定入力/地図操作のロック、同時呼び出しの集約、マーカー反映待ち、finallyで解除。
- テストモード、高低差輪郭/陰影、該当値を変更する設定リセットに適用。軽いタブ切替には表示しない。changedKeysでテストモード変更時の不要な地形描画を省略。setV39TestModeは完了をawait可能。マップ生成前は同期適用を維持。
- field-update-loadingで表示先/描画順/連打/ONOFFのFog/地形描画0回/実設定変更/リセット/例外時解除、ui-input-performanceでスクロール/拡大/Tween/エフェクトを検証。cave-native・規定Webゲームクライアント・build:front成功（既存チャンク警告）。スマホ幅の画像確認済み。
- JSON/シート/既存ゲームルール未変更。同期処理の小分け化全体は本修正には含まない。

## 2026-10-04 戦闘ログの索敵範囲フィルタ
- 通常の右側戦闘チャンネル/ポップアップは発生時の索敵で攻撃側/攻撃先/範囲対象を判定。操作プレイヤー/マップの公開情報を記録し、テストONのみ視界外・背景世界を含めて表示。OFF時に履歴と既存プレビューも再フィルタ。
- 待機/詠唱など攻撃者のみのイベントも座標解決に対応。活動ログ・戦闘ダメージ・AI内部ログは未変更。時刻参照はタイムラインのみ取得。
- check-v39-battle-log-visibilityで対象/範囲/攻撃者、通常/テストONOFF、背景世界、プレイヤー/マップ切替、ポップアップ除外を検証。cave-rewards-logs・規定クライアント・build:front成功。ブラウザー例外なし。生成JSON/シート未変更。

## 2026-10-04 チャットポップアップを右側へ
- チャットはplayfield右側のv39-chat-preview、戦闘は既存FeedbackLane内のv39-battle-previewへ分離。各チャンネルで上限3件、期限は従来の4秒。小画面でもフィールド内に収め、縦に積み重ねる。
- 押下で該当ログを開く、開いているチャットは通知しない、既読化でチャットのみ消す、索敵による戦闘公開範囲を維持。
- chat-popup-layoutで390/1280pxの左右分離・境界・積み重ね・開閉を確認。旧テストの戦闘プレビュー参照先を新しいIDへ修正。battle-log-visibility・build:front・規定Webゲームクライアント成功。スクリーンショット確認済み。JSON未変更。

## 2026-10-04 拠点確定後のゲーム開始ロード
- 手動のローカル初期拠点確定をrunV39FieldUpdateで包み、表示を描画してから配置/初期化する。確定ボタン連打と地図操作を防止。次の配置段階へ進んだ時のボタン状態も再設定。
- 同期placeV39InitialBase API・自動配置・マルチホスト要求は維持。start-loadingで実際の確定ボタン連打、配置前ロード、initial-placement-complete発生時のロード保持、初期化1回、完了後解除を確認。
- field-update-loading、build:front、規定クライアント成功。チャット関連のcave-rewards-logsも新ID対応後に成功。既存差分/JSONは保持。

- 2026-10-04: ポップアップ位置の再修正。チャットだけ右側に移し、実際の戦闘イベントのプレビューを上部へ残していたため、両チャンネルを右側共通ホストに縦並びで配置。スクロール・個別件数制限・索敵フィルター・クリックでログを開く動作を維持。配置テストはcombat-logイベント経由に変更。PC/スマホ画像、配置・視界フィルター・通常洞窟戦闘/採取/失効テスト成功。

- 2026-10-04: 戦闘ログ/右側ポップアップに攻撃者名 / スキル名、対象ごとの名前・合計ダメージを追加。敵Lv表示を維持し、全回避はMiss、連撃は内訳も表示。元のAP/EXP集計は折りたたみ詳細へ。範囲攻撃の対象行を3行で切り捨てず共通枠でスクロール。実戦データの対象表示とPC/スマホ複数対象/Missを検証。

- 2026-10-04: 洞窟ボス周期を5→3へ変更。既存V39_CAVE_BALANCE.bossFloorIntervalで調整可能。10形状と1〜6層、通常画面の3層ボス配置を含む76チェック・ページエラー0、画像確認・規定クライアント・ビルド成功。住処の通常/変異個体、ドレイクのボス化案、難易度高度参照、複数奥地マップ、ボス撃破後の鉱床ターン収入は仕様/タスクへ追記したが未実装。階層区分の重複、収入量/受取先は未確定のまま保持。

- 2026-10-04: 洞窟テストは3層単位の難易度高度区分（0,1,2…）で住処/ボス種族を切替。同一区分は同じ種族、区分境界は別種、同じシードと再訪で維持。Lvは出現JSONの範囲+区分×既存地上高度Lv増分、既存上限/ボス加算。地形高度は0を維持。caveTestと区分/住処をマップへ保存し次階層へ継承。112生成チェック、通常画面3→4層/再訪、地上往来/保存復元テスト、規定クライアント、ビルド成功。ドキュメント編集によるViteリロード中断は編集終了後に再実行して成功。通常ゲームの奥地化、変異、鉱床収入は未実装。

- 2026-10-04: ステータス技能→能力へ通常操作UI/キャラ詳細/共通Vueパネルの4描画元を変更。左ユニット一覧の座標前に既存経験値表示データのLvを表示。PC/スマホ3人カード・選択切替・キャラ詳細タブテスト、規定Webゲームクライアント・ビルド成功。

- 2026-10-04: Lvを座標前から左アイコン中央へ移し黄色数値+暗背景で表示、経験値外周/ツールチップを維持。既存squad-levelのCSSが前の色を上書きしていたため専用classを使用。PC/スマホ中央位置/座標のみ/選択テスト成功。開始画面へセーブ読込を移しマップ設定から旧UI/ハンドラ/CSSを削除。ファイル選択・不正JSON後の再試行・地下世界/ユニット復元を検証。規定Webゲームクライアント/ビルド成功、画像確認済み。

- 2026-10-04: 常設の地下隊列↑↓を撤去。ユニット長押し550ms/右クリック/Shift+F10の前へ後ろへメニューへ変更。選択は変えず押したユニットを並び替え、端/ロック無効化、外側/Escape/スクロールで閉じる。長押し後クリックの選択変更をdocument captureで抑制。長いユニット/技/装備/技能名を元CSSで折り返しへ変更し、共通詳細/キャラモーダル/チャットの省略も修正。PC/スマホの長名/メニュー/選択維持/順序変更、地下往来/保存復元、チャット/キャラ詳細、規定クライアント・ビルド成功。

- 2026-10-04: 待機/調査/採取カードの即時実行を撤去し、詳細内の使用ボタンへ実行ハンドラを移動。カードはキーボード対応divに変更し入れ子buttonを回避。使用クリックは詳細開閉から除外。選択時の移動/攻撃解除を維持。system-action-confirmのPC/スマホ実画面で選択時のAP/待機/調査/運搬品維持と使用時の変化、action-switchとsurvey-apの既存処理を検証済み。
- 規定Webゲームクライアント・PC/スマホ画像確認完了。標準buildは既存web-vue-dist/assetsのENOTEMPTYで失敗したため、検証用outDirで再実行し成功（既存チャンク警告のみ）。JSON未変更。

- 2026-10-04: 洞窟採取を周囲1マスの発見済み鉱床をクリックして指定→共通採取カードの使用へ統合。旧即時採取ボタンを撤去、休息維持。地上採取は従来処理。対象名/座標/残量/AP表示、切替時解除、隣接外/未発見/枯渇/AP不足/待機の拒否を確認。cave-gather-targetのPC/スマホ実際の地図クリック、system-action-confirm、cave-rewards-logsのAP/運搬品/保存/戦闘ログを検証。

- 2026-10-04: 攻撃後の隠密を直後0→1/3→2/3→3ターン後全回復へ変更。調整値V39_ATTACK_STEALTH_RECOVERY_TURNS。敵/味方/一般村守備兵の攻撃記録にlastStealthAttackTurnを追加し、被単体攻撃の当ターン露見とは分離。共有索敵/AI判定とテスト診断へ反映、旧セーブattack記録互換、基礎技能値保持、再攻撃リセットを検証。stealth-recovery実戦テスト、map-visibility正常/テスト/勢力切替テスト成功。

- 2026-10-04: 採取対象がない場合だけ非表示、AP/待機/運搬上限不足は薄く理由表示。地上の現在地採取に小型吹き出し、洞窟は既存地点アイコン/対象タイルから共有行動詳細を開く。休息はカード詳細/使用方式に変更し即時回復を撤去。地点文字を共通summary構造へ揃えて縦1文字の崩れを修正。cave-gather-target PC/スマホで地図クリック→詳細、対象なし非表示、AP不足残表示、休息プレビュー不変→使用回復、枯渇時削除、地上hint生成を確認。system-action-confirm/cave-rewards-logs成功。

- 2026-10-04: 洞窟採取表示の発見更新順序を修正。renderSitesでdiscovered更新後に共有採取UIを再判定、選択キャラ詳細再描画時にも同期。群生地の休息は長い技一覧の末尾ではなく基本行動の近くへ配置。cave-gather-targetに未発見非表示→visibilityイベントで発見→クリック不要で採取表示の回帰確認を追加。PC/スマホの採取・回復・枯渇・AP不足を確認。薬草/キノコの持帰り採取は未実装、現行は休息。

- 2026-10-04: 洞窟テスト1階の入口近くにドワーフの会話専用ユニットを追加。行動の会話UIで武器購入・鉱石製作・既存装備生成/装備反映/旧武器運搬品返却を接続。5依頼（鉱石/宝石納品、全体/住処種族討伐、3階到達）と携帯金/資源消費/報酬1回限りを勢力・洞窟seed別に保存。NPCはマップに保存、AIから分離、初期配置で重複回避。世界切替前の一時マップで最高階層を更新しないようcave-world-ready後に確定。cave-eventsでPC/スマホ購入UI、製作、装備、実戦討伐/重複拒否、遠隔拒否、セーブ復元、3階到達→1階再訪報酬を検証。cave-gather-target/system-action-confirm/cave-worlds成功。仮数値はV39_CAVE_EVENT_BALANCE、生成JSONは未変更。

- 2026-10-04: 洞窟テスト鍛冶師を入口x+1/y-2へ固定配置。短い通路と生成済み配置の重なり回避を追加。ドワーフ4x3シートの9番を実際に切り出し、番号は共通設定で変更可能。PC/スマホで座標・切り出し・会話売買依頼の回帰確認。

- 2026-10-04: 洞窟会話を行動欄から下部全体へ切替。共通会話表示モジュールに画像/会話文と独立スクロール、通常UIのinert保持復元、終了/Escape/タブ切替を実装。右に購入/製作/装備/依頼選択と詳細/実行。PC・スマホで全体サイズ/選択維持と既存売買/依頼/保存の回帰確認。

- 2026-10-04: 会話右側をメニュー→一覧→詳細の切替式へ変更。一覧/詳細の同時表示を廃止し、戻るで詳細→一覧→メニューへ復帰。スクロールも画面切替で先頭に戻す。PC/スマホで武器/依頼の表示排他と戻る、既存売買・依頼保存の回帰テストを実施。

- 2026-10-05: 会話画面の左側を現在の購入/製作/装備/依頼と選択項目に連動。依頼の条件/報酬/受注状態を会話で案内し、戻るでも会話を復元。PC/スマホで左側文言の切替と既存イベントの回帰確認。

- 2026-10-05: 洞窟依頼一覧/詳細に未受注・受注中・報告可能・受領済みと進捗を表示。受注前は0表示、詳細閲覧のみでは受注しない。階層依頼を受注後の到達のみ集計へ変更し過去最高階は流用しない。納品は既存所持も利用可。PC/スマホで受注開始/過去記録除外/状態表示/売買保存回帰確認、ビルド成功。
