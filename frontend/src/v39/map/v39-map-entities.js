import {getV39ConstructionPlanPreviews} from '../../lib/v39-construction-plan-preview.js';
import {isV39VillageHostileToPlayer} from '../../lib/v39-village-hostility.js';
import {resolveV39WallEdgeSegment,collectV39JoinedWallPairs,resolveV39JoinedWallSegment,resolveV39SmoothedFootprintOutline} from '../../lib/v39-wall-edges.js';
import {resolveV39SettlementImageScale,resolveV39UnitImageScale} from '../../lib/map-entity-size-rules.js';
import {getV39UnitCast,describeV39Cast} from '../../lib/v39-casting-rules.js';
import {addV39FieldSymbol} from './v39-field-symbols.js';
import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { resolveV39EffectAreaGeometry } from "../../lib/v39-effect-area-geometry.js";
import { getFactionSettlements, getSelectedSettlement } from "../../lib/settlement-state.js";
import { resolveVillageScaleDefinition } from "../../composables/villageCoreUtils.js";
import {
  MAP_ENTITY_SIZE_RULES,
  tileRelativePx
} from "../../lib/map-entity-size-rules.js";
import {
  resolveEnemyArtwork,
  resolveNestArtwork,
  resolveSettlementArtwork,
  resolveUnitArtwork
} from "../../lib/map-entity-artwork.js";
import { resolveFacilityIconArtwork } from "../../lib/facility-icon-artwork.js";
import {getV39StorageFacilities,getV39FacilityStoredEntries} from '../../lib/v39-facility-storage.js';
import { resolveV39ResourceIconGlyph,resolveV39ResourceIconColor } from "../../lib/resource-icon-glyphs.js";
import { V39_SPECIALTY_BALANCE } from "../../lib/v39-gameplay-balance.js";
import defenseFieldImage from "../../../../assets/effect/320×240/シールド.webp";
import {resolveV39PlayerColor} from '../../lib/v39-player-colors.js';
import {getV39UnitWaitTint} from '../../lib/v39-unit-action-rules.js';
import {v39FieldUnitAngle,v39FieldUnitDepth,v39FieldUnitGroupKey} from '../../lib/v39-unit-field-presentation.js';
import {getV39TeleportGates} from '../../lib/v39-teleport-rules.js';
import teleportBalance from '../../../../config/v39-teleport.json';

const STRUCTURE_LAYER_DEPTH = 10;
const UNIT_LAYER_DEPTH = 12;
const ENEMY_IMAGE_FILL = 0.95;
const TEST_UNDISCOVERED_ENEMY_ALPHA = 0.4;

let structureContainer = null;
let constructionPreviewContainer=null;
let constructionPreviewSignature='';
let constructionLabelContainer = null;
let unitContainer = null;
let refreshTimer = null;
let refreshPendingDuringBatch = false;
let lastMarkerRenderSignature = null;
let markerArtworkVersion = 0;
const markerByEntityId = new Map();
const specialtyMarkers = new Map();
const textureLoadState = new WeakMap();

function tileMetrics() {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return { width, height, rowStep, oddRowOffsetX };
}

function tileCenter(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  return {
    x: (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y: (y * rowStep) + height / 2
  };
}

function activeScene() {
  const game = window.__v39FieldRuntime?.game;
  if (!game?.scene) return null;
  return game.scene.getScenes(true)?.[0] || null;
}

function gameState() {
  try {
    return typeof window.getV39GameState === "function"
      ? window.getV39GameState({includeWorlds:false})
      : null;
  } catch {
    return null;
  }
}

function isTestMode() {
  return window.isV39TestMode?.() === true || window.getV39DisplaySettings?.().testMode === true;
}

function finiteCoord(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : null;
}

function settlementOccupiedTiles(village) {
  const x = finiteCoord(village?.x);
  const y = finiteCoord(village?.y);
  if (x === null || y === null) return [];
  const centerKey = `${x},${y}`;
  const definition = resolveVillageScaleDefinition(village);
  const required = Math.max(1, Math.floor(Number(definition?.footprintTiles) || 1));
  const centerMap = village?.territoryResidentialCenterMap && typeof village.territoryResidentialCenterMap === "object"
    ? village.territoryResidentialCenterMap
    : {};
  const keys = [centerKey, ...Object.entries(centerMap)
    .filter(([tileKey, ownerKey]) => tileKey !== centerKey && String(ownerKey || "") === centerKey)
    .map(([tileKey]) => tileKey)];
  return [...new Set(keys)].slice(0, required).map(key => {
    const [tileX, tileY] = key.split(",").map(Number);
    return Number.isFinite(tileX) && Number.isFinite(tileY) ? { key, x:tileX, y:tileY } : null;
  }).filter(Boolean);
}

function settlementVisualBounds(village, baseSize) {
  const occupied = settlementOccupiedTiles(village);
  const fallback = tileCenter(village.x, village.y);
  if (occupied.length <= 1) {
    return { x:fallback.x, y:fallback.y, width:baseSize, height:baseSize, occupied };
  }
  const centers = occupied.map(tile => tileCenter(tile.x, tile.y));
  const xs = centers.map(point => point.x);
  const ys = centers.map(point => point.y);
  return {
    x:xs.reduce((sum, value) => sum + value, 0) / xs.length,
    y:ys.reduce((sum, value) => sum + value, 0) / ys.length,
    width:(Math.max(...xs) - Math.min(...xs)) + baseSize,
    height:(Math.max(...ys) - Math.min(...ys)) + baseSize,
    occupied
  };
}

function visualUnitSignature(unit) {
  if (!unit || typeof unit !== "object") return "";
  const profile = unit.combatProfile || {};
  return [
    unit.id ?? unit.unitId ?? unit.characterId,
    unit.x, unit.y, unit.name, unit.race, unit.raceName, unit.className, unit.class,
    unit.imageName, unit.image, unit.illustrationName, unit.画像,
    unit.icon, unit.iconName, unit.subIconName,
    unit.currentHp, unit.hp, unit.maxHp, unit.state, unit.condition, unit.waitTurnNumber, unit.recoveryWaitTargetPercent,resolveV39UnitImageScale(unit),
    unit.unitType, profile.mode, profile.unitTypeLabel, profile.memberCount, profile.populationCost,
    unit.lastStealthBreakTurn, unit.lastStealthBreakReason, unit.lastStealthAttackTurn,
    JSON.stringify(unit.shield), JSON.stringify(unit.barrier)
  ].map(value => String(value ?? "")).join("~");
}

function visualSettlementSignature(settlement) {
  if (!settlement || typeof settlement !== "object") return "";
  return [
    settlement.id, settlement.x, settlement.y, settlement.placed, settlement.ownerPlayerId,
    settlement.scaleKey, settlement.scaleLevel, settlement.scale, settlement.type,
    settlement.imageName, settlement.image, settlement.画像,
    ...(settlement.landExpansionProjects || []).flatMap(project => [project.tileKey, project.remainingTurns, project.paused]),
    ...Object.entries(settlement.territoryResidentialCenterMap || {}).sort().flat(),
    ...Object.entries(settlement.territoryTileModeMap || {}).sort().flat(),
    ...Object.entries(settlement.territoryTileConversionMap || {}).sort().flatMap(([key, value]) => [key, value?.targetMode, value?.remainingTurns]),
    ...Object.entries(settlement.tileFacilityMap || {}).sort().flatMap(([key, names]) => [key, ...(Array.isArray(names) ? names : [])]),
    ...(Array.isArray(settlement.constructionQueue) ? settlement.constructionQueue : []).flatMap(item => [item?.tileKey, item?.facilityName, item?.remainingTurns]),
    JSON.stringify(settlement.wallConstructionQueue||[])
  ].map(value => String(value ?? "")).join("~");
}

function visualNestSignature(nest) {
  if (!nest || typeof nest !== "object") return "";
  return [
    nest.id, nest.x, nest.y, nest.imageName, nest.image, nest.画像, nest.nestType, nest.type,
    ...(Array.isArray(nest.unitIds) ? nest.unitIds : [])
  ].map(value => String(value ?? "")).join("~");
}

function markerRenderSignature(faction, state) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const activeSettlement = getSelectedSettlement(faction);
  const playerUnits = Array.isArray(faction?.units) ? faction.units.map(visualUnitSignature).sort() : [];
  const foreignUnits = players
    .filter(player => String(player?.id || "") !== String(state?.activePlayerId || ""))
    .flatMap(player => Array.isArray(player?.factionState?.units) ? player.factionState.units.map(visualUnitSignature) : [])
    .sort();
  const neutralVillageUnits = (Array.isArray(state?.neutralVillages) ? state.neutralVillages : [])
    .flatMap(village => [JSON.stringify(village.hostilePlayerIds||village.lastPlayerRaid||null),...(village.defenseUnits||[]).map(visualUnitSignature)])
    .sort();
  return [
    String(state?.activePlayerId || ""),
    JSON.stringify(getV39TeleportGates(state)),
    JSON.stringify(players.map(p=>p.factionState?.combatRuntime?.pendingActionsByUnitId)),
    JSON.stringify(state.enemyCombatRuntime?.pendingActionsByEnemyId),
    String(state?.timeline?.turnNumber || ""),
    String(state?.activeWorldId || "surface"),
    JSON.stringify(window.__v39FieldRuntime?.mapData?.terrainDamage||{}),
    players.map(player=>`${player.id}:${resolveV39PlayerColor(state,player.id)}`).join('|'),
    String(faction?.selectedUnitId || ""),
    JSON.stringify((faction.facilityStorage||[]).map(e=>[e.unit?.id,e.tileKey,e.facilityName,e.worldId])),
    JSON.stringify((faction.soulStorage||[]).map(e=>[e.id,e.storageTileKey])),
    JSON.stringify((faction.deadUnitReserve||[]).filter(e=>e.corpseStorage).map(e=>[e.unitId,e.corpseStorage])),
    isTestMode() ? "test" : "normal",
    String(window.__v39VisibilityRenderVersion || 0),
    String(markerArtworkVersion),
    JSON.stringify(window.__v39FieldRuntime?.mapData?.defenseStructures || []),
    JSON.stringify(getFactionSettlements(faction).map(base=>base.wallConstructionQueue||[])),
    JSON.stringify((faction.units || []).map(unit => [unit.id, unit.shield, unit.barrier])),
    Object.entries(state?.specialtiesByTile || {}).map(([key, value]) => `${key}:${value.name}`).join("|"),
    Object.keys(faction?.exploration?.discoveredSpecialtiesByTile || {}).sort().join("|"),
    [...(Array.isArray(state?.settlements) ? state.settlements : []), activeSettlement].map(visualSettlementSignature).sort().join("|"),
    (Array.isArray(state?.enemyNests) ? state.enemyNests : []).map(visualNestSignature).sort().join("|"),
    playerUnits.join("|"),
    foreignUnits.join("|"),
    neutralVillageUnits.join("|"),
    (state.neutralVillages||[]).map(visualSettlementSignature).sort().join("|"),
    (Array.isArray(state?.enemies) ? state.enemies : []).map(visualUnitSignature).sort().join("|"),
    (Array.isArray(state?.wandererGroups) ? state.wandererGroups : []).map(group => [
      group?.id, group?.x, group?.y, ...(Array.isArray(group?.discoveredByPlayerIds) ? group.discoveredByPlayerIds : [])
    ].map(value => String(value ?? "")).join("~")).sort().join("|")
  ].join(";");
}

function clearMarkers() {
  // Keep expensive Phaser text textures when only unit markers need rebuilding.
  for (const {marker} of specialtyMarkers.values()) {
    if (unitContainer && marker.parentContainer === unitContainer) unitContainer.remove(marker,false);
  }
  if (structureContainer?.destroy) structureContainer.destroy(true);
  if (constructionLabelContainer?.destroy) constructionLabelContainer.destroy(true);
  if (unitContainer?.destroy) unitContainer.destroy(true);
  structureContainer = null;
  constructionLabelContainer = null;
  unitContainer = null;
  markerByEntityId.clear();
}

function hasActiveMarkerContainers(scene) {
  const children = scene?.children?.list || [];
  return structureContainer?.scene === scene
    && unitContainer?.scene === scene
    && children.includes(structureContainer)
    && children.includes(unitContainer);
}

function drawBase(scene, container, village) {
  if (!village?.placed) return;
  const x = finiteCoord(village.x);
  const y = finiteCoord(village.y);
  if (x === null || y === null) return;

  const artwork = resolveSettlementArtwork(village);
  const oldSpecSize = Number(artwork?.sizePx) || tileRelativePx(MAP_ENTITY_SIZE_RULES.base.diameterTiles);
  const bounds = settlementVisualBounds(village, oldSpecSize);
  const imageScale=resolveV39SettlementImageScale(resolveVillageScaleDefinition(village));
  const marker = scene.add.container(bounds.x, bounds.y).setName(
    village?.neutral === true ? "v39-neutral-village-marker" : "v39-settlement-marker"
  );
  marker.setData("settlementId", String(village?.settlementId || village?.id || ""));
  marker.setData("scaleKey", String(village?.scaleKey || ""));
  marker.setData("occupiedTileKeys", bounds.occupied.map(tile => tile.key));
  marker.setData("displayWidth", bounds.width);
  marker.setData("displayHeight", bounds.height);
  if (artwork && ensureArtworkTexture(scene, artwork)) {
    marker.add(scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5).setDisplaySize(bounds.width*imageScale, bounds.height*imageScale));
  } else {
    marker.add(scene.add.text(0, 0, "⌂", {
      fontSize: `${tileRelativePx(0.3)}px`,
      fontStyle: "bold",
      color: "#f0cf79",
      stroke: "#071014",
      strokeThickness: 2
    }).setOrigin(0.5));
  }
  container.add(marker);
}

function drawBases(scene, container, settlements, activeVillage, activePlayerId) {
  const seen = new Set();
  // 選択中拠点は勢力状態側が正本。世界一覧に同座標の旧データが残っていても先に描画する。
  for (const settlement of [activeVillage, ...(Array.isArray(settlements) ? settlements : [])]) {
    if (!settlement) continue;
    const x = finiteCoord(settlement.x);
    const y = finiteCoord(settlement.y);
    if (x === null || y === null) continue;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    const isOwnBase = settlement.id === activeVillage?.id || settlement.ownerPlayerId === activePlayerId;
    // 未探索の一般村はFogに隠す。ただしテストモードでは初期配置を確認できるよう全件表示する。
    if (!isOwnBase && !isTestMode() && window.isV39TileExplored?.(x, y) === false) continue;
    seen.add(key);
    drawBase(scene, container, { ...settlement, placed: settlement.placed !== false });
  }
}

function drawEnemyNests(scene, container, nests) {
  const revealAll = isTestMode();
  const rule = MAP_ENTITY_SIZE_RULES.nest;
  for (const nest of Array.isArray(nests) ? nests : []) {
    const x = finiteCoord(nest?.x);
    const y = finiteCoord(nest?.y);
    if (x === null || y === null) continue;
    if (!revealAll && window.isV39TileInCurrentVision?.(x, y) !== true) continue;

    const memberCount = Array.isArray(nest?.unitIds) ? nest.unitIds.filter(Boolean).length : 0;
    const nestScale = memberCount === 1 ? Number(rule.singleMemberScale) || 1 : 1;
    const diameter = tileRelativePx(rule.diameterTiles * nestScale);
    const iconSize = tileRelativePx(rule.iconTiles * nestScale);
    const glyphFontSize = tileRelativePx(rule.glyphFontTiles * nestScale);

    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-enemy-nest-marker");
    const artwork = resolveNestArtwork(nest);
    if (artwork && ensureArtworkTexture(scene, artwork)) {
      const image = scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5).setAlpha(0.92);
      const scale = Math.min(iconSize / Math.max(1, Number(image.width)), iconSize / Math.max(1, Number(image.height)));
      image.setScale(scale);
      marker.add(image);
    } else {
      marker.add(scene.add.circle(0, 0, iconSize / 2, 0x54252a, 0.88));
      addV39FieldSymbol(scene,marker,'nest',0,0,iconSize*.8,{label:'巣'});
    }
    marker.add(scene.add.circle(0, 0, diameter / 2, 0x000000, 0)
      .setStrokeStyle(Math.max(2, tileRelativePx(0.05)), 0xf0a06f, 0.95));
    markerByEntityId.set(String(nest.id || "").trim(), marker);
    container.add(marker);
  }
}

function firstCharacter(value, fallback = "施") {
  return Array.from(String(value || "").trim())[0] || fallback;
}

function addConstructionProgress(scene,marker,value){
  const size=tileRelativePx(MAP_ENTITY_SIZE_RULES.construction.turnFontTiles);
  const badge=scene.add.container(marker.x-tileRelativePx(MAP_ENTITY_SIZE_RULES.construction.turnOffsetLeftTiles),marker.y-tileRelativePx(MAP_ENTITY_SIZE_RULES.construction.turnOffsetUpTiles)).setName('v39-construction-progress');
  const remaining=String(value).match(/\d+/)?.[0],paused=/停止/.test(String(value));
  badge.setData('remainingTurns',remaining==null?null:Number(remaining)).setData('paused',paused);
  badge.add(scene.add.rectangle(0,0,size*(remaining?2.4:1.4),size*1.5,0x10242b,.95));
  addV39FieldSymbol(scene,badge,paused?'pause':'construction',remaining?-size*.55:0,0,size,{label:paused?'停止':'建設中'});
  if(remaining)badge.add(scene.add.text(size*.55,0,remaining,{fontSize:`${size}px`,fontStyle:'bold',color:'#fff2cb'}).setOrigin(.5));
  constructionLabelContainer.add(badge);marker.setData('turnLabel',badge);
}

function addTileTextMarker(scene, container, tileKey, label, options = {}) {
  const [x, y] = String(tileKey || "").split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const center = tileCenter(x, y);
  const marker = scene.add.container(
    center.x + (Number(options.offsetX) || 0),
    center.y + (Number(options.offsetY) || 0)
  ).setName(options.name || "v39-tile-text-marker");
  marker.setData("tileKey", tileKey);
  marker.setData("label", label);
  const radius = tileRelativePx(options.radiusTiles || 0.16);
  if (options.showBase !== false) {
  marker.add(scene.add.circle(0, 0, radius, options.fillColor || 0x28373b, options.fillAlpha ?? 0.96)
    .setStrokeStyle(Math.max(1.5, tileRelativePx(0.025)), options.strokeColor || 0xf0d28a, 1));
  if(options.symbol||/\p{L}/u.test(String(label)))addV39FieldSymbol(scene,marker,options.symbol||'facility',0,0,radius*1.7,{label:String(label)});
  else marker.add(scene.add.text(0, options.subLabel ? -2 : 0, label, {
    fontSize:`${tileRelativePx(options.fontTiles || 0.2)}px`,
    fontStyle:"bold",
    color:options.textColor || "#fff5d8",
    stroke:"#071014",
    strokeThickness:2
  }).setOrigin(0.5));
  }
  if (options.subLabel) addConstructionProgress(scene,marker,options.subLabel);
  container.add(marker);
  return marker;
}

function addTileFacilityMarker(scene, container, tileKey, facilityName, options = {}) {
  const label = firstCharacter(facilityName);
  const artwork = resolveFacilityIconArtwork(facilityName);
  if (!artwork || !ensureArtworkTexture(scene, artwork)) {
    return addTileTextMarker(scene, container, tileKey, label, options)?.setData("facilityName", String(facilityName || ""));
  }
  const frameKey = ensureArtworkSheetFrame(scene, artwork);
  if (!frameKey) {
    return addTileTextMarker(scene, container, tileKey, label, options)?.setData("facilityName", String(facilityName || ""));
  }
  const [x, y] = String(tileKey || "").split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const center = tileCenter(x, y);
  const marker = scene.add.container(
    center.x + (Number(options.offsetX) || 0),
    center.y + (Number(options.offsetY) || 0)
  ).setName(options.name || "v39-facility-marker");
  marker.setData("tileKey", tileKey);
  marker.setData("label", label);
  marker.setData("facilityName", String(facilityName || ""));
  marker.setData("iconFrame", frameKey);

  const iconSize = Math.max(1, Number(options.iconPx) || tileRelativePx(options.iconTiles || 0.46));
  const image = scene.add.image(0, 0, artwork.textureKey, frameKey)
    .setOrigin(0.5)
    .setName("v39-facility-icon-image")
    .setAlpha(options.iconAlpha ?? 1);
  const scale = Math.min(iconSize / Math.max(1, Number(image.width)), iconSize / Math.max(1, Number(image.height)));
  image.setScale(scale);
  marker.add(image);

  if (options.subLabel) addConstructionProgress(scene,marker,options.subLabel);
  container.add(marker);
  return marker;
}

function addResidentialVillageMarker(scene, container, tileKey, options = {}) {
  const artwork = resolveSettlementArtwork(options.settlementType?{type:options.settlementType}:{ type:"村", scaleKey:"village", scaleLevel:1 });
  if (!artwork || !ensureArtworkTexture(scene, artwork)) return null;
  const [x, y] = String(tileKey || "").split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const center = tileCenter(x, y);
  const marker = scene.add.container(center.x, center.y).setName(options.name || "v39-residential-village-marker");
  marker.setData("tileKey", tileKey);
  marker.setData("textureKey", artwork.textureKey);
  const iconSize = Math.max(1, Number(artwork.sizePx) || 60)
    *resolveV39SettlementImageScale(resolveVillageScaleDefinition(options.settlementType?{type:options.settlementType}:{scaleLevel:1}));
  const image = scene.add.image(0, 0, artwork.textureKey)
    .setOrigin(0.5)
    .setName("v39-residential-village-image").setAlpha(options.alpha ?? 1);
  const scale = Math.min(iconSize / Math.max(1, Number(image.width)), iconSize / Math.max(1, Number(image.height)));
  image.setScale(scale);
  marker.add(image);
  container.add(marker);
  return marker;
}

function drawSettlementTileMarkers(scene, container, faction, {settlements=getFactionSettlements(faction),visibleOnly=false}={}) {
  const state=gameState(),storageCounts=new Map();
  for(const facility of visibleOnly?[]:getV39StorageFacilities(state,state.activePlayerId)){
    const count=getV39FacilityStoredEntries(state,state.activePlayerId,facility).length;
    if(count)storageCounts.set(facility.tileKey,(storageCounts.get(facility.tileKey)||0)+count);
  }
  const villageIconSize = Number(resolveSettlementArtwork({ type:"村", scaleKey:"village", scaleLevel:1 })?.sizePx) || 60;
  const completedOffsetX = 0;
  const completedOffsetY = 0;
  const pendingOffsetX = 0;
  const pendingOffsetY = 0;
  const visible=key=>!visibleOnly||isTestMode()||window.isV39TileInCurrentVision?.(...String(key).split(',').map(Number))===true;
  for (const settlement of settlements) {
    const occupiedTileKeys = new Set(settlementOccupiedTiles(settlement).map(tile => tile.key));
    for (const project of settlement.landExpansionProjects || []) {
      if(!visible(project.tileKey))continue;
      addTileTextMarker(scene, container, project.tileKey, "開", {
        symbol:'expansion',
        name:"v39-land-expansion-marker", subLabel:project.paused ? "停止" : `${project.remainingTurns}T`,
        radiusTiles:0.17, fontTiles:0.2, fillColor:0x33585f, strokeColor:0xe8cf58
      });
    }
    for (const [tileKey, mode] of Object.entries(settlement?.territoryTileModeMap || {})) {
      if (!visible(tileKey)||String(mode) !== "settlement") continue;
      if (!occupiedTileKeys.has(tileKey)) addResidentialVillageMarker(scene, container, tileKey);
    }
    for (const [tileKey, conversion] of Object.entries(settlement?.territoryTileConversionMap || {})) {
      if(!visible(tileKey))continue;
      const targetMode = String(conversion?.targetMode || "");
      addTileTextMarker(scene, container, tileKey, targetMode === "settlement" ? "居" : "資", {
        symbol:targetMode==='settlement'?'housing':'resource',
        name:"v39-tile-conversion-marker",
        showBase:targetMode !== "settlement",
        subLabel:`${Math.max(0, Math.floor(Number(conversion?.remainingTurns) || 0))}T`,
        radiusTiles:0.17,
        fontTiles:0.2,
        fillColor:0xb45e24,
        strokeColor:0xffd36d
      });
      if (targetMode === "settlement") {
        // 円形の「居」マークの代わりに完成後の村画像を半透明で予告する。
        addResidentialVillageMarker(scene, container, tileKey, {
          name:"v39-residential-construction-preview",
          alpha:MAP_ENTITY_SIZE_RULES.construction.previewAlpha
        });
      }
    }
    for (const [tileKey, facilityNames] of Object.entries(settlement?.tileFacilityMap || {})) {
      if(!visible(tileKey))continue;
      if (settlement.territoryTileConversionMap?.[tileKey]?.targetMode === "settlement") continue;
      (Array.isArray(facilityNames) ? facilityNames : []).slice(0, 1).forEach(facilityName => {
        addTileFacilityMarker(scene, container, tileKey, facilityName, {
          name:"v39-facility-marker",
          offsetX:completedOffsetX,
          offsetY:completedOffsetY,
          iconPx:villageIconSize,
          iconTiles:0.46,
          radiusTiles:0.14,
          fontTiles:0.18,
          fillColor:0x234d43,
          strokeColor:0xa9e2ba
        });
      });
    }
    for (const item of Array.isArray(settlement?.constructionQueue) ? settlement.constructionQueue : []) {
      if(!visible(item.tileKey))continue;
      if (settlement.territoryTileConversionMap?.[item.tileKey]?.targetMode === "settlement") continue;
      addTileFacilityMarker(scene, container, item?.tileKey, item?.facilityName, {
        name:"v39-facility-construction-marker",
        subLabel:`${Math.max(0, Math.floor(Number(item?.remainingTurns) || 0))}T`,
        offsetX:pendingOffsetX,
        offsetY:pendingOffsetY,
        iconPx:villageIconSize,
        iconTiles:0.46,
        iconAlpha:0.68,
        radiusTiles:0.15,
        fontTiles:0.18,
        fillColor:0x8a5a24,
        strokeColor:0xffd36d
      });
    }
  }
  for(const [tileKey,count] of storageCounts){
    addTileTextMarker(scene,container,tileKey,String(count),{name:'v39-facility-storage-count',offsetX:tileRelativePx(.29),offsetY:-tileRelativePx(.25),radiusTiles:.14,fontTiles:.23,fillColor:0x17343d,strokeColor:0xe4d497});
  }
}

function selectUnit(unit) {
  if (window.isV39MapInputLocked?.() === true) return;
  const attackSession = window.getV39AttackSession?.();
  const targetX = finiteCoord(unit?.x);
  const targetY = finiteCoord(unit?.y);
  if (attackSession && targetX !== null && targetY !== null) {
    // During skill targeting, a friendly marker is a tile target, not a new actor selection.
    window.executeV39AttackAt?.(targetX, targetY);
    return;
  }
  if (!unit?.id || typeof window.updateV39ActiveFactionState !== "function") return;
  window.updateV39ActiveFactionState({ selectedUnitId: unit.id }, { reason: "map-unit-selected" });
  window.dispatchEvent(new CustomEvent("v39:unit-selected", { detail: { unitId: unit.id, unit } }));
}

function unitGroupsByTile(units, worldId) {
  const groups = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    if ((unit.worldId || "surface") !== worldId && !unit.isEnemy && String(unit.id).startsWith("cave-party")) continue;
    const x = finiteCoord(unit?.x);
    const y = finiteCoord(unit?.y);
    if (x === null || y === null) continue;
    const key = v39FieldUnitGroupKey(unit);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }
  return groups;
}

function representativeUnit(group, selectedUnitId) {
  if (!Array.isArray(group) || !group.length) return null;
  return group.find(unit => unit?.id === selectedUnitId) || group[0];
}

function sceneTextureStates(scene) {
  let states = textureLoadState.get(scene);
  if (!states) {
    states = new Map();
    textureLoadState.set(scene, states);
  }
  return states;
}

function ensureArtworkTexture(scene, artwork) {
  if (!artwork || !scene?.textures) return false;
  if (scene.textures.exists?.(artwork.textureKey)) return true;

  const states = sceneTextureStates(scene);
  const state = states.get(artwork.textureKey);
  if (state === "loading" || state === "failed") return false;

  states.set(artwork.textureKey, "loading");
  const image = new Image();
  image.onload = () => {
    try {
      if (!scene?.sys?.isActive?.() || !scene?.game?.renderer) return;
      if (!scene.textures.exists(artwork.textureKey)) {
        scene.textures.addImage(artwork.textureKey, image);
      }
      states.set(artwork.textureKey, "loaded");
      markerArtworkVersion += 1;
      scheduleRefresh();
    } catch (error) {
      states.set(artwork.textureKey, "failed");
      console.error("[v39-map-entities] texture registration failed", artwork.src, error);
    }
  };
  image.onerror = () => {
    states.set(artwork.textureKey, "failed");
    console.error(`[v39-map-entities] failed to load ${artwork.src}`);
  };
  image.src = artwork.src;
  return false;
}

function addUnitOwnerBorder(scene,marker,color){
  const {width,height,rowStep}=tileMetrics(),x=width/2-2,y=height/2-2,shoulder=rowStep-height/2;
  const border=scene.add.graphics().setName('v39-unit-owner-border').setData('ownerColor',color);
  border.lineStyle(2,color,1).strokePoints([{x:0,y:-y},{x,y:-shoulder},{x,y:shoulder},{x:0,y},{x:-x,y:shoulder},{x:-x,y:-shoulder}],true);
  marker.addAt(border,0);
}

function addUnitArtwork(scene, marker, unit, diameter) {
  const artwork = resolveUnitArtwork(unit);
  if (!artwork || !ensureArtworkTexture(scene, artwork)) return false;

  const frameKey = ensureArtworkSheetFrame(scene, artwork);
  const image = frameKey
    ? scene.add.image(0, 0, artwork.textureKey, frameKey).setOrigin(0.5)
    : scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5);
  const sourceWidth = Math.max(1, Number(image.width) || 1);
  const sourceHeight = Math.max(1, Number(image.height) || 1);
  const target = diameter * MAP_ENTITY_SIZE_RULES.unit.imageFill * resolveV39UnitImageScale(unit);
  const scale = Math.min(target / sourceWidth, target / sourceHeight);
  image.setScale(scale);
  image.setAngle(v39FieldUnitAngle(unit));
  if (unit?.state === "死亡" || Number(unit?.hp ?? unit?.currentHp) <= 0) image.setTint(0x777f82).setAlpha(0.72);
  else image.setTint(getV39UnitWaitTint(unit, window.getV39TimelineState?.()?.turnNumber));
  marker.add(image);
  return true;
}

function addDeadMark(scene, marker, unit, radius) {
  marker.setDepth(v39FieldUnitDepth(unit));
  const hp = Number(unit?.hp ?? unit?.currentHp);
  if (unit?.state !== "死亡" && (!Number.isFinite(hp) || hp > 0)) return;
  for(const child of marker.list)if(['Image','Text'].includes(child.type))child.setAngle(v39FieldUnitAngle(unit));
  marker.add(scene.add.text(radius * 0.48, -radius * 0.48, "×", {
    fontSize:`${Math.max(14, radius * 0.72)}px`, fontStyle:"bold", color:"#fff4f1",
    stroke:"#681e1e", strokeThickness:Math.max(2, radius * 0.1)
  }).setOrigin(0.5));
}

function militaryUnitMemberCount(unit) {
  const mode = String(unit?.combatProfile?.mode || "").trim();
  const type = `${unit?.unitType || ""} ${unit?.combatProfile?.unitTypeLabel || ""}`;
  if (mode !== "army" && mode !== "elite_army" && !type.includes("軍隊")) return 0;
  const memberCount = Math.floor(Number(unit?.combatProfile?.memberCount) || 0);
  const populationCost = Math.floor(Number(unit?.combatProfile?.populationCost) || 0);
  return Math.max(0, memberCount || populationCost);
}

function addMilitaryMemberCount(scene, marker, unit, radius) {
  const memberCount = militaryUnitMemberCount(unit);
  if (memberCount <= 0) return;
  const label = scene.add.text(radius * 0.68, -radius * 0.68, String(memberCount), {
    fontFamily:"Consolas, 'Courier New', monospace",
    fontStyle:"800",
    fontSize:`${Math.max(12, tileRelativePx(0.2))}px`,
    color:"#ffffff",
    stroke:"#09111f",
    strokeThickness:Math.max(3, tileRelativePx(0.05))
  }).setOrigin(0.5).setName("v39-military-unit-member-count");
  label.setResolution(2);
  marker.add(label);
}

function ensureArtworkSheetFrame(scene, artwork) {
  const frame = artwork?.sheetFrame;
  if (!frame || !scene?.textures?.exists?.(artwork.textureKey)) return "";

  const texture = scene.textures.get(artwork.textureKey);
  if (!texture) return "";

  const frameKey = String(
    frame.frameKey
    || `slot-${frame.sheetNumber ?? "sheet"}-${frame.slotNumber ?? 0}`
  );
  const hasFrame = typeof texture.has === "function"
    ? texture.has(frameKey)
    : Boolean(texture.frames?.[frameKey]);
  if (hasFrame) return frameKey;

  const source = texture.source?.[0];
  const sourceWidth = Math.max(1, Number(source?.width) || 1);
  const sourceHeight = Math.max(1, Number(source?.height) || 1);
  const columns = Math.max(1, Number(frame.columns) || 1);
  const rows = Math.max(1, Number(frame.rows) || 1);
  const width = sourceWidth / columns;
  const height = sourceHeight / rows;
  const x = Math.max(0, Number(frame.column) || 0) * width;
  const y = Math.max(0, Number(frame.row) || 0) * height;

  texture.add(frameKey, 0, x, y, width, height);
  return frameKey;
}

function addEnemyArtwork(scene, marker, enemy, diameter) {
  const artwork = resolveEnemyArtwork(enemy);
  if (!artwork || !ensureArtworkTexture(scene, artwork)) return false;

  const frameKey = ensureArtworkSheetFrame(scene, artwork);
  const image = frameKey
    ? scene.add.image(0, 0, artwork.textureKey, frameKey).setOrigin(0.5)
    : scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5);
  const sourceWidth = Math.max(1, Number(image.width) || 1);
  const sourceHeight = Math.max(1, Number(image.height) || 1);
  const target = diameter * ENEMY_IMAGE_FILL * resolveV39UnitImageScale(enemy);
  image.setScale(Math.min(target / sourceWidth, target / sourceHeight));
  image.setAngle(v39FieldUnitAngle(enemy));
  if (enemy?.state === "死亡" || Number(enemy?.hp ?? enemy?.currentHp) <= 0) image.setTint(0x777f82).setAlpha(0.72);
  marker.add(image);
  return true;
}

function addFallbackUnitGlyph(scene, marker, unit, radius, glyphFontSize, selected) {
  const sizScale=resolveV39UnitImageScale(unit);radius*=sizScale;glyphFontSize*=sizScale;
  const dead = unit?.state === "死亡" || Number(unit?.hp ?? unit?.currentHp) <= 0;
  const bg = scene.add.circle(0, 0, radius*.75, dead ? 0x555b5d : 0x152b34, dead ? 0.72 : 0.98);
  const glyph = scene.add.text(0, -0.5, (/\p{L}/u.test(String(unit.icon)) ? "◆" : String(unit.icon || "◆")).slice(0, 2), {
    fontSize: `${glyphFontSize}px`,
    fontStyle: "bold",
    color: "#e8f7fb"
  }).setOrigin(0.5);
  glyph.setAngle(v39FieldUnitAngle(unit));
  if (!dead) glyph.setTint(getV39UnitWaitTint(unit, window.getV39TimelineState?.()?.turnNumber));
  marker.add([bg, glyph]);
}

function addCastVisual(scene,marker,unit,radius){
  const cast=describeV39Cast(getV39UnitCast(null,unit.id),window.getV39TimelineState?.()?.turnNumber);
  if(!cast)return;
  const color=cast.ready?0xffdb73:0x78dce8;
  if(cast.ready){
    const circle=addV39FieldSymbol(scene,marker,'ready',0,0,radius*2,{color,name:'v39-cast-icon',label:cast.label});
    circle.setAlpha(.8);marker.sendToBack(circle);
  }else{
    addV39FieldSymbol(scene,marker,'cast',radius*.72,-radius*.78,radius*.85,{color,name:'v39-cast-icon',label:cast.label});
  }
}

function drawUnitGroup(scene, container, group, selectedUnitId, ownerColor) {
  const unit = representativeUnit(group, selectedUnitId);
  if (!unit) return;

  const x = finiteCoord(unit.x);
  const y = finiteCoord(unit.y);
  if (x === null || y === null) return;

  const selected = unit.id === selectedUnitId;
  const rule = MAP_ENTITY_SIZE_RULES.unit;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const glyphFontSize = tileRelativePx(rule.glyphFontTiles);
  const center = tileCenter(x, y);

  // One tile renders only one icon. No count/name text is permanently attached to the map.
  // Unit markers stay in world-space and scale exactly with their tile.
  const marker = scene.add.container(center.x, center.y).setName("v39-player-unit-marker");
  marker.setData('ownerColor',ownerColor);
  for (const member of group) {
    const id = String(member?.id || "").trim();
    if (id) markerByEntityId.set(id, marker);
  }
  const artworkAdded = addUnitArtwork(scene, marker, unit, diameter);
  addCastVisual(scene,marker,unit,radius);

  if (!artworkAdded) addFallbackUnitGlyph(scene, marker, unit, radius, glyphFontSize, selected);
  addUnitOwnerBorder(scene,marker,ownerColor);
  addDeadMark(scene, marker, unit, radius);
  addMilitaryMemberCount(scene, marker, unit, radius);

  marker.setSize(diameter, diameter);
  marker.setInteractive({ useHandCursor: true });
  marker.on("pointerdown", (_pointer, _lx, _ly, event) => {
    event?.stopPropagation?.();
    if(window.isV39SoulRecoverySelecting?.())return;
    if(window.handleV39WallConstructionTap?.({x,y},scene.cameras.main.getWorldPoint(_pointer.x,_pointer.y)))return;
    if(window.isV39LandConstructionOpen?.()){
      scene.v39Input?.selectTile?.({x,y},false,{notify:false});
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));return;
    }
    selectUnit(unit);
  });
  container.add(marker);
}

function drawUnits(scene, container, units, selectedUnitId, worldId, ownerColor) {
  const list = (Array.isArray(units) ? units : []).filter(unit=>(unit.worldId||"surface")===worldId);
  for (const group of unitGroupsByTile(list,worldId).values()) {
    drawUnitGroup(scene, container, group, selectedUnitId, ownerColor);
  }
}

function drawForeignUnits(scene, container, players, activePlayerId, worldId) {
  const rule = MAP_ENTITY_SIZE_RULES.unit;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const glyphFontSize = tileRelativePx(rule.glyphFontTiles);
  for (const player of Array.isArray(players) ? players : []) {
    if (player?.id === activePlayerId) continue;
    const ownerColor=resolveV39PlayerColor({players},player.id);
    for (const group of unitGroupsByTile((player?.factionState?.units||[]).filter(unit=>(unit.worldId||"surface")===worldId),worldId).values()) {
      const unit = representativeUnit(group, "");
      const x = finiteCoord(unit?.x);
      const y = finiteCoord(unit?.y);
      if (!unit || x === null || y === null) continue;
      const normallyVisible = window.isV39TileInCurrentVision?.(x, y) === true && group.some(member => window.isV39EntityDetected?.(member) === true);
      if (!isTestMode() && !normallyVisible) continue;
      const center = tileCenter(x, y);
      const marker = scene.add.container(center.x, center.y).setName("v39-foreign-unit-marker");
      marker.setData('ownerColor',ownerColor);
      addCastVisual(scene,marker,unit,radius);
      if (isTestMode() && !normallyVisible) marker.setAlpha(TEST_UNDISCOVERED_ENEMY_ALPHA);
      for (const member of group) {
        const id = String(member?.id || "").trim();
        if (id) markerByEntityId.set(id, marker);
      }
      if (!addUnitArtwork(scene, marker, unit, diameter)) {
        const sizScale=resolveV39UnitImageScale(unit);
        const dead = unit?.state === "死亡" || Number(unit?.hp ?? unit?.currentHp) <= 0;
        const bg = scene.add.circle(0, 0, radius*.75*sizScale, dead ? 0x555b5d : 0x35252c, 0.96);
        const glyph = scene.add.text(0, -0.5, (/\p{L}/u.test(String(unit?.icon)) ? "◆" : String(unit?.icon || "◆")).slice(0, 2), {
          fontSize:`${glyphFontSize*sizScale}px`, fontStyle:"bold", color:"#fff0f5"
        }).setOrigin(0.5);
        marker.add([bg, glyph]);
      }
      addUnitOwnerBorder(scene,marker,ownerColor);
      addDeadMark(scene, marker, unit, radius);
      addMilitaryMemberCount(scene, marker, unit, radius);
      container.add(marker);
    }
  }
}

function drawNeutralVillageUnits(scene, container, villages, worldId) {
  const rule = MAP_ENTITY_SIZE_RULES.unit;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const glyphFontSize = tileRelativePx(rule.glyphFontTiles);
  const revealAll = isTestMode();
  const units = (Array.isArray(villages) ? villages : [])
    .flatMap(village => (village.defenseUnits||[]).map(unit=>({...unit,villageHostile:isV39VillageHostileToPlayer(village,window.getV39ActivePlayer?.()?.id)})));

  for (const group of unitGroupsByTile(units,worldId).values()) {
    const unit = representativeUnit(group, "");
    const x = finiteCoord(unit?.x);
    const y = finiteCoord(unit?.y);
    if (!unit || x === null || y === null) continue;
    const normallyVisible = window.isV39TileInCurrentVision?.(x, y) === true && group.some(member => window.isV39EntityDetected?.(member) === true);
    if (!revealAll && !normallyVisible) continue;

    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-neutral-village-unit-marker");
    if (revealAll && !normallyVisible) marker.setAlpha(TEST_UNDISCOVERED_ENEMY_ALPHA);
    for (const member of group) {
      const id = String(member?.id || "").trim();
      if (id) markerByEntityId.set(id, marker);
    }

    if (!addUnitArtwork(scene, marker, unit, diameter)) {
      const sizScale=resolveV39UnitImageScale(unit);
      marker.add([
        scene.add.circle(0, 0, radius*.75*sizScale, 0x4a4021, 0.97),
        addV39FieldSymbol(scene,null,'guard',0,0,diameter*.65*sizScale,{label:'警備兵'})
      ]);
    }
    addUnitOwnerBorder(scene,marker,unit.villageHostile?0xef6959:0xe0c46c);
    addDeadMark(scene, marker, unit, radius);
    addMilitaryMemberCount(scene, marker, unit, radius);
    container.add(marker);
  }
}

function drawEnemies(scene, container, enemies, worldId) {
  const rule = MAP_ENTITY_SIZE_RULES.unit;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const glyphFontSize = tileRelativePx(rule.glyphFontTiles);
  const revealAllEnemies = isTestMode();
  for (const group of unitGroupsByTile(enemies,worldId).values()) {
    const enemy = representativeUnit(group, "");
    if (!enemy) continue;
    const x = finiteCoord(enemy.x);
    const y = finiteCoord(enemy.y);
    if (x === null || y === null) continue;
    const inCurrentVision = window.isV39TileInCurrentVision?.(x, y) === true;
    const detected = group.some(member => window.isV39EntityDetected?.(member) === true);
    const visibleByNormalRules = inCurrentVision && detected;
    if (!revealAllEnemies && !visibleByNormalRules) continue;
    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-enemy-marker");
    addCastVisual(scene,marker,enemy,radius);
    if (revealAllEnemies && !visibleByNormalRules) marker.setAlpha(TEST_UNDISCOVERED_ENEMY_ALPHA);
    for (const member of group) {
      const id = String(member?.id || "").trim();
      if (id) markerByEntityId.set(id, marker);
    }
    if (!addEnemyArtwork(scene, marker, enemy, diameter)) {
      const sizScale=resolveV39UnitImageScale(enemy);
      const bg = scene.add.circle(0, 0, radius*sizScale, 0x3a1717, 0.98)
        .setStrokeStyle(Math.max(2, tileRelativePx(0.04)), 0xe89090, 1);
      const glyph = scene.add.text(0, -0.5, "◆", {
        fontSize: `${glyphFontSize*sizScale}px`,
        fontStyle: "bold",
        color: "#fff0e8"
      }).setOrigin(0.5);
      marker.add([bg, glyph]);
    }
    addDeadMark(scene, marker, enemy, radius);
    addMilitaryMemberCount(scene, marker, enemy, radius);
    container.add(marker);
  }
}

function drawWanderers(scene, container, groups, activePlayerId) {
  const diameter = tileRelativePx(MAP_ENTITY_SIZE_RULES.unit.diameterTiles * 0.72);
  for (const group of Array.isArray(groups) ? groups : []) {
    const x = finiteCoord(group?.x);
    const y = finiteCoord(group?.y);
    if (x === null || y === null || !group?.discoveredByPlayerIds?.includes(activePlayerId) || window.isV39TileInCurrentVision?.(x, y) === false) continue;
    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-wanderer-marker");
    marker.add([
      scene.add.circle(0, 0, diameter / 2, 0x66552d, 0.96).setStrokeStyle(2, 0xf0d58a, 1),
      addV39FieldSymbol(scene,null,'wanderer',0,0,diameter*.7,{label:'旅人'})
    ]);
    markerByEntityId.set(String(group.id || "").trim(), marker);
    container.add(marker);
  }
}

function drawDefenseStructures(scene, container, imageContainer) {
  const { width, height, rowStep } = tileMetrics();
  const wallVisual=MAP_ENTITY_SIZE_RULES.wall,pillars=new Map();
  const structures=window.__v39FieldRuntime?.mapData?.defenseStructures||[];
  const pairById=new Map(collectV39JoinedWallPairs(structures).flatMap(pair=>pair.map(w=>[w.id,pair]))),drawnPairs=new Set();
  const pointsAt = tile => {
    const center = tileCenter(tile.x, tile.y), left = center.x - width / 2, top = center.y - height / 2;
    return [{x:center.x,y:top},{x:left+width,y:top+height-rowStep},
      {x:left+width,y:top+rowStep},{x:center.x,y:top+height},
      {x:left,y:top+rowStep},{x:left,y:top+height-rowStep}];
  };
  const segmentKey = (a,b) => [a,b].map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).sort().join("/");
  for (const defense of structures) {
    if (defense.hp <= 0) continue;
    const pair=pairById.get(defense.id),pairKey=pair?.map(w=>w.id).sort().join('|');
    if(pairKey&&drawnPairs.has(pairKey))continue;
    const visibleTiles=pair?pair.flatMap(w=>[w.edge.from,w.edge.to]):defense.edge?[defense.edge.from,defense.edge.to]:defense.tiles;
    if (!isTestMode() && !visibleTiles.some(tile => window.isV39TileInCurrentVision?.(tile.x,tile.y))) continue;
    if(pairKey)drawnPairs.add(pairKey);
    if (defense.kind === "結界") {
      const rule = MAP_ENTITY_SIZE_RULES.defenseField;
      const artwork = {src:defenseFieldImage,textureKey:"v39-defense-field-still",
        sheetFrame:{frameKey:`still-${rule.stillFrame}`,columns:1,rows:rule.sheetRows,column:0,row:rule.stillFrame}};
      if (ensureArtworkTexture(scene,artwork)) {
        const imageCenter = resolveV39EffectAreaGeometry(defense.tiles,rule.coverageScale);
        const diameter = imageCenter.diameter;
        const image = scene.add.image(imageCenter.x,imageCenter.y,artwork.textureKey,ensureArtworkSheetFrame(scene,artwork))
          .setName("v39-defense-field-image").setAlpha(rule.alpha).setDisplaySize(diameter,diameter);
        image.setData("defenseId",defense.id);
        imageContainer.add(image);
      }
    }
    const graphics = scene.add.graphics().setName("v39-defense-outline");
    const segments = new Map();
    for (const tile of defense.tiles) {
      const points = pointsAt(tile);
      for (let index = 0; index < 6; index++) {
        const a = points[index], b = points[(index+1)%6], key = segmentKey(a,b);
        if (segments.has(key)) segments.delete(key); else segments.set(key,[a,b]);
      }
    }
    let edges = [...segments.values()];
    if(defense.kind==='結界')edges=resolveV39SmoothedFootprintOutline(defense.tiles,tileCenter,tileMetrics());
    if (defense.edge) {
      edges=[pair?resolveV39JoinedWallSegment(pair,tileCenter,tileMetrics()):resolveV39WallEdgeSegment(defense.edge,tileCenter,tileMetrics())];
    }
    graphics.lineStyle(defense.kind === "壁" ? wallVisual.lineWidthPx : 3,defense.kind === "壁" ? wallVisual.color : 0x73e0ff,0.95);
    for (const [a,b] of edges) {
      graphics.lineBetween(a.x,a.y,b.x,b.y);
      if(defense.kind==='壁')for(const point of [a,b])pillars.set(`${point.x.toFixed(3)},${point.y.toFixed(3)}`,point);
      else if(defense.kind==='結界')graphics.fillStyle(0x73e0ff,.95).fillCircle(a.x,a.y,1.5).fillCircle(b.x,b.y,1.5);
      if(pair?.some(w=>w.hp<=0)){
        const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        graphics.lineStyle(2,wallVisual.pillarOutlineColor,1).lineBetween(middle.x-3,middle.y-4,middle.x+3,middle.y+4);
      }
    }
    container.add(graphics);
  }
  if(pillars.size){
    const graphic=scene.add.graphics().setName('v39-wall-pillars');
    graphic.fillStyle(wallVisual.color,1).lineStyle(wallVisual.pillarOutlinePx,wallVisual.pillarOutlineColor,1);
    for(const point of pillars.values())graphic.fillCircle(point.x,point.y,wallVisual.pillarRadiusPx)
      .strokeCircle(point.x,point.y,wallVisual.pillarRadiusPx);
    container.add(graphic);
  }
  const state=gameState(),owner=state?.players?.find(p=>p.id===state.activePlayerId);
  for(const base of getFactionSettlements(owner?.factionState))for(const [index,item] of (base.wallConstructionQueue||[]).entries()){
    const [a,b]=resolveV39WallEdgeSegment(item.edge,tileCenter,tileMetrics());
    const graphic=scene.add.graphics().setName('v39-wall-construction');
    graphic.lineStyle(3,index===0?0xe3b95f:0x9faeae,.5);
    const length=Math.hypot(b.x-a.x,b.y-a.y);
    for(let offset=0;offset<length;offset+=10){
      const end=Math.min(length,offset+6);
      graphic.lineBetween(a.x+(b.x-a.x)*offset/length,a.y+(b.y-a.y)*offset/length,a.x+(b.x-a.x)*end/length,a.y+(b.y-a.y)*end/length);
    }
    graphic.setData('remainingTurns',item.remainingTurns).setData('waiting',index>0);
    container.add(graphic);
  }
}

function renderConstructionPreview(){
  const scene=activeScene(),state=gameState(),current=window.getV39LandConstructionPreview?.();
  const planned=getV39ConstructionPlanPreviews(state);
  const previews=[...planned,...(current&&!planned.some(plan=>plan.tileKey===current.tileKey&&plan.facilityName===current.facilityName)?[current]:[])];
  const signature=JSON.stringify([previews,markerArtworkVersion,state?.activeWorldId]);
  if(!scene||!previews.length){constructionPreviewContainer?.destroy();constructionPreviewContainer=null;constructionPreviewSignature='';return;}
  if(constructionPreviewContainer?.scene===scene&&signature===constructionPreviewSignature)return;
  constructionPreviewContainer?.destroy();
  constructionPreviewContainer=scene.add.container(0,0).setDepth(STRUCTURE_LAYER_DEPTH+1).setName('v39-construction-preview-layer');
  constructionPreviewSignature=signature;
  for(const preview of previews){
    const container=scene.add.container(0,0).setName(preview.planned?'v39-planned-construction':'v39-selected-construction').setAlpha(preview.planned ? 0.4 : preview.edges ? 1 : 0.45);
    constructionPreviewContainer.add(container);drawConstructionGhost(scene,container,preview);
  }
}
function drawConstructionGhost(scene,container,preview){
  if(preview.edges){
    const graphics=scene.add.graphics().setName('v39-wall-construction-preview');
    const {width,height,rowStep}=tileMetrics();
    graphics.fillStyle(0xffdd72,.12);
    for(const tile of preview.wallTiles||[]){
      const c=tileCenter(tile.x,tile.y);
      graphics.fillPoints([{x:c.x,y:c.y-height/2},{x:c.x+width/2,y:c.y+height/2-rowStep},
        {x:c.x+width/2,y:c.y-height/2+rowStep},{x:c.x,y:c.y+height/2},
        {x:c.x-width/2,y:c.y-height/2+rowStep},{x:c.x-width/2,y:c.y+height/2-rowStep}],true);
    }
    const wallVisual=MAP_ENTITY_SIZE_RULES.wall;
    graphics.lineStyle(wallVisual.lineWidthPx,0xffdd72,.7).fillStyle(0xffdd72,.7);
    const planned=preview.edges.map((edge,id)=>({id,kind:'壁',edge,wallFacilityName:preview.facilityName,ownerId:'preview',settlementId:'preview'}));
    const pairs=new Map(collectV39JoinedWallPairs(planned).flatMap(pair=>pair.map(w=>[w.id,pair]))),seen=new Set();
    for(const wall of planned){
      if(seen.has(wall.id))continue;
      const pair=pairs.get(wall.id);(pair||[wall]).forEach(w=>seen.add(w.id));
      const [a,b]=pair?resolveV39JoinedWallSegment(pair,tileCenter,tileMetrics()):resolveV39WallEdgeSegment(wall.edge,tileCenter,tileMetrics());
      graphics.lineBetween(a.x,a.y,b.x,b.y).fillCircle(a.x,a.y,wallVisual.pillarRadiusPx).fillCircle(b.x,b.y,wallVisual.pillarRadiusPx);
      if(wall.id===0)graphics.fillStyle(0x70eaff,1).fillCircle((a.x+b.x)/2,(a.y+b.y)/2,6).fillStyle(0xffdd72,.7);
    }
    container.add(graphics);return;
  }
  if(preview.settlementType){
    addResidentialVillageMarker(scene,container,preview.tileKey,{name:'v39-construction-preview',settlementType:preview.settlementType});
    return;
  }
  addTileFacilityMarker(scene,container,preview.tileKey,preview.facilityName,{
    name:'v39-construction-preview',iconPx:60,radiusTiles:.3,fontTiles:.25,
    fillColor:0x244d50,strokeColor:0x91dce5
  });
}

function renderMarkers() {
  const scene = activeScene();
  const state = gameState();
  const player = state?.players?.find(row => row.id === state.activePlayerId) || state?.players?.[0];
  const faction = player?.factionState;
  const worldId = state?.activeWorldId || 'surface';
  if (!scene || !faction) return false;

  renderConstructionPreview();
  const signature = markerRenderSignature(faction, state);
  if (signature === lastMarkerRenderSignature && hasActiveMarkerContainers(scene)) return true;
  lastMarkerRenderSignature = signature;

  clearMarkers();
  structureContainer = scene.add.container(0, 0).setDepth(STRUCTURE_LAYER_DEPTH).setName("v39-structure-layer");
  // ターン文字は領土線（depth16）や選択枠（depth17）より上に描く。
  constructionLabelContainer = scene.add.container(0, 0).setDepth(18).setName("v39-construction-label-layer");
  unitContainer = scene.add.container(0, 0).setDepth(UNIT_LAYER_DEPTH).setName("v39-unit-layer");
  const underground = window.__v39FieldRuntime?.mapData?.isUnderground === true;
  // 勢力の拠点一覧は地上・地下で共通だが、地上の建物を地下へ投影しない。
  if (!underground) drawBases(scene, structureContainer, state?.settlements, getSelectedSettlement(faction),state?.activePlayerId);
  drawEnemyNests(scene, structureContainer, state?.enemyNests);
  if (!underground) {
    drawSettlementTileMarkers(scene, structureContainer, faction);
    drawSettlementTileMarkers(scene, structureContainer, {}, {settlements:(state.neutralVillages||[]).filter(v=>!v.abandoned),visibleOnly:true});
  }
  drawDefenseStructures(scene, constructionLabelContainer, structureContainer);
  const ground=window.__v39FieldRuntime?.mapData?.terrainDamage||{};
  for(const k of new Set([...Object.keys(ground.cells||{}),...Object.keys(ground.pendingByTile||{}),...Object.keys(ground.rubbleByTile||{})])){
    const [x,y]=k.split(',').map(Number);if(!isTestMode()&&!window.isV39TileInCurrentVision?.(x,y))continue;
    const center=tileCenter(x,y),kind=ground.rubbleByTile?.[k]?'rubble':ground.pendingByTile?.[k]?'warning':'canyon';
    addV39FieldSymbol(scene,structureContainer,kind,center.x,center.y,tileMetrics().width*.65,{color:kind==='warning'?0xffb34d:0xc5aa83,name:`v39-ground-${kind}`}).setData('tileKey',k);
  }
  const gateArtwork={src:teleportBalance.gateImage,textureKey:'v39-teleport-gate'};
  for(const gate of getV39TeleportGates(state))for(const [side,tile] of [['a',gate.a],['b',gate.b]]){
    if(!isTestMode()&&!window.isV39TileInCurrentVision?.(tile.x,tile.y))continue;
    const center=tileCenter(tile.x,tile.y);
    if(!ensureArtworkTexture(scene,gateArtwork))continue;
    const marker=scene.add.image(center.x,center.y,gateArtwork.textureKey)
      .setDisplaySize(tileMetrics().width*teleportBalance.gateWidthTiles,tileMetrics().height*teleportBalance.gateHeightTiles)
      .setName(`teleport-gate:${gate.id}:${side}`);
    structureContainer.add(marker);markerByEntityId.set(marker.name,marker);
  }
  drawUnits(scene, unitContainer, faction.units, faction.selectedUnitId,worldId,resolveV39PlayerColor(state,state.activePlayerId));
  drawForeignUnits(scene, unitContainer, state?.players, state?.activePlayerId,worldId);
  drawNeutralVillageUnits(scene, unitContainer, state?.neutralVillages,worldId);
  drawEnemies(scene, unitContainer, state?.enemies,worldId);
  drawWanderers(scene, unitContainer, state?.wandererGroups, state?.activePlayerId);
  unitContainer.sort('depth');
  // 見えていない敵による位置変更で、その存在を漏らさない。
  const occupiedCenters = new Set(unitContainer.list.map(marker => `${marker.x},${marker.y}`));
  const retainedSpecialties = new Set();
  for (const [key, specialty] of Object.entries(state?.specialtiesByTile || {})) {
    const discovered = !!faction?.exploration?.discoveredSpecialtiesByTile?.[key];
    if (!discovered && !isTestMode()) continue;
    const [x, y] = key.split(",").map(Number);
    const center = tileCenter(x, y);
    const occupied = occupiedCenters.has(`${center.x},${center.y}`);
    const resourceName=String(specialty?.name??specialty?.名前??(typeof specialty==='string'?specialty:'')).trim();
    const glyph = resourceName?resolveV39ResourceIconGlyph(resourceName):'?';
    const textColor=resolveV39ResourceIconColor(resourceName)||'#fff5d8';
    const signature = JSON.stringify([resourceName,glyph,textColor,occupied,discovered]);
    const cached = specialtyMarkers.get(key);
    if (cached?.marker.scene === scene && cached.signature === signature) {
      unitContainer.add(cached.marker);
      retainedSpecialties.add(key);
      continue;
    }
    cached?.marker.destroy();
    const marker = addTileTextMarker(scene, unitContainer, key, glyph, {
      name:"v39-specialty-marker", radiusTiles:occupied ? 0.15 : 0.19,
      fontTiles:occupied ? V39_SPECIALTY_BALANCE.occupiedMarkerSizeTiles : V39_SPECIALTY_BALANCE.markerSizeTiles,
      offsetX:occupied ? tileRelativePx(V39_SPECIALTY_BALANCE.occupiedOffsetRightTiles) : 0,
      offsetY:occupied ? -tileRelativePx(V39_SPECIALTY_BALANCE.occupiedOffsetUpTiles) : 0,
      fillColor:0x16322c, strokeColor:0x91c4a0,textColor
    });
    marker?.setAlpha(discovered ? 1 : V39_SPECIALTY_BALANCE.testUndiscoveredAlpha);
    marker?.setData("discovered", discovered);
    marker?.setData("occupied", occupied);
    marker?.setData('resourceName',resourceName);
    if (marker) {
      specialtyMarkers.set(key,{marker,signature});
      retainedSpecialties.add(key);
    }
  }
  for (const [key,{marker}] of specialtyMarkers) {
    if (retainedSpecialties.has(key)) continue;
    marker.destroy();
    specialtyMarkers.delete(key);
  }
  return true;
}

function scheduleRefresh(delay = 0) {
  if (window.isV39MapRenderBatchActive?.() === true) {
    refreshPendingDuringBatch = true;
    return false;
  }
  refreshPendingDuringBatch = false;
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    if (window.isV39MapRenderBatchActive?.() === true) {
      refreshPendingDuringBatch = true;
      return;
    }
    if (renderMarkers()) return;
    refreshTimer = window.setTimeout(() => renderMarkers(), 80);
  }, delay);
  return true;
}

function install() {
  window.addEventListener('v39:construction-preview-changed',renderConstructionPreview);
  window.addEventListener("v39:field-generated", () => {
    lastMarkerRenderSignature = null;
    scheduleRefresh(60);
  });
  window.addEventListener("v39:game-state-changed", event => {
    if (event.detail?.reason !== "activity-log") scheduleRefresh();
  });
  window.addEventListener("v39:initial-placement-complete", () => scheduleRefresh());
  window.addEventListener("v39:unit-selected", () => scheduleRefresh());
  window.addEventListener("v39:display-settings-changed", () => scheduleRefresh());
  window.addEventListener("v39:visibility-rendered", () => scheduleRefresh());
  window.addEventListener("v39:map-render-batch-ended", event => {
    if (refreshPendingDuringBatch || event?.detail?.force === true) scheduleRefresh();
  });
  window.refreshV39MapEntities = () => renderMarkers();
  window.getV39MapEntityMarker = entityId => markerByEntityId.get(String(entityId || "").trim()) || null;
  scheduleRefresh(100);
}

install();
