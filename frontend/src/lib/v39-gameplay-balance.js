// 仕様未確定の調整値はここへ集約し、確定後に処理本体を変えず差し替える。
// 攻撃の最低命中率。0.25 = 25%。
export const V39_HIT_RATE_MIN = 0.25;
// 攻撃の最大命中率。1.00 = 100%。
export const V39_HIT_RATE_MAX = 1.00;
// 攻撃後の隠密回復ターン数。直後0、1ターンごとに元の値の1/3ずつ回復する。
export const V39_ATTACK_STEALTH_RECOVERY_TURNS = 3;

export const V39_CAVE_EVENT_BALANCE = Object.freeze({
  // 洞窟テスト専用の仮値。携帯金とイベント進捗は勢力/探索ごとに保存する。
  initialGold:100,
  npcLevel:10,
  // 鍛冶師の画像番号（1始まり、4列×3行）と入口からの配置差分。
  npcArtworkSlot:9,
  npcOffsetX:1,
  npcOffsetY:-2,
  shopWeaponCount:6,
  buyGold:30,
  craftGold:10,
  craftOre:2,
  // クエスト種別ごとの必要数と金報酬。
  oreDelivery:3, oreReward:30,
  gemDelivery:1, gemReward:40,
  kills:3, killReward:40,
  habitatKills:2, habitatReward:30,
  targetFloor:3, floorReward:50
});

export const V39_LAND_EXPANSION_BALANCE = Object.freeze({
  // 暫定: 1件の開拓に回す拠点人口。食料消費は減らさず、生産要員からだけ外す。
  workers:10,
  // 暫定: 1マスの開拓工期と、1拠点で同時に進められる件数。
  turns:2,
  maxProjects:1,
  // 水域の開拓は完成した船着き場・港の位置を起点にする。
  waterRanges:Object.freeze({ 船着き場:1, 港:2 })
});

export const V39_MOVEMENT_PRESENTATION_BALANCE = Object.freeze({
  // 1マスの移動演出時間。部隊員は同時に動かす。
  stepMs:140,
  // 全経路の最大再生時間。長距離では1歩の時間を短縮する。
  maxDurationMs:1200
});

export const V39_BODY_WEAPON_BALANCE = Object.freeze({
  // 種族・取得クラスの身体性能の最大値を、この値で割って身体武器Lvにする。
  levelDivisor:10,
  // 点の間は直線補間。小数Lvも保持し、レア度名とは独立して性能を上げる。
  powerPoints:Object.freeze([
    Object.freeze({ level:1, multiplier:1 }),
    Object.freeze({ level:35, multiplier:2 }),
    Object.freeze({ level:50, multiplier:3.5 })
  ]) // 暫定: 最終点を超えるLvは最終点の倍率で頭打ち。
});

// プレイヤー・NPC勢力・一般村の新規ユニットLv。軍事研究Lvや編成人数とは別の値。
export const V39_UNIT_INITIAL_LEVEL_BALANCE = Object.freeze({
  // 人族: 統治者・通常ユニットLv7、軍隊・強化軍隊Lv3。
  human:Object.freeze({ normal:7, army:3 }),
  // 亜人: 人族より通常ユニット・軍隊ともにLv+3。
  demi:Object.freeze({ normal:10, army:6 }),
  // 魔族: 統治者・通常ユニットLv12、軍隊・強化軍隊Lv9。
  demon:Object.freeze({ normal:12, army:9 })
});

export const V39_SURVEY_BALANCE = Object.freeze({
  // 調査完了に必要な累計AP。残りAPを全消費し、足りない分は次ターン以降に継続する。
  requiredAp:100
});

export const V39_GATHER_BALANCE = Object.freeze({
  // 暫定: 採取1回のAP。採取量は地形の基礎産出1ターン分で、技能・人数補正はまだ掛けない。
  apCost:100
});

export const V39_START_AREA_BALANCE = Object.freeze({
  // 初期配置画面で提示する種族向け候補の最大数。
  candidateCount:20,
  // 暫定: 適正土地・苦手土地を評価する候補周囲の六角マス距離。
  terrainPreferenceRadius:2,
  // 暫定: 広い適正地帯として選択範囲に追加する、連続した低地マスの最低数。
  preferredLowlandMinTiles:7,
  // 暫定: 広い適正地帯の高度の絶対値上限。-1～1を低地として扱う。
  preferredLowlandMaxHeight:1,
  // 暫定: 候補中心から初期拠点を配置できる六角マス距離。0なら候補中心のみ。
  placementRadius:2,
  // 初期拠点中心からこの六角マス距離以内には初期の通常敵・強敵を置かない。
  safeRadius:4,
  // 初期拠点中心からこの距離までを序盤向けの敵Lv帯にする。
  beginnerRadius:8,
  // 暫定: 序盤個体のLv。JSONに該当Lvがない場合は地形の最低Lv帯の種族を使う。
  beginnerMinLevel:1,
  beginnerMaxLevel:3
});

// 初期生成の敵Lv調整。種族候補は出現敵JSONと従来の高度条件から選ぶ。
export const V39_ENEMY_LEVEL_BALANCE = Object.freeze({
  // 通常個体・通常の配下の初期Lv上限。成長後のLv上限ではない。
  normalMaxLevel:15,
  // ボス個体の初期Lv帯。
  bossMinLevel:20,
  bossMaxLevel:25,
  // 暫定: 通常の高度幅-8〜8の両極端から1段内側までを難所とする。
  extremeHighHeight:7,
  extremeLowHeight:-7,
  extremeLevel:30
});

// 戦闘ダメージの共通調整値。ダメージ式本体を変えずに全体バランスを調整する。
export const V39_COMBAT_BALANCE = Object.freeze({
  // 1ヒットごとの最終ダメージへ掛ける倍率。
  damageMultiplier:3
});

// ユニット経験値の暫定調整値。必要EXP式は v39-unit-experience.js 側の確定式を使用する。
export const V39_UNIT_EXP_BALANCE = Object.freeze({
  // 活動ごとの基本EXP。各行動はこの値へ難易度倍率と成果率を掛ける。
  baseExpByAction:Object.freeze({
    combat:15,
    survey:10,
    construction:10,
    research:10,
    territory:15,
    diplomacy:15,
    training:3
  }),
  // 旧式を参照する外部処理向けの互換値。
  baseExpPerTargetLevel:15,
  // 同レベルの相手1体で約1Lv上がるよう、対象の次Lv必要EXPを報酬の基準にする。
  combatLevelProgressRate:1,
  // 倒した相手側の種族カテゴリ倍率。
  targetRaceMultipliers:Object.freeze({
    human:1.0,
    demi:1.25,
    demon:1.5,
    other:1.0
  }),
  // 調査の現行標準ターン。調査側に正本列が追加されるまでは1Tを元ターンとして使う。
  defaultSurveyStandardTurns:1,
  // 標準必要ターンによる難易度。1T=1.0、2T=1.5、4T=2.5、8T=4.5。
  standardTurnDifficultyPerExtraTurn:0.5,
  // 地形.json の開拓難易度。難易度1を1.0とし、1段階ごとに+20%。
  developmentDifficultyPerLevel:0.2,
  // 地形.json のモンスター危険度。危険度1.0あたり+50%。
  threatDifficultyScale:0.5,
  // マップ高度Lv。0以下は1.0、正の高度1段階ごとに+5%。
  altitudeDifficultyPerLevel:0.05,
  // 一般的な整数難易度Lvを使う処理向け。Lv1を1.0、1段階ごとに+25%。
  genericDifficultyPerLevel:0.25,
  // 研究の必要EXPを難易度へ変換する基準。現行研究Lv1の必要EXP=100。
  researchExpReference:100,
  // 研究Lvそのものによる追加難易度。Lv1を1.0、1段階ごとに+50%。
  researchLevelDifficultyPerLevel:0.5,
  // 同じマップの生存部隊員にもEXPを与える。soloは攻撃者だけ。
  splitAmongLivingSquadMembers:true,
  // falseなら各部隊員が同額を獲得。trueなら従来の人数による均等分割。
  divideCombatExpAmongRecipients:false,
  // 同じ対象を回復させて削り直すEXP稼ぎを防ぐため、1体から支払うのは最大HP100%分まで。
  capRewardedDamageAtMaxHp:true
});

// 戦闘・閉じたチャットの新着ポップアップ。
export const V39_LOG_PREVIEW_BALANCE = Object.freeze({
  durationMs:4000, // 新着1件を表示する時間。
  maxEntries:3 // 同時表示上限。連続攻撃でフィールド全体を覆わない。
});

export const V39_SQUAD_MOVEMENT_BALANCE = Object.freeze({
  // 移動コスト計算の基準値。APプールは戦闘と共通で、別の移動APは持たない。
  moveApMax:100,
  // 移動値10を、AP100で平地を1マス移動できる基準とする。
  moveStatPerTile:10,
  // 脚0でも基礎1マス相当。脚1本ごとに移動値+5。
  baseMovementStat:10,
  movementPerLeg:5,
  // 速度10ごとに移動値+1。速度は上限でクランプしない。
  speedPerMovementStat:10,
  // 脚数未設定の旧データは人型相当の2脚として扱う。
  defaultLegCount:2
});

export function resolveV39SizSpeedModifierPercent(siz = 170) {
  const value = Number(siz);
  if (!Number.isFinite(value) || value === 0) return 0;
  if (value >= 180) return Math.round(value / 50 + 8);
  if (value <= 150) return -Math.round((160 - value) / 3);
  return 0;
}

export function resolveV39MovementStatFromStatus(status = {}, options = {}) {
  const speed = Math.max(0, Number(status?.速度) || 0);
  const sizModifierPercent = resolveV39SizSpeedModifierPercent(status?.SIZ);
  const sizAdjustedSpeed = speed / Math.max(0.01, 1 + sizModifierPercent / 100);

  const legValue = Number(options?.legCount);
  const legCount = Number.isFinite(legValue)
    ? Math.max(0, Math.floor(legValue))
    : V39_SQUAD_MOVEMENT_BALANCE.defaultLegCount;
  const baseMovement = V39_SQUAD_MOVEMENT_BALANCE.baseMovementStat
    + legCount * V39_SQUAD_MOVEMENT_BALANCE.movementPerLeg;
  const speedMovement = sizAdjustedSpeed / V39_SQUAD_MOVEMENT_BALANCE.speedPerMovementStat;
  const additionalMovement = Number.isFinite(Number(options?.additionalMovement))
    ? Number(options.additionalMovement)
    : 0;

  return Math.max(1, Math.round(baseMovement + speedMovement + additionalMovement));
}

export function resolveV39BaseMoveApCost(movement = V39_SQUAD_MOVEMENT_BALANCE.moveStatPerTile) {
  const moveValue = Math.max(1, Number(movement) || V39_SQUAD_MOVEMENT_BALANCE.moveStatPerTile);
  return (V39_SQUAD_MOVEMENT_BALANCE.moveApMax * V39_SQUAD_MOVEMENT_BALANCE.moveStatPerTile) / moveValue;
}

export function resolveV39MovementTiles(movement = V39_SQUAD_MOVEMENT_BALANCE.moveStatPerTile) {
  const moveValue = Math.max(0, Number(movement) || 0);
  return Math.max(1, Math.floor(moveValue / V39_SQUAD_MOVEMENT_BALANCE.moveStatPerTile));
}

export function resolveV39RangeTiles(rangeValue, fallbackTiles = 1) {
  const raw = Number(rangeValue);
  if (!Number.isFinite(raw)) return Math.max(1, Math.floor(Number(fallbackTiles) || 1));
  return Math.max(1, Math.floor(raw / V39_SQUAD_MOVEMENT_BALANCE.moveStatPerTile));
}

// 軍事Lvによる通常軍隊の編成補正。基本値は都市基本データ.jsonの分類=ユニット作成、army行を使う。
// 現在は既存のarmy値を維持するため全倍率1。軍事Lvごとの差分を調整する時はここだけを変更する。
export const V39_MILITARY_UNIT_LEVEL_BALANCE = Object.freeze({
  armyProfiles:Object.freeze([
    Object.freeze({ militaryLevel:1, memberCountMultiplier:1, hpMultiplier:1, attackCountMultiplier:1 }),
    Object.freeze({ militaryLevel:2, memberCountMultiplier:1, hpMultiplier:1, attackCountMultiplier:1 })
  ])
});

export const V39_VOLCANO_DAMAGE_BALANCE = Object.freeze({
  // 暫定値。施設.jsonへ最大HP列を追加した場合はデータ参照へ置き換える。
  // 施設1件の最大耐久値。単位はHP。
  facilityMaxHp:100,
  // 火山・溶岩による施設被害の倍率。
  facilityDamageMultiplier:3,
  // 損傷中の施設効果は残HP率に比例し、HP0では停止する。
  facilityEffectUsesHpRate:true
});

// 勝利対象土地の生成設定。
// 候補地は開始拠点から離れた、対応地形が連続する地域にのみ置く。
// 数値は勝利対象の正式データ列が追加されるまでの調整用暫定値。
export const V39_VICTORY_LANDMARK_BALANCE = Object.freeze({
  // options.countを渡さない場合の、マップ長辺ごとの候補地数。
  // 60x60以下は2件、72x72は3件、83x83以上では4種類すべてを候補にする。
  candidateCountByMapMaxSide:Object.freeze([
    Object.freeze({ maxSide:47, count:1 }),
    Object.freeze({ maxSide:60, count:2 }),
    Object.freeze({ maxSide:72, count:3 }),
    Object.freeze({ maxSide:Infinity, count:4 })
  ]),
  // 各開始拠点から確保する最小ヘックス距離。厳格判定で候補がない時だけ緩和値を使う。
  startDistanceRate:0.38,
  relaxedStartDistanceRate:0.28,
  // 同じ勝利対象候補同士を離す最小ヘックス距離。候補地が同一地域へ密集しないための値。
  landmarkSeparationRate:0.24,
  // 対応地形が連結している必要がある最小マス数。長辺別に緩く調整する。
  minimumRegionTilesByMapMaxSide:Object.freeze([
    Object.freeze({ maxSide:47, count:8 }),
    Object.freeze({ maxSide:60, count:14 }),
    Object.freeze({ maxSide:72, count:20 }),
    Object.freeze({ maxSide:Infinity, count:28 })
  ]),
  // 地形別の高度条件。高地型は高度Lv3以上、低地型は高度Lv-1以下を要求する。
  // 黄昏の樹も低地の森を避け、高地へ連続する広い森林を難所として使う。
  terrainPlacementProfiles:Object.freeze({
    "勝利対象:太陽の山":Object.freeze({ elevation:"high", generation:"mountain" }),
    "勝利対象:黄昏の樹":Object.freeze({ elevation:"high", regionTerrain:"target", generation:"high-forest" }),
    "勝利対象:星の火口":Object.freeze({ elevation:"high", generation:"volcano" }),
    "勝利対象:宇宙の海":Object.freeze({ elevation:"low", generation:"deep-sea" })
  }),
  highElevationLevel:3,
  lowElevationLevel:-1,
  // マップ生成時に勝利対象用の地形帯を先に作るための暫定値。
  terrainGeneration:Object.freeze({
    highlandRawHeight:82,
    supportRegionScale:1,
    // 勝利対象用地形帯の中心を、マップ中心から長辺比でどれだけ離すか。
    anchorRingRate:0.28,
    // 勝利対象本体は大都市相当の半径1・7マス。その外側へ最低2リングを確保する。
    landmarkFootprintRadius:1,
    requiredOuterRingRadius:2,
    // 太陽の山と星の火口を囲む最低地形帯。半径3は中心込み37マス。
    sunMountainRadius:3,
    starMountainRadius:3,
    // 全勝利対象は必要核の外側も使い、整った六角形ではない不規則な外縁にする。
    supportIrregularExtraRadius:2,
    // 太陽の山・星の火口は最低37マスへこの割合の地形を追加して輪郭を崩す。
    compactSupportExtraTileRate:0.5,
    // 勝利対象の高度は中心から1マス離れるごとに1段ずつ下げ、進入不能な崖を作らない。
    heightSlopePerRing:1,
    // 星の火口の中心に隣接させる追加火山数。中心を含めると火山は4マスになる。
    starAdjacentVolcanoCount:3,
    // 黄昏の樹を囲む森林半径。半径7は直径15マス、中心込み169マス。
    twilightForestRadiusByMapMaxSide:Object.freeze([
      Object.freeze({ maxSide:47, radius:4 }),
      Object.freeze({ maxSide:60, radius:5 }),
      Object.freeze({ maxSide:72, radius:6 }),
      Object.freeze({ maxSide:Infinity, radius:7 })
    ])
  }),
  // 島形状ごとの優先対象ID。優先対象を先に評価し、残り候補数は他の勝利対象で補う。
  landmarkIdsByPattern:Object.freeze({
    realistic:Object.freeze(["勝利対象:太陽の山"]),
    balanced:Object.freeze(["勝利対象:黄昏の樹"]),
    continent:Object.freeze(["勝利対象:太陽の山"]),
    archipelago:Object.freeze(["勝利対象:宇宙の海"]),
    twins:Object.freeze(["勝利対象:黄昏の樹"]),
    chain:Object.freeze(["勝利対象:星の火口"])
  })
});

// 勝利対象土地の守護編成。勝利対象土地.jsonに守護列が追加されるまでの暫定設定。
// 敵種族・巣画像は出現敵.jsonから対象地形に合う最高Lv候補を使う。
export const V39_VICTORY_GUARD_BALANCE = Object.freeze({
  // 勝利対象土地の守護ボスの初期Lv。配下は下の差分設定を使う。
  bossLevel:40,
  // 大都市相当の占有半径1と、その外側2リングを含む守護領域。
  territoryRadius:3,
  // ボスに加える同種配下の人数。0にすればボス単独へ変更できる。
  minionCount:1,
  // 配下LvをボスLvから下げる値。最低Lvは1。
  minionLevelOffset:2
});

// 勝利対象土地の暫定勝利条件。守護ボス・勢力滅亡条件が確定するまではここだけで調整する。
export const V39_VICTORY_CONDITION_BALANCE = Object.freeze({
  // 通常生成数が1件のため、暫定では1地点の支配で勝利候補になる。
  requiredLandmarkCount:1,
  // 支配を維持する必要ターン数。1なら支配を得たターンの判定で達成する。
  requiredHoldTurns:1
});

export const V39_CIVIC_BALANCE = Object.freeze({
  // 幸福度・不満度・治安が戻ろうとする基準値。
  targetBase:50,
  // 拠点を新設した時の幸福度。
  initialHappiness:50,
  // 拠点を新設した時の不満度。
  initialDissatisfaction:50,
  // 拠点を新設した時の治安。
  initialSecurity:50,
  // 住民状態が基準値へ近づく1ターンごとの最大変化量。
  changePerTurn:5,
  // 暫定: 拠点中心・居住地がすべて苦手土地の場合の種族幸福度目標の低下量。苦手マス割合を掛ける。
  unfavorableTerrainHappinessPenalty:30,
  // 食料備蓄による安心感が加点を始める残りターン数。
  foodReserveBonusStartTurns:4,
  // この残りターン数以上なら食料備蓄の幸福度ボーナスを最大にする。
  foodReserveBonusFullTurns:8,
  // 食料備蓄が十分な時に加える幸福度の最大値。
  foodReserveHappinessMaxBonus:5,
  // 食料備蓄が十分な時に減らす不満度の最大値。
  foodReserveDissatisfactionMaxReduction:5,
  // 人口許容に対してこの使用率以下なら住環境の余裕ボーナスを最大にする。
  housingComfortFullBonusRate:0.7,
  // 人口許容に対してこの使用率以上なら住環境の余裕ボーナスを0にする。
  housingComfortZeroBonusRate:1.0,
  // 住環境に余裕がある時の幸福度最大ボーナス。
  housingComfortMaxBonus:5,
  // 住環境ボーナスを不満度低下へ反映する倍率。
  housingComfortDissatisfactionScale:1,
  // 単体マス施設の幸福度・治安系効果を拠点全体へ換算する暫定倍率。
  localFacilityCivicScale:0.5,
  // 施設の幸福度効果の全体倍率。
  facilityHappinessScale:1,
  // 施設の不満度低下効果の全体倍率。
  facilityDissatisfactionScale:1,
  // 施設の治安効果の全体倍率。
  facilitySecurityScale:1,
  // 人口過多率1.0あたりの幸福度・治安ペナルティ。
  overcrowdingPenaltyPerRate:10,
  // イベントから渡される幸福度補正の倍率。イベント側は符号付き値を渡す。
  eventHappinessScale:1,
  // イベントから渡される不満度補正の倍率。イベント側は符号付き値を渡す。
  eventDissatisfactionScale:1,
  // イベントから渡される治安補正の倍率。イベント側は符号付き値を渡す。
  eventSecurityScale:1,
  // 飢餓段階1ごとに減らす幸福度。
  starvationHappinessPerStage:5,
  // 飢餓段階1ごとに増やす不満度。
  starvationDissatisfactionPerStage:5,
  // 飢餓段階1ごとに減らす治安。
  starvationSecurityPerStage:3,
  // 幸福度から治安補正を求める際の除数。大きいほど影響が小さい。
  securityFromHappinessDivisor:10,
  // 主種族以外が1種増えるごとの住民状態ペナルティ。
  mixedRacePenaltyPerAdditionalRace:2,
  // 災害による住民状態ペナルティの倍率。
  disasterPenaltyScale:1,
  // 占領直後に加える住民状態ペナルティ。
  occupationPenaltyDefault:15,
  // 守備ユニットから得られる治安ボーナスの上限。
  guardSecurityBonusCap:30,
  // 幸福度または治安による産出低下を始める境界値。
  productionPenaltyStart:50,
  // 住民状態悪化で失う産出の最大割合。0.3 = 30%。
  productionPenaltyMax:0.3,
  // 人口流出を判定する不満度の境界値。
  civicOutflowDissatisfactionThreshold:65,
  // 人口流出を判定する治安の境界値。
  civicOutflowSecurityThreshold:40,
  // 人口流出量。人口に掛ける割合。0.02 = 2%。
  civicOutflowPopulationRate:0.02,
  // 条件を満たした時の最低人口流出数。
  civicOutflowMinimum:1,
  // 反乱の発生数値は未確定。確定後はこの4項目だけを差し替える。
  // 反乱を判定する不満度の境界値。
  rebellionDissatisfactionThreshold:75,
  // 反乱を判定する治安の境界値。
  rebellionSecurityThreshold:25,
  // 反乱ユニット数の元になる人口割合。0.1 = 10%。
  rebellionPopulationRate:0.1,
  // 同じ拠点で反乱を再発生させないターン数。
  rebellionCooldownTurns:3
});

// 都市.jsonに具体値が入るまで使用する暫定値。名称と選択条件は都市.jsonを正本にする。
export const V39_CITY_SPECIALIZATION_BALANCE = Object.freeze({
  // 専門化を選択できる最低拠点規模Lv。3 = 都市。
  minimumScaleLevel:3,
  // 個別効果が未定義の専門化に使う資源産出倍率。1.1 = 10%増。
  defaultResourceMultiplier:1.1,
  // 農業都市の食料産出倍率。1.25 = 25%増。
  foodMultiplier:1.25,
  // 産業都市の資材産出倍率。1.25 = 25%増。
  materialMultiplier:1.25,
  // 交易都市の食料・資材産出倍率。1.15 = 15%増。
  tradeMultiplier:1.15,
  // レア都市特性を持つ都市になる確率。0.2 = 20%。同じ拠点では固定結果。
  rareTraitChance:0.2,
  // レア都市特性の食料・資材産出倍率。1.05 = 5%増。
  rareTraitResourceMultiplier:1.05,
  // 軍事都市・城塞都市に付与する防衛値。
  defenseBonus:20,
  // 魔法・信仰・学術都市に付与する治安系ボーナス。
  civicBonus:5
});

// 拠点人口の技能から算出する生産力の補正表。種族とクラスの対応は種族.json、技能値はクラス.jsonを正本にする。
export const V39_SETTLEMENT_PRODUCTION_BALANCE = Object.freeze({
  // 技能値と技能倍率の対応表。節点の間は直線補間し、範囲外は両端の倍率で固定する。
  skillMultiplierSteps:Object.freeze([
    Object.freeze({ skill:-25, multiplier:0.50 }),
    Object.freeze({ skill:0, multiplier:0.65 }),
    Object.freeze({ skill:15, multiplier:0.80 }),
    Object.freeze({ skill:25, multiplier:0.90 }),
    Object.freeze({ skill:35, multiplier:1.00 }),
    Object.freeze({ skill:50, multiplier:1.15 }),
    Object.freeze({ skill:75, multiplier:1.40 }),
    Object.freeze({ skill:100, multiplier:1.65 }),
    Object.freeze({ skill:125, multiplier:1.90 })
  ])
});

// 一般村の交渉・依頼・襲撃で使用する暫定値。
export const V39_NEUTRAL_VILLAGE_BALANCE = Object.freeze({
  // 新規マップ開始時に配置する一般村の既定数。開始設定で0〜最大数へ変更できる。
  initialVillageCount:2,
  // 開始設定で指定できる一般村数の上限。配置できない地形しかない場合はこの値未満になる。
  maxInitialVillageCount:8,
  // 村中心からの範囲。1 = 中心1マスと周囲6マス。
  territoryRadius:1,
  // 初めて出会う一般村との関係値。
  initialRelation:0,
  // 一般村との関係値の下限。
  relationMin:-100,
  // 一般村との関係値の上限。
  relationMax:100,
  // 交流時に消費する食料量。
  improveRelationCost:10,
  // 交流1回で増える関係値。
  improveRelationGain:5,
  // 依頼完了時に増える関係値。
  questRelationGain:15,
  // 村Lv1の依頼で要求する資源量。村Lvに比例する。
  questBaseRequirement:20,
  // 依頼完了時に受け取る別種資源の量。
  questReward:10,
  // 属国化に必要な最低関係値。
  vassalRelationRequired:60,
  // 村の暫定貢納額へ掛ける割合。0.5 = 50%。
  vassalTributeRate:0.5,
  // プレイヤーが村を襲撃した時に失う関係値。
  raidRelationLoss:30,
  // 外部襲撃を1ターンごとに判定する確率。0.08 = 8%。
  raidChancePerTurn:0.08,
  // 外部襲撃を防げなかった時に失う村人口の割合。0.08 = 8%。
  raidPopulationLossRate:0.08
});

// 災害.jsonへ発生条件・範囲・継続効果の列を追加するまでの暫定定義。
// キーは災害.jsonのIDであり、災害名を処理本体の分岐には使わない。
// JSON側へ同名列が追加された場合は、v39-natural-events.jsがその値を優先する。
export const V39_PROVISIONAL_DISASTER_BALANCE = Object.freeze({
  // 1ターンに自然発生を試行する最大件数。強制発生はこの制限を受けない。
  maximumNaturalEventsPerTurn:1,
  // 同じ災害種別を同一マスで再発生させない暫定待機ターン。
  sameTileCooldownTurns:4,
  // 地形.jsonの既存災害相性列と災害IDの対応。未対応の災害は補正なし(1.0倍)で判定する。
  // 列値0.20は発生率を1.20倍、-0.10は0.90倍として扱う。
  terrainAffinityFieldByDisasterId:Object.freeze({
    "災害:洪水":"洪水",
    "災害:暴風":"台風",
    "災害:地震":"地震",
    "災害:落雷嵐":"雷嵐",
    "災害:大寒波":"吹雪"
  }),
  // JSONに数値列がない災害の仮定義。targetTerrainは地形名の部分一致。
  rulesById:Object.freeze({
    "災害:山火事":Object.freeze({ icon:"火", chance:0.012, targetTerrain:["森林", "森"], radius:1, duration:2, yieldMultiplier:0.5, securityLoss:5, unitDamageRate:0.10 }),
    "災害:洪水":Object.freeze({ icon:"水", chance:0.010, targetTerrain:["河川", "海", "湖", "湿地", "沼"], radius:1, duration:2, yieldMultiplier:0.5, securityLoss:4, unitDamageRate:0.06 }),
    "災害:干ばつ":Object.freeze({ icon:"乾", chance:0.010, targetTerrain:["平地", "草原", "荒野", "砂漠"], radius:2, duration:3, yieldMultiplier:0.5, securityLoss:3 }),
    "災害:暴風":Object.freeze({ icon:"風", chance:0.008, targetTerrain:[], radius:2, duration:2, yieldMultiplier:0.8, securityLoss:2 }),
    "災害:地震":Object.freeze({ icon:"震", chance:0.006, targetTerrain:["山", "岩", "丘"], radius:1, duration:1, yieldMultiplier:0.7, securityLoss:7, unitDamageRate:0.12 }),
    "災害:落雷嵐":Object.freeze({ icon:"雷", chance:0.006, targetTerrain:[], radius:1, duration:1, yieldMultiplier:0.9, securityLoss:3, unitDamageRate:0.15 }),
    "災害:大寒波":Object.freeze({ icon:"冷", chance:0.006, targetTerrain:["雪", "氷", "山"], radius:2, duration:2, yieldMultiplier:0.7, securityLoss:3 }),
    "災害:熱波":Object.freeze({ icon:"熱", chance:0.006, targetTerrain:["平地", "草原", "荒野", "砂漠"], radius:2, duration:2, yieldMultiplier:0.5, securityLoss:3 }),
    "災害:土砂崩れ":Object.freeze({ icon:"崩", chance:0.008, targetTerrain:["山", "岩", "丘"], radius:1, duration:1, yieldMultiplier:0.6, securityLoss:5, unitDamageRate:0.08 }),
    "災害:闇侵食":Object.freeze({ icon:"闇", chance:0.004, targetTerrain:["死の霧", "呪"], radius:1, duration:3, yieldMultiplier:0.7, securityLoss:5, undeadBonus:true }),
    "災害:聖光暴発":Object.freeze({ icon:"聖", chance:0.003, targetTerrain:[], radius:1, duration:1, yieldMultiplier:0.9, securityLoss:2, unitDamageRate:0.10 }),
    "災害:重力異常":Object.freeze({ icon:"重", chance:0.003, targetTerrain:[], radius:1, duration:2, yieldMultiplier:0.8, securityLoss:2 }),
    "災害:時間歪曲":Object.freeze({ icon:"時", chance:0.003, targetTerrain:[], radius:1, duration:2, yieldMultiplier:0.9, securityLoss:1 }),
    "災害:空間歪曲":Object.freeze({ icon:"空", chance:0.003, targetTerrain:[], radius:1, duration:2, yieldMultiplier:0.9, securityLoss:1 }),
    "災害:魂嵐":Object.freeze({ icon:"魂", chance:0.004, targetTerrain:["死の霧", "呪"], radius:1, duration:2, yieldMultiplier:0.8, securityLoss:4, unitDamageRate:0.10, undeadBonus:true }),
    "災害:瘴気":Object.freeze({ icon:"瘴", chance:0.005, targetTerrain:["沼", "湿地", "死の霧"], radius:1, duration:2, yieldMultiplier:0.7, securityLoss:4, unitDamageRate:0.08 }),
    "災害:疫病":Object.freeze({ icon:"病", chance:0.005, targetMode:"settlement", radius:0, duration:3, yieldMultiplier:0.8, securityLoss:6 }),
    "災害:反乱":Object.freeze({ icon:"乱", chance:0.003, targetMode:"settlement", radius:0, duration:2, yieldMultiplier:0.8, securityLoss:8 }),
    "災害:飢饉":Object.freeze({ icon:"飢", chance:0.005, targetMode:"settlement", radius:0, duration:3, yieldMultiplier:0.6, securityLoss:6 }),
    "災害:資源枯渇":Object.freeze({ icon:"枯", chance:0.004, targetMode:"settlement", radius:0, duration:3, yieldMultiplier:0.5, securityLoss:2 }),
    "災害:信仰崩壊":Object.freeze({ icon:"信", chance:0.003, targetMode:"settlement", radius:0, duration:3, yieldMultiplier:0.9, securityLoss:5 }),
    "災害:経済恐慌":Object.freeze({ icon:"恐", chance:0.003, targetMode:"settlement", radius:0, duration:3, yieldMultiplier:0.7, securityLoss:3 }),
    "災害:魔獣暴走":Object.freeze({ icon:"獣", chance:0.004, targetTerrain:[], radius:1, duration:1, yieldMultiplier:1, securityLoss:4, spawnEnemy:true }),
    "災害:流星落下":Object.freeze({ icon:"星", chance:0.002, targetTerrain:[], radius:1, duration:1, yieldMultiplier:0.5, securityLoss:8, unitDamageRate:0.25 })
  })
});

// アンデッド自然発生の暫定値。正式な出現敵タグ・発生条件列が追加されるまで使用する。
export const V39_UNDEAD_SPAWN_BALANCE = Object.freeze({
  // 死の霧マスに毎ターン行う自然発生判定。0.02 = 2%。
  deathMistChancePerTile:0.02,
  // 死体資源を含む地上戦利品のマスに毎ターン行う稀な補助発生判定。0.01 = 1%。
  corpseChancePerTile:0.01,
  // 闇侵食・魂嵐など、undeadBonusを持つ災害中の追加判定。
  disasterBonusChancePerTile:0.05,
  // 1ターンの自然発生上限。強制発生はこの制限を受けない。
  maximumSpawnCountPerTurn:2,
  // 同じマスで再発生させない待機ターン。
  sameTileCooldownTurns:5,
  // TEST ONで放浪者の周辺脅威として数えるヘックス距離。将来の救援・駆除依頼も同じ範囲を使う。
  threatRangeTiles:1,
  // 出現するクラスとLv帯。クラス.jsonの名前を参照する。
  candidates:Object.freeze([
    Object.freeze({ race:"ゾンビ", className:"ゾンビ", levelMin:1, levelMax:3, weight:5 }),
    Object.freeze({ race:"スケルトン", className:"スケルトン", levelMin:1, levelMax:4, weight:3 }),
    Object.freeze({ race:"ゴースト", className:"ゴースト", levelMin:2, levelMax:5, weight:2 })
  ])
});

// 拠点発展の調整値。既存の村・町区画を再利用したときの工期短縮に使う。
export const V39_SETTLEMENT_DEVELOPMENT_BALANCE = Object.freeze({
  // 発展先の占有マスに既存の村・町区画が1マス含まれるごとに短縮するターン数。
  reusedResidentialTileTurnReduction:1
});

// 特産品の配置・幸福度の暫定値。正式な種類は特産品シート追加後に差し替える。
export const V39_CAVE_BALANCE = Object.freeze({
  mapWidth:25, // 暫定：洞窟の横マス数。地上HEXの描画寸法に合わせて高さと組み合わせる。
  mapHeight:28, // 暫定：横62px・行間56pxで外形がほぼ正方形になる縦マス数。
  roomPositionJitter:2, // 暫定：形状の接続構成を保ちながら部屋中心を動かす最大マス数。
  irregularRoomRate:0.6, // 暫定：楕円ではなく波形の輪郭を持つ部屋の割合。
  roomRadiusScaleMin:0.85, // 暫定：元の部屋半径に掛けるランダム倍率の下限。
  roomRadiusScaleMax:1.25, // 暫定：部屋半径倍率の上限。
  roomOutlineVariation:0.12, // 暫定：不規則な部屋輪郭の膨らみ・凹みの割合。
  corridorBendRate:0.6, // 暫定：長い通路に曲がりを追加する割合。
  // 地下限定: 通常の視界へ追加するマス数（索敵・隠密の能力値は変えない）。
  visionBonusTiles:2,
  visionScoutStep:37.5, // 地下限定：この索敵値ごとに視界を1マス増やす。地上は75。
  // 地下限定: 正の射程の倍率。射程0・未記載は隣接1マスのまま。
  attackRangeMultiplier:2,
  surfaceEntranceLinkDistance:6, // 暫定：地上洞窟を同じ地下へ接続する中心からの距離。
  maxSurfaceEntrances:4, // テンプレートの出入口数上限。超える入口は別グループにする。
  tilesPerMonster:12, // 暫定：安全地帯を除いた通行可能12マスにつき敵1体。
  encounterGroupRadius:2, // 暫定：洞窟の同一遭遇グループをアンカーから通路2マス以内へ近接配置。
  entranceSafeDistance:2, // 暫定：出入口から2マス以内には敵を配置しない。
  drakeWeight:3, // 暫定：洞窟のドレイク候補は他種の3倍の抽選重み。
  maxTestLevel:15, // 洞窟テストで自動配置する通常敵の最大Lv。
  partySize:3, // 洞窟探索テストの作成人数。
  moveApPerTile:20, // 暫定：パーティー移動1マスにつき生存者全員が消費するAP。
  visionDistance:6, // 暫定：洞窟探索の可視範囲。壁に遮られる通路距離。
  enemyDetectDistance:7, // 暫定：好戦的な洞窟敵がパーティーを追う通路距離。
  enemyMoveSteps:2, // 暫定：敵ターンで移動する最大マス数。
  floorLevelStep:1, // 暫定：階層ごとの敵Lv増加。
  adventureEnemyLevelCap:40, // 暫定：探索ゲームでの敵Lv上限。
  logLimit:40, // 洞窟探索ログの保持件数。
  followerStepMs:160, // 洞窟パーティーの追従表示で1マス移動にかける時間（ミリ秒）。
  bossFloorInterval:3, // 洞窟の階層探索で3層ごとにボス1体。0で配置を停止。
  testFloorsPerHeight:3, // テストの難易度高度区分。1〜3層=0、4〜6層=1。地形高度は変えない。
  partyOrderLongPressMs:550, // 隊列変更メニューを開く長押し時間（ミリ秒）。
  partyOrderCancelDistance:8, // 指がこの距離（px）以上動いたらスクロールとみなし長押しを取消。
  bossLevelBonus:5, // 暫定：洞窟候補の最大Lv＋階層補正へ加えるボスLv。
  herbSites:1, // 暫定：階層ごとの薬草群生地数。
  mushroomSites:1, // 暫定：階層ごとのキノコ群生地数。
  oreSites:3, // 暫定：階層ごとの鉱石採取地点数。
  gemSites:2, // 暫定：階層ごとの宝石採取地点数。
  recoveryUses:3, // 暫定：群生地1地点で休息できる回数。
  recoveryHpRate:0.25, // 暫定：1回の休息で生存者それぞれの最大HP25%を回復。
  recoveryApCost:20, // 暫定：休息時に生存者全員が消費するAP。
  miningApCost:30, // 暫定：採取担当キャラが1回で消費するAP。
  oreDeposit:3, // 暫定：鉱石1地点の埋蔵数。1回の採取で1個。
  gemDeposit:1, // 暫定：宝石1地点の埋蔵数。1回の採取で1個。
});

export const V39_SPECIALTY_BALANCE = Object.freeze({
  minimumResourceSites:1, // 各特殊素材の全体最低地点数。操作プレイヤー数が多い場合はその人数を下限にする。
  minimumResourceRegionTiles:8, // 暫定：適正地形が連続8マス以上の地域ごとに各素材1地点を確保。0で地域保証を停止。
  harvestTurns:5, // 特殊資源1マスにつき1個を採取する基本周期（ターン）。
  harvestAmount:1, // 1周期で在庫へ加算する基本個数。
  researchSpeedPerLevel:0.2, // 暫定: 完了研究Lvごとの採取速度加算。周期進捗へ掛ける。
  placementRate:0.12, // 配置可能なマスの12%に特産品を1種類配置する。
  happinessPerType:2, // 発見済みの自領特産品1種類あたりの幸福度目標加算。
  happinessCap:20, // 種類数による幸福度加算の上限。
  markerSizeTiles:0.28, // マス幅に対する中央表示のアイコンの大きさ。
  testUndiscoveredAlpha:0.6, // TEST ON時の未発見特産品の透明度。発見状態は変更しない。
  occupiedMarkerSizeTiles:0.23, // ユニットがいるマスの右上アイコンの大きさ。
  occupiedOffsetRightTiles:0.28, // マス中央から右へずらす量（マス幅の割合）。
  occupiedOffsetUpTiles:0.28 // マス中央から上へずらす量（マス幅の割合）。
});

// 外交友好度・条約・AI判断の暫定値。確定後はこの定義だけを差し替える。
export const V39_DIPLOMACY_BALANCE = Object.freeze({
  // 勢力間友好度の下限。
  relationMin:-100,
  // 勢力間友好度の上限。
  relationMax:100,
  // この値以下を敵対として表示し、AIが宣戦候補にする。
  hostileThreshold:-30,
  // この値以上を友好として表示する。
  friendlyThreshold:30,
  // 同盟を締結するための最低友好度。
  allianceThreshold:60,
  // 不可侵条約を締結するための最低友好度。
  nonAggressionThreshold:0,
  // 交易協定を締結するための最低友好度。
  tradeThreshold:20,
  // 戦争中でない勢力間友好度が0へ戻る1ターンごとの量。
  relationDriftPerTurn:1,
  // 条約の有効期間。単位はターン。
  treatyDurationTurns:20,
  // 交易協定中に各勢力が1ターンで得る金の量。
  tradeIncomePerTurn:5,
  // 交易協定中に1ターンで増える友好度。
  tradeRelationPerTurn:1,
  // 宣戦時に減る友好度。
  warRelationLoss:30,
  // 停戦時に増える友好度。
  peaceRelationGain:10
});
