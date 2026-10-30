import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/detection-bonus';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39ExpeditionTest();
  const d=await import('/src/lib/v39-detection-rules.js'),{normalizeGameStartSettings}=await import('/src/lib/game-start-settings.js');
  const {inspectEnemyAiState}=await import('/src/lib/v39-enemy-ai-planner.js');
  const {collectV39FactionVision}=await import('/src/lib/v39-faction-intelligence-rules.js');
  const bonus={detectionScoutBonus:50},zero={detectionScoutBonus:0},ground={isUnderground:false},cave={isUnderground:true};
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  check(normalizeGameStartSettings({}).detectionScoutBonus===50,'old/default settings');
  check(d.resolveEffectiveScoutAtDistance(0,1,ground,null,null,bonus)===50,'ground near +50');
  check(d.resolveEffectiveScoutAtDistance(0,2,ground,null,null,bonus)===0,'bonus must decay before clamping');
  check(d.resolveEffectiveScoutAtDistance(0,3,cave,null,null,bonus)===50,'cave near +50');
  check(d.resolveEffectiveScoutAtDistance(0,4,cave,null,null,bonus)===25,'cave distance decay');
  check(d.isDetectedByScout({scout:44,stealth:94,distance:1,gameSettings:bonus}),'equality should detect');
  check(!d.isDetectedByScout({scout:44,stealth:95,distance:1,gameSettings:bonus}),'above boundary');
  check(!d.isDetectedByScout({scout:44,stealth:94,distance:1,gameSettings:zero}),'zero disables bonus');
  check(!d.isDetectedByScout({scout:1000,stealth:0,inRange:false,gameSettings:bonus}),'cannot extend range');
  const fog={w:2,h:1,grid:[['平地','平地']],fogMap:[[true,true]]};
  check(d.resolveEffectiveScoutAtDistance(100,1,fog,{x:0,y:0},{x:1,y:0},bonus)===50,'fog still subtracts');
  const unit=(id,x,y,stealth=0)=>({id,name:id,x,y,hp:100,maxHp:100,ap:100,worldId:'surface',status:{索敵:0,隠密:stealth},skillLevels:{索敵:0,隠密:stealth},state:'生存'});
  const enemy={...unit('ai',0,0),aggressive:true},target=unit('target',1,0,50),map={w:3,h:1,grid:[['平地','平地','平地']],heightLevelMap:[[0,0,0]],worldWrapEnabled:false};
  const state={activeWorldId:'surface',players:[{id:'p',factionState:{units:[target],settlements:[],visibility:{}}}],enemies:[enemy],enemyNests:[],neutralVillages:[],settlements:[],enemyCombatRuntime:{},gameSettings:zero};
  check(!inspectEnemyAiState(state,'ai',1,map).targetId,'AI must use state zero, not global default');
  check(inspectEnemyAiState({...state,gameSettings:bonus},'ai',1,map).targetId==='target','AI +50');
  check(collectV39FactionVision({...state,gameSettings:bonus},'p',map).detectionByTile.get('1,0')===50,'NPC faction parity');
  const current=window.getV39GameState(),world=Object.keys(current.explorationWorlds).find(id=>id.startsWith('cave:'));
  window.viewV39OwnedUnitWorld(window.getV39ActiveFactionState().units.find(u=>u.worldId===world).id);await window.waitForV39MapRenderSettled();
  const field=window.__v39FieldRuntime.mapData;field.grid=field.grid.map(row=>row.map(()=>'平地'));field.fogMap=[];field.hazardZones=[];field.specialMap=[];field.defenseStructures=[];field.caveSites=[];delete field.caveEventNpc;
  window.updateV39FieldData(field);
  const s=window.getV39GameState();window.setV39GameState({gameSettings:{...s.gameSettings,detectionScoutBonus:0},worldEnvironment:{},settlements:[],neutralVillages:[],enemyNests:[],
    players:s.players.map(p=>({...p,factionState:{...p.factionState,units:[{...unit('observer',4,4),worldId:world}],selectedUnitId:'observer',squads:[{id:'solo',unitIds:['observer']}],settlements:[],visibility:{}}})),
    enemies:[{...unit('equal',5,4,50),worldId:world},{...unit('higher',4,5,51),worldId:world}]});
  await window.setV39TestMode(false);await window.waitForV39MapRenderSettled();
  check(!window.isV39EntityDetected('equal'),'UI zero baseline');
  return {world};
 });
 await page.evaluate(()=>window.activateV39FooterTab('manage'));
 await page.locator('.manage-tile[data-open="settings"]').click();
 const input=page.locator('#v39-detection-scout-bonus');await input.fill('50');await input.press('Tab');
 await page.waitForFunction(()=>window.isV39EntityDetected('equal')&&!window.isV39EntityDetected('higher'));
 assert.equal(await page.evaluate(()=>window.getV39GameSettings().detectionScoutBonus),50);
 await page.screenshot({path:`${out}/settings-${width}.png`});
 await page.evaluate(async()=>{window.importV39SaveJson(window.exportV39SaveJson(0));await window.waitForV39MapRenderSettled();});
 assert.equal(await page.evaluate(()=>window.getV39GameSettings().detectionScoutBonus),50);
 assert(await page.evaluate(()=>window.isV39EntityDetected('equal')));
 assert.deepEqual(errors,[]);console.log(`${width}: bonus boundaries, decay, fog, AI/faction parity, real settings control, live detection and save/load passed`,result);
 await page.close();
}}finally{await browser.close();}
