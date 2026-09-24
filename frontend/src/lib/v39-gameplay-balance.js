// 仕様未確定の調整値はここへ集約し、確定後に処理本体を変えず差し替える。
// 攻撃の最低命中率。0.25 = 25%。
export const V39_HIT_RATE_MIN = 0.25;
// 攻撃の最大命中率。1.00 = 100%。
export const V39_HIT_RATE_MAX = 1.00;

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
  // 互換用。戦闘は「対象Lv1あたり」の基本EXPとして同じ15を使う。
  baseExpPerTargetLevel:15,
  // 倒した相手側の種族カテゴリ倍率。
  targetRaceMultipliers:Object.freeze({
    human:1.0,
    demi:1.25,
    demon:1.5,
    other:1.0
  }),
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
  // 部隊所属時は生存メンバーへ均等分配。soloは攻撃者だけが受け取る。
  splitAmongLivingSquadMembers:true,
  // 同じ対象を回復させて削り直すEXP稼ぎを防ぐため、1体から支払うのは最大HP100%分まで。
  capRewardedDamageAtMaxHp:true
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
  raidPopulationLossRate:0.08,
  // 村の軍事Lv1ごとの守備隊人数。
  defendersPerMilitaryLevel:2
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
