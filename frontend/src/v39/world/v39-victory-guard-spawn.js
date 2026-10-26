import { getHexNeighborCoords } from "../../lib/hex-grid.js";
import { createV39EventEnemy, getV39EnemySpawnDefinitions } from "../ai/v39-enemy-spawn.js";
import {classData,enemySpawnData} from '../../lib/game-data-registry.js';
import {chooseV39VictoryGuardian,getV39GuardianMinionCandidates,getV39GuardianLandSettings} from '../../lib/v39-victory-guardian-candidates.js';
import {parseV39SpawnTerrains} from '../../lib/v39-spawn-terrain-list.js';
import {prepareV39HegemonyWorlds} from '../../lib/v39-hegemony-land-rules.js';

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const keyOf = (x, y) => `${integer(x)},${integer(y)}`;
const living = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";
const classNames=new Set(classData.map(row=>row.名前));
const minionDefinitions=[...new Set(enemySpawnData.flatMap(row=>parseV39SpawnTerrains(row.出現地形)))].flatMap(getV39EnemySpawnDefinitions);

function createGuardUnit(landmark, definition, { id, x, y, level, minion = false, nestId, squadId, guardian }) {
  const settings=getV39GuardianLandSettings(landmark);
  const race = text(definition?.種族, text(definition?.種族名));
  const className = text(definition?.サブクラス, race);
  const enemy = createV39EventEnemy({
    id,
    name:minion ? `${text(definition?.種族名, race)}の配下` : `${guardian.name}（${landmark.name}の守護者）`,
    race,
    className,
    level,
    x,
    y,
    metadata:{
      image:text(definition?.画像),
      aggressive:true,
      spawnTerrain:text(landmark?.terrain),
      sourceDefinitionId:text(definition?.ID),
      spawnType:minion ? "勝利対象配下" : "勝利対象守護者"
    }
  });
  if (!enemy) return null;
  return {
    ...enemy,
    ...(!minion?{guardianSpeciesName:guardian.name,strongFusionResultName:guardian.name,
      guardianCandidateUnique:guardian.unique===true}:{}),
    strongEnemy:minion !== true,
    strongMinion:minion === true,
    strongGroupId:`victory-guard-group:${landmark.id}`,
    strongLeaderId:minion ? `victory-guard:${landmark.id}:boss` : null,
    strongGroupType:"群体",
    strongGroupExpectedMinionCount:settings.minionCount,
    strongGroupCountSource:"勝利対象守護設定",
    strongGroupMinionSource:"登録済みの土地別種族・属性候補",
    nestType:text(definition?.巣, "守護の巣"),
    nestId,
    enemySquadId:squadId,
    territoryCenterX:integer(landmark?.x),
    territoryCenterY:integer(landmark?.y),
    territoryRadius:settings.territoryRadius,
    victoryLandmarkKey:text(landmark?.key),
    victoryGuard:true
  };
}

// 勝利対象1件ごとに既存の敵・巣・部隊状態へ守護編成を追加する。
export function spawnV39VictoryLandmarkGuards(state, mapData) {
  const existingEnemies = Array.isArray(state?.enemies) ? state.enemies : [];
  const existingNests = Array.isArray(state?.enemyNests) ? state.enemyNests : [];
  const existingSquads = Array.isArray(state?.enemySquads) ? state.enemySquads : [];
  const occupied = new Set([...existingEnemies,...(state?.players||[]).flatMap(player=>player.factionState?.units||[])]
    .filter(living).map(unit => keyOf(unit?.x, unit?.y)));
  const enemies = [...existingEnemies];
  const victoryLandmarksByTile={...state.victoryLandmarksByTile};
  const enemyNests = [...existingNests];
  const enemySquads = [...existingSquads];
  const reports = [];
  for (const landmark of Object.values(state?.victoryLandmarksByTile || {})) {
    if(landmark.peacefulOwnerPlayerId||landmark.hegemonyWorldId&&state.explorationWorlds?.[landmark.hegemonyWorldId]) continue;
    const landmarkKey = text(landmark?.key);
    if (!landmarkKey || existingNests.some(nest => text(nest?.victoryLandmarkKey) === landmarkKey)) continue;
    if (occupied.has(landmarkKey)) continue;
    const guardian=chooseV39VictoryGuardian(landmark,{...state,enemies},classNames,mapData?.seed||mapData?.id||'');
    if(!guardian)continue;
    const settings=getV39GuardianLandSettings(landmark);if(!settings)continue;
    const definition={種族:guardian.race,サブクラス:guardian.className,種族名:guardian.name,ID:`守護者:${guardian.name}`};
    const minionCandidates=getV39GuardianMinionCandidates(landmark,minionDefinitions);
    const minionOffset=[...`${mapData?.seed||''}:${landmark.id}`].reduce((value,char)=>(Math.imul(value,31)+char.charCodeAt(0))>>>0,0);
    const nestId = `victory-guard-nest:${landmark.id}`;
    const squadId = `victory-guard-squad:${landmark.id}`;
    const boss = createGuardUnit(landmark, definition, {
      id:`victory-guard:${landmark.id}:boss`, x:landmark.x, y:landmark.y,
      level:settings.bossLevel, nestId, squadId, guardian
    });
    if (!boss) continue;
    victoryLandmarksByTile[landmarkKey]={...landmark,guardianTrialIds:[...(guardian.trialIds||settings.trialIds)]};
    const members = [boss];
    occupied.add(landmarkKey);
    const minionMaxLevel = Math.max(1, number(boss?.level, 1) - settings.minionLevelOffset);
    const neighbors = getHexNeighborCoords(mapData?.w, mapData?.h, landmark.x, landmark.y, mapData?.worldWrapEnabled === true);
    for (const neighbor of neighbors) {
      if(!minionCandidates.length)break;
      if (members.length > settings.minionCount || occupied.has(neighbor.key)) continue;
      const selection=minionCandidates[(minionOffset+members.length-1)%minionCandidates.length];
      const minionLevel=Math.max(1,minionMaxLevel-(integer(landmark.x)+integer(landmark.y)+members.length)%(settings.minionLevelVariance+1));
      const minion = createGuardUnit(landmark, selection.row, {
        id:`victory-guard:${landmark.id}:minion-${members.length}`, x:neighbor.x, y:neighbor.y,
        level:minionLevel, minion:true, nestId, squadId
      });
      if (!minion) continue;
      members.push(minion);
      occupied.add(neighbor.key);
    }
    enemies.push(...members);
    enemyNests.push({
      id:nestId,
      name:`${landmark.name}の守護巣`,
      nestType:text(definition?.巣, "守護の巣"),
      race:text(definition?.種族, text(definition?.種族名)),
      sourceDefinitionId:text(definition?.ID),
      victoryLandmarkKey:landmarkKey,
      victoryGuard:true,
      squadId,
      x:integer(landmark.x), y:integer(landmark.y),
      territoryRadius:settings.territoryRadius,
      scaleLevel:1, scaleName:"守護", militaryLevel:1,
      population:members.length,
      unitIds:members.map(unit => unit.id), everHadUnits:true,
      foodStockByType:{}, materialStockByType:{}, equipmentInventory:[]
    });
    enemySquads.push({ id:squadId, nestId, unitIds:members.map(unit => unit.id), cargo:{ resourcesByType:{}, equipmentInventory:[] } });
    reports.push({ landmarkKey, landmarkName:landmark.name, guardianName:guardian.name, nestId, bossId:boss.id, minionCount:members.length - 1 });
  }
  return { state:{ ...state, enemies, enemyNests, enemySquads,victoryLandmarksByTile }, reports };
}

function install() {
  const spawnGuards = () => {
    const state = window.getV39GameState?.();
    const result = spawnV39VictoryLandmarkGuards(state, window.__v39FieldRuntime?.mapData);
    result.state=prepareV39HegemonyWorlds(result.state);
    if (!result?.reports?.length) return;
    window.setV39GameState?.({ enemies:result.state.enemies, enemyNests:result.state.enemyNests, enemySquads:result.state.enemySquads,
      explorationWorlds:result.state.explorationWorlds,victoryLandmarksByTile:result.state.victoryLandmarksByTile }, { reason:"victory-guard-spawned" });
    for (const report of result.reports) window.appendV39ActivityLog?.((state?.players || []).map(player => player.id), "勝利対象", `${report.landmarkName}の守護者「${report.guardianName}」が出現`, report);
  };
  window.addEventListener("v39:enemies-spawned", spawnGuards);
  // 勝利対象は初期拠点配置後に生成するため、通常敵の生成後でもここから守護者を追加する。
  window.addEventListener("v39:exploration-sites-generated", spawnGuards);
  window.spawnV39VictoryLandmarkGuards = () => {
    const state = window.getV39GameState?.();
    const result = spawnV39VictoryLandmarkGuards(state, window.__v39FieldRuntime?.mapData);
    result.state=prepareV39HegemonyWorlds(result.state);
    if (result?.reports?.length) window.setV39GameState?.({ enemies:result.state.enemies, enemyNests:result.state.enemyNests, enemySquads:result.state.enemySquads,
      explorationWorlds:result.state.explorationWorlds,victoryLandmarksByTile:result.state.victoryLandmarksByTile }, { reason:"victory-guard-spawned-manual" });
    return result;
  };
}

install();
