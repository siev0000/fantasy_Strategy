import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/guardian-candidates',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const report=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
  await window.waitForV39MapRenderSettled();
  const {classData}=await import('/src/lib/game-data-registry.js');
  const {V39_VICTORY_GUARDIAN_CANDIDATES:config,V39_VICTORY_GUARDIAN_MINIONS:minionRules,chooseV39VictoryGuardian:choose}=await import('/src/lib/v39-victory-guardian-candidates.js');
  const {spawnV39VictoryLandmarkGuards:spawn}=await import('/src/v39/world/v39-victory-guard-spawn.js');
  const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
  const classes=new Set(classData.map(row=>row.名前)),map=window.__v39FieldRuntime.mapData;
  const terrains=['山岳','森','火山','海'];
  const landmarks=Object.keys(config).map((landmarkId,i)=>({id:`candidate-test-${i}`,landmarkId,name:landmarkId.split(':')[1],
   x:3+i*3,y:8,key:`${3+i*3},8`,terrain:terrains[i]}));
  const base={...window.getV39GameState(),enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:Object.fromEntries(landmarks.map(row=>[row.key,row]))};
  const samples=[];
  for(let seed=0;seed<100;seed++){
   const result=spawn(base,{...map,seed:String(seed)});
   if(result.reports.length!==4)throw new Error(`missing guardians: ${seed} ${JSON.stringify(result.reports)}`);
   const bosses=result.state.enemies.filter(u=>u.victoryGuard&&!u.strongMinion);
   samples.push(...bosses.map(u=>({landmarkId:landmarks.find(l=>l.key===u.victoryLandmarkKey).landmarkId,
    name:u.guardianSpeciesName,level:u.level,hp:u.hp,frame:art(u)?.sheetFrame})));
   if(result.state.enemies.some(u=>u.strongMinion&&u.guardianSpeciesName))throw new Error('duplicated divine minion');
   for(const landmark of landmarks){
    const minions=result.state.enemies.filter(u=>u.victoryLandmarkKey===landmark.key&&u.strongMinion);
    if(minions.length!==2)throw new Error(`minion count ${landmark.name}: ${minions.length}`);
    for(const unit of minions){
     if(!minionRules[landmark.landmarkId].some(rule=>rule.race===unit.race&&rule.className===unit.className))throw new Error('unlisted minion combination');
     if(unit.level<15||unit.level>20||!unit.sourceDefinitionId.startsWith('出現敵:'))throw new Error('invalid minion level or registration');
    }
   }
  }
  const result=spawn(base,{...map,seed:'save-test'}),again=spawn(result.state,map);
  window.setV39GameState(result.state,{reason:'guardian-candidates-test'});
  window.importV39SaveJson(window.exportV39SaveJson());
  const restored=window.getV39GameState().enemies.filter(u=>u.guardianSpeciesName).map(u=>u.guardianSpeciesName);
  const blocked=landmarks.map(landmark=>choose(landmark,{enemies:config[landmark.landmarkId].map(row=>({guardianSpeciesName:row.name,hp:10}))},classes,'blocked'));
  const deterministic=landmarks.every(l=>JSON.stringify(choose(l,base,classes,'fixed'))===JSON.stringify(choose(l,base,classes,'fixed')));
  return {samples,restored,names:result.state.enemies.filter(u=>u.guardianSpeciesName).map(u=>u.guardianSpeciesName),
   blocked,deterministic,again:again.reports.length,config};
 });
 assert(report.deterministic);assert.equal(report.again,0);assert(report.blocked.every(row=>row===null));
 assert.deepEqual(report.restored,report.names);
 for(const [id,candidates] of Object.entries(report.config)){
  assert.deepEqual([...new Set(report.samples.filter(row=>row.landmarkId===id).map(row=>row.name))].sort(),candidates.map(row=>row.name).sort());
 }
 for(const row of report.samples){assert(row.frame,`${row.name} artwork`);assert.equal(row.level,40);assert(row.hp>0);}
 await page.evaluate(async()=>{
  const {HEX_TILE_CONFIG:hex}=await import('/src/lib/phaser-map-panel-config.js');
  const camera=window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main;
  camera.setZoom(.8);camera.centerOn(7.5*hex.width,8*hex.rowStep);
  await window.waitForV39MapRenderSettled();
 });
 await page.screenshot({path:'output/web-game/guardian-candidates/field.png'});
 assert.deepEqual(errors,[]);
 console.log('All 11 guardian candidates: four lands, 100 seeds, unique exclusion, no duplicate minions, stable selection, save/load and artwork passed');
}finally{await browser.close();}
