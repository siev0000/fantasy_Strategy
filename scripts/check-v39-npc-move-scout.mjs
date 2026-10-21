import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:850}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
try{
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.runV39FactionAiTurn==='function');
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39VillageIncidentTest();window.closeV39VillageMenu();
    const s=window.getV39GameState(),human=s.players[0],original=s.players[1],map=window.__v39FieldRuntime.mapData;
    const base=original.factionState.settlements[0];
    const unit={...original.factionState.units[0],x:8,y:12,position:[8,12],squadId:'solo',ap:100,currentAp:100,
      surveyTask:null,status:{...original.factionState.units[0].status,移動:50,索敵:0},skillLevels:{索敵:0}};
    const npc={...original,isPlayer:false,race:'悪魔',factionState:{...original.factionState,units:[unit],
      squads:[{id:'solo',unitIds:[unit.id]}],unitTrainingQueue:[],visibility:{exploredTileKeys:[],visibleTileKeys:[]},
      settlements:[{...base,x:18,y:18,placed:true,population:10,populationByRace:{悪魔:10},foodStockByType:{魂:0},materialStockByType:{},buildings:[],constructionQueue:[]}],
      exploration:{surveyedTileKeys:[],discoveredFeaturesByTile:{},discoveredFactionsByPlayerId:{}},aiState:{lastProcessedTurn:0}}};
    const state={...s,players:[{...human,factionState:{...human.factionState,units:[],settlements:[]}},npc],
      timeline:{...s.timeline,turnNumber:2,phase:'resolution'},neutralVillages:[],settlements:[],enemies:[],enemyNests:[],
      territoryOwnerByTile:{},territoryStateByTile:{},facilitiesByTile:{},groundLootByTile:{},victoryLandmarksByTile:{},worldEnvironment:{}};
    const ok=(value,message)=>{if(!value)throw new Error(message);};
    const frozen=structuredClone(state);frozen.players[1].factionState.units[0].ap=0;frozen.players[1].factionState.units[0].currentAp=0;
    const initial=window.runV39FactionAiTurn(frozen,3,map).state.players[1].factionState.visibility.exploredTileKeys;
    const first=window.runV39FactionAiTurn(state,3,map),f=first.state.players[1].factionState;
    const commands=first.reports[0].commands;
    ok(!commands.some(c=>c.startsWith('調査:'))&&!f.units[0].surveyTask,'供給元探索でその場調査を開始');
    ok(f.units[0].ap<100&&(f.units[0].x!==8||f.units[0].y!==12),'実APで移動していない');
    const movement=commands.find(c=>c.startsWith('供給元の移動探索:'));
    ok(movement&&movement.includes('→'),'APがあっても一歩で移動探索を停止');
    const newKey=f.visibility.visibleTileKeys.find(key=>!initial.includes(key));
    ok(newKey,'移動で新たな範囲が見えない');
    const [x,y]=newKey.split(',').map(Number);
    const village={id:'scout-village',name:'移動で見つかる村',x,y,population:100,populationByRace:{只人:100},
      territoryTileKeys:[newKey],defenseUnits:[],contactedByPlayerIds:[],relationsByPlayerId:{}};
    const hiddenState={...state,neutralVillages:[village],settlements:[village]};
    const discovered=window.runV39FactionAiTurn(hiddenState,3,map);
    const objective=discovered.state.players[1].factionState.aiState.objective;
    ok(objective.type==='resource-demand'&&objective.targetVillageId===village.id,'移動中に見えた村へ切り替わらない');
    ok(discovered.reports[0].commands.some(c=>c.includes('発見:移動で見つかる村')),'村発見をログへ記録しない');
    const secondState=structuredClone(first.state);secondState.players[1].factionState.units[0].ap=100;secondState.players[1].factionState.units[0].currentAp=100;
    const second=window.runV39FactionAiTurn(secondState,4,map),sf=second.state.players[1].factionState;
    ok(sf.visibility.exploredTileKeys.length>=f.visibility.exploredTileKeys.length,'踏査した視界を忘れる');
    ok(sf.units[0].x!==unit.x||sf.units[0].y!==unit.y,'出発点との往復だけになる');
    const distant={...village,x:23,y:23,territoryTileKeys:['23,23']};
    const far=window.runV39FactionAiTurn({...state,neutralVillages:[distant]},3,map);
    ok(far.state.players[1].factionState.aiState.objective.type==='resource-search','視界外の村の位置を使った');
    window.setV39GameState(discovered.state,{reason:'npc-move-scout-check'});
    const before=discovered.state.players[1].factionState.visibility.exploredTileKeys.length;
    window.importV39SaveJson(window.exportV39SaveJson(0));
    ok(window.getV39GameState().players[1].factionState.visibility.exploredTileKeys.length===before,'保存で踏査範囲が失われる');
    window.openV39TestTools();
    return {commands,discovery:discovered.reports[0].commands,objective,explored:f.visibility.exploredTileKeys.length};
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result,errors},null,2));
  await page.locator('[data-test-tab=diagnostics]').click();
  const diagnostic=page.locator('[data-test-section=npc-ai]');
  if(!await diagnostic.evaluate(el=>el.open))await diagnostic.locator(':scope > summary').click();
  await mkdir('output/web-game/npc-move-scout',{recursive:true});
  await page.screenshot({path:'output/web-game/npc-move-scout/diagnostics-1100.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/web-game/npc-move-scout/diagnostics-390.png'});
}finally{await browser.close();}
