import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:800}}), errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3021",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.spawnV39Enemies==="function");
  const report=await page.evaluate(async()=>{
    window.startV39LocalSession(1,{playMode:"single-test"});
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"strong-animals");
    const initial=window.getV39GameState();
    window.setV39GameState({players:initial.players.map(player=>({...player,factionState:{...player.factionState,villagePlacementMode:false,
      initialSettlementCount:1,settlements:[{id:"start",settlementId:"start",placed:true,x:0,y:0}],
      units:player.factionState.units.map((unit,index)=>index ? unit : {...unit,isSovereign:true,unitType:"統治者"})}}))});
    const data=window.__v39FieldRuntime.mapData;
    data.worldWrapEnabled=false;
    window.__v39FieldRuntime.settings.islandCustomSettings={worldWrapEnabled:false};
    data.riverData={riverSet:new Set()};
    for(let y=0;y<data.h;y++)for(let x=0;x<data.w;x++){
      data.grid[y][x]="平地"; data.heightLevelMap[y][x]=0; data.specialMap[y][x]="";
      if(data.reliefMap?.[y])data.reliefMap[y][x]="";
      if(data.lavaMap?.[y])data.lavaMap[y][x]=false;
      data.strongMonsterMap[y][x]=true;
      if(data.strongMonsterInfoMap?.[y])data.strongMonsterInfoMap[y][x]=null;
    }
    window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:{}});
    const enemies=window.spawnV39Enemies();
    const {classData}=await import("http://127.0.0.1:3022/src/lib/game-data-registry.js");
    const {rowStatusVector}=await import("http://127.0.0.1:3022/src/composables/unitStatusUtils.js");
    const {STATUS_GROWTH_FIELDS}=await import("http://127.0.0.1:3022/src/constants/unitCommon.js");
    const {resolveMonsterSheetArtwork}=await import("http://127.0.0.1:3022/src/lib/monster-sheet-artwork.js");
    const bosses=enemies.filter(enemy=>enemy.strongEnemy);
    const checks=bosses.map(enemy=>{
      const baseline=window.deriveV39CharacterFromRaceClass({...enemy,level:enemy.level-enemy.strongAnimalClassLevel,strongAnimalClassName:"",strongAnimalClassLevel:0});
      const derived=window.deriveV39CharacterFromRaceClass(JSON.parse(JSON.stringify(enemy)));
      const row=classData.find(row=>row.名前===enemy.strongAnimalClassName);
      const growth=rowStatusVector(row,{statusGrowthFields:STATUS_GROWTH_FIELDS,statusGrowthDivisor:10});
      const correct=STATUS_GROWTH_FIELDS.every(key=>derived.status[key]===baseline.status[key]+growth[key]*enemy.strongAnimalClassLevel);
      return {race:enemy.race,name:enemy.name,level:enemy.level,extra:enemy.strongAnimalClassName,
        extraLv:enemy.strongAnimalClassLevel,baseLv:derived.baseLevel,correct,
        sameBaseLevels:derived.raceLevels===baseline.raceLevels && derived.classLevels===baseline.classLevels,
        slot:resolveMonsterSheetArtwork(enemy)?.sheetFrame.slotNumber};
    });
    const horseVariants=["エンジェル","デヴィル"].map(name=>checks.find(enemy=>enemy.race==="ホース"&&enemy.extra===name));
    const sampleIds=horseVariants.map((variant,index)=>enemies.find(enemy=>enemy.race==="ホース"&&enemy.strongAnimalClassName===["エンジェル","デヴィル"][index])?.id);
    const normal=enemies.filter(enemy=>!enemy.strongEnemy);
    return {checks,horseVariants,sampleIds,normalHasExtra:normal.some(enemy=>enemy.strongAnimalClassName),normalCount:normal.length};
  });
  assert.ok(report.checks.length>0);
  assert.ok(report.checks.every(enemy=>enemy.correct&&enemy.sameBaseLevels&&enemy.extraLv>0&&enemy.baseLv+enemy.extraLv===enemy.level));
  assert.ok(report.checks.every(enemy=>enemy.race==="ホース"||!['エンジェル','デヴィル'].includes(enemy.extra)));
  assert.equal(report.normalHasExtra,false);
  assert.ok(report.horseVariants.every(Boolean),"天使・悪魔の馬がどちらも抽選される");
  assert.equal(report.horseVariants[0].slot,8);
  assert.equal(report.horseVariants[1].slot,9);
  assert.equal(report.horseVariants[0].name,"ユニコーン");
  assert.equal(report.horseVariants[1].name,"バイコーン");
  await page.evaluate(ids=>{
    const enemies=window.getV39GameState().enemies;
    window.setV39GameState({enemyNests:[],enemySquads:[],enemies:ids.map((id,index)=>({...enemies.find(enemy=>enemy.id===id),x:12+index*3,y:12}))});
  },report.sampleIds);
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.waitForFunction(ids=>ids.every(id=>window.getV39MapEntityMarker(id)?.list.some(child=>child.type==="Image")),report.sampleIds);
  await page.evaluate(ids=>{
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const marker=window.getV39MapEntityMarker(ids[0]);
    scene.cameras.main.setZoom(2).centerOn(marker.x,marker.y);
  },report.sampleIds);
  await page.waitForTimeout(150);
  await page.screenshot({path:"output/web-game/v39-strong-animal.png"});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({bossCount:report.checks.length,normalCount:report.normalCount,horseVariants:report.horseVariants,
    classes:[...new Set(report.checks.map(enemy=>enemy.extra))],errors},null,2));
} finally {await browser.close();}
