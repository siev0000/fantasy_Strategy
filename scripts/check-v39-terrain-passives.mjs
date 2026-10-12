import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const read = path => readFileSync(path, "utf8");
const table = name => JSON.parse(read(`data/source/export/json/${name}.json`));
const tables = Object.fromEntries(["地形", "スキル一覧", "装備"].map(name => [name, table(name)]));
const registry = url(`const tables=${JSON.stringify(tables)};
export const getGameDataRows=name=>tables[name]||[];
export const findGameDataRow=(name,key,value)=>getGameDataRows(name).find(row=>row[key]===value);`);
const constants = url(read("frontend/src/constants/unitCommon.js").replace(
  /import \{ raceData \}[^\n]+/, `const raceData=${JSON.stringify(table("種族"))};`));
const location = url(read("frontend/src/lib/v39-terrain-location.js"));
const power = url(read("frontend/src/lib/skill-power.js").replace('"../constants/unitCommon.js"', JSON.stringify(constants)));
const passiveUrl = url(read("frontend/src/lib/v39-passive-rules.js")
  .replace('"../constants/unitCommon.js"', JSON.stringify(constants))
  .replace('"./game-data-registry.js"', JSON.stringify(registry))
  .replace('"./skill-power.js"', JSON.stringify(power))
  .replace('"./v39-terrain-location.js"', JSON.stringify(location)));
const terrainUrl = url(read("frontend/src/lib/v39-terrain-modifiers.js")
  .replace('"./game-data-registry.js"', JSON.stringify(registry))
  .replace('"../constants/unitCommon.js"', JSON.stringify(constants))
  .replaceAll('"./v39-terrain-location.js"', JSON.stringify(location))
  .replace('"./v39-passive-rules.js"', JSON.stringify(passiveUrl)));
const core = url(read("frontend/src/composables/unitCoreUtils.js"));
const balance = url(`export const V39_CAVE_BALANCE={visionScoutStep:37.5,visionBonusTiles:2};
export const V39_ATTACK_STEALTH_RECOVERY_TURNS=3;
export const V39_FOG_BALANCE={terrainNames:["霧","死の霧"],scoutPenaltyPerTile:50,visionPenaltyPerTile:1,defaultDurationTurns:3};`);
const fogUrl=url(read("frontend/src/lib/v39-fog-rules.js")
  .replace('"./v39-gameplay-balance.js"',JSON.stringify(balance))
  .replaceAll('"./v39-combat-ray.js"',JSON.stringify(url(read("frontend/src/lib/v39-combat-ray.js").replace('"./hex-grid.js"',JSON.stringify(url(read("frontend/src/lib/hex-grid.js")))))))
  .replace('"./v39-terrain-location.js"',JSON.stringify(location))
  .replace('"./v39-turn-timing.js"',JSON.stringify(url(read("frontend/src/lib/v39-turn-timing.js"))))
  .replace('"./hex-grid.js"',JSON.stringify(url(read("frontend/src/lib/hex-grid.js")))));
const detectionUrl = url(read("frontend/src/lib/v39-detection-rules.js")
  .replace('"../composables/unitCoreUtils.js"', JSON.stringify(core))
  .replace('"./v39-gameplay-balance.js"', JSON.stringify(balance))
  .replace('"./v39-terrain-modifiers.js"', JSON.stringify(terrainUrl))
  .replace('"./v39-fog-rules.js"',JSON.stringify(fogUrl)));
const { applyV39TerrainModifiers: apply } = await import(terrainUrl);
const { inspectV39Passive, resolveV39PassiveContext: context } = await import(passiveUrl);
const { resolveDetectionScoutValue: scout, resolveDetectionStealthValue: stealth, resolveV39UnitVisionRange: vision } = await import(detectionUrl);
const forestRow = tables.スキル一覧.find(row => row.名前 === "森との同化");
assert.ok(forestRow);
const unit = { x:1, y:1, status:{攻撃:100}, skillLevels:{索敵:70,隠密:20},
  techniques:[{source:forestRow}] };
const map = {grid:[["平地","平地","平地"],["平地","森","平地"],["平地","平地","平地"]]};
const forest = apply(unit, map), plain = apply({...unit,x:0}, map);
const terrainOnly=apply({...unit,techniques:[]},map);
assert.equal(forest.skillLevels.索敵 - terrainOnly.skillLevels.索敵, forestRow.索敵);
assert.equal(forest.skillLevels.隠密 - terrainOnly.skillLevels.隠密, forestRow.隠密);
assert.deepEqual(apply(forest,map),forest);
assert.deepEqual(apply({...forest,x:0},map),plain);
assert.deepEqual(inspectV39Passive(forestRow),[]);
assert.equal(context(forest,{名前:"通常",攻撃手段:"武器"},{mapData:map}).unit.skillLevels.索敵,forest.skillLevels.索敵);
assert.equal(context(plain,{名前:"通常",攻撃手段:"武器"},{mapData:map}).rows.length,0);
assert.equal(scout(unit,map),forest.skillLevels.索敵);
assert.equal(stealth(unit,{mapData:map}),forest.skillLevels.隠密);
assert.ok(vision(unit,map)>vision({...unit,x:0},map));
assert.equal(apply({...unit,x:null},map).passiveContextSkillNames.length,0);
map.grid[1][1]="平地";
assert.deepEqual(apply(forest,map),apply(unit,map));
map.grid[1][1]="森";
map.lavaMap=[[],[false,true]];
assert.equal(apply(unit,map).passiveContextSkillNames.length,0);
console.log("terrain passives: on-tile only, leave/transform/lava removal, no accumulation, combat/scout/stealth/vision passed");
