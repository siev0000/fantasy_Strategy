import {disasterData} from './game-data-registry.js';
import {V39_PROVISIONAL_DISASTER_BALANCE as defaults} from './v39-gameplay-balance.js';

const text=value=>String(value??'').trim();
const configured=(value,fallback=0)=>value===null||value===undefined||text(value)===''||!Number.isFinite(Number(value))?fallback:Number(value);
const flag=(value,fallback=false)=>value===undefined||value===null?fallback:value===true||String(value).toLowerCase()==='true';

export function resolveV39DisasterRule(value) {
  const row=typeof value==='string'?disasterData.find(row=>row.ID===value):value;
  if(!row?.ID)return null;
  const fallback=defaults.rulesById[row.ID]||{};
  return {
    id:text(row.ID),name:text(row.カテゴリ名),description:text(row.効果),
    enabled:flag(row.有効,true),icon:text(row.アイコン)||fallback.icon||'!',
    imageFile:text(row.画像ファイル),imageSlot:Math.floor(configured(row.画像番号)),
    chance:Math.min(1,Math.max(0,configured(row.基本発生率,fallback.chance||0))),
    targetTerrain:text(row.対象地形).split(/[、,，|/]/u).map(text).filter(Boolean),
    targetMode:text(row.対象種別)||fallback.targetMode||'terrain',
    radius:Math.max(0,Math.floor(configured(row.影響半径,fallback.radius||0))),
    duration:Math.max(1,Math.floor(configured(row.効果継続ターン,fallback.duration||1))),
    yieldMultiplier:Math.max(0,configured(row.周囲産出倍率,fallback.yieldMultiplier??1)),
    securityLoss:Math.max(0,configured(row.治安減少,fallback.securityLoss||0)),
    unitDamageRate:Math.min(1,Math.max(0,configured(row.最大HP割合ダメージ,fallback.unitDamageRate||0))),
    movementDamageRate:Math.min(1,Math.max(0,configured(row.移動時最大HP割合ダメージ))),
    stationaryDamageMultiplier:Math.max(0,configured(row.滞在ダメージ倍率,1)),
    damageElement:text(row.ダメージ属性),
    damagePower:Math.max(0,configured(row.ダメージ威力)),
    movementDamagePower:Math.max(0,configured(row.移動時ダメージ威力)),
    damagePattern:text(row.被害範囲方式)||'全域',
    randomDamageTileCount:Math.max(0,Math.floor(configured(row.ランダム被害マス数))),
    randomDamageTilesPerHit:Math.max(0,configured(row.ランダム被害基準マス数)),
    occurrenceMethods:text(row.発生方法)?text(row.発生方法).split(/[、,，|/]/u).map(text).filter(Boolean):['自然'],
    occurrenceCondition:text(row.発生条件),
    requiredConditionTurns:Math.max(0,Math.floor(configured(row.必要継続ターン))),
    spawnEnemy:flag(row.敵生成,fallback.spawnEnemy===true),
    undeadBonus:flag(row.アンデッド発生補正,fallback.undeadBonus===true),
    cooldown:Math.max(0,Math.floor(configured(row.同一マス待機ターン,defaults.sameTileCooldownTurns)))
  };
}
