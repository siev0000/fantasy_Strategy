import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/victory-security';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
  if(!process.env.V39_PRODUCTION_CHECK){
    const pure=await page.evaluate(async()=>{
      const {evaluateV39Victory:step,isV39VictoryLandmarkInterfered:blocked}=await import('/src/lib/v39-victory-rules.js');
      const base={players:[{id:'p',race:'只人',factionState:{units:[{id:'own',hp:10}]}},{id:'q',race:'只人',isPlayer:false,factionState:{units:[]}}],
        territoryOwnerByTile:{'2,2':'p','3,2':'p'},victoryLandmarksByTile:{'2,2':{key:'2,2',occupiedTileKeys:['2,2','3,2']}},enemies:[],timeline:{turnNumber:1},
        diplomacyRelations:{'p|q':{status:'war'}}};
      const count=s=>s.victory.progressByPlayerId.p.securedTurnsByTile['2,2'];
      const stateAt=(s,t)=>step(s,t).state;
      let s=stateAt(base,1),progress=[count(s)];
      s=stateAt(s,2);progress.push(count(s));s=stateAt(s,3);progress.push(count(s));
      const enemy={id:'enemy',hp:10,x:3,y:2,aggressive:true};s=stateAt({...s,enemies:[enemy]},4);progress.push(count(s));
      const repeated=stateAt({...s,enemies:[]},4);progress.push(count(repeated));
      s=stateAt({...s,enemies:[]},5);progress.push(count(s));
      const lost=stateAt({...s,territoryOwnerByTile:{'2,2':'p','3,2':'q'}},6);
      const recaptured=stateAt({...lost,territoryOwnerByTile:base.territoryOwnerByTile},6);
      const skip=stateAt(stateAt(base,1),100);
      const legacy=stateAt({...base,victory:{progressByPlayerId:{p:{controlledLandmarkKeys:['2,2'],controlStartedTurnByTile:{'2,2':1}}}}},100);
      const qBase={...base,territoryOwnerByTile:{'2,2':'q','3,2':'q'}};let npc=stateAt(qBase,1);for(let t=2;t<=6;t++)npc=stateAt(npc,t);
      const foreign={id:'foreign',hp:10,x:2,y:2};
      const checks={edge:blocked({...base,enemies:[enemy]},'2,2','p'),outside:blocked({...base,enemies:[{...enemy,x:4}]},'2,2','p'),
        dead:blocked({...base,enemies:[{...enemy,hp:0}]},'2,2','p'),otherWorld:blocked({...base,enemies:[{...enemy,worldId:'cave:1'}]},'2,2','p'),
        passive:blocked({...base,enemies:[{...enemy,aggressive:false}]},'2,2','p'),own:blocked({...base,enemies:[{...enemy,ownerPlayerId:'p'}]},'2,2','p'),
        war:blocked({...base,players:base.players.map(p=>p.id==='q'?{...p,factionState:{units:[foreign]}}:p)},'2,2','p'),
        peace:blocked({...base,diplomacyRelations:{},players:base.players.map(p=>p.id==='q'?{...p,factionState:{units:[foreign]}}:p)},'2,2','p')};
      return {progress,lost:lost.victory.progressByPlayerId.p,recaptured:count(recaptured),skip:count(skip),legacy:count(legacy),npc:npc.victory.winnerPlayerId,checks};
    });
    assert.deepEqual(pure.progress,[0,1,2,1,1,2]);assert.deepEqual(pure.lost.securedTurnsByTile,{});assert.equal(pure.recaptured,0);
    assert.equal(pure.skip,1);assert.equal(pure.legacy,0);assert.equal(pure.npc,'q');
    assert.deepEqual(pure.checks,{edge:true,outside:false,dead:false,otherWorld:false,passive:false,own:false,war:true,peace:false});
  }
  await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
    const s=window.getV39GameState(),key='10,10',landmark={id:'security-test',key,name:'確保試験地',terrain:'森',x:10,y:10,occupiedTileKeys:[key,'11,10','10,11']};
    window.setV39GameState({victory:{},victoryLandmarksByTile:{[key]:landmark},enemies:[],players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...p.factionState,
      exploration:{...p.factionState.exploration,discoveredFeaturesByTile:{...p.factionState.exploration.discoveredFeaturesByTile,[key]:{kind:'victory-landmark',name:landmark.name}}}}}:p)});
    window.setV39GameState({territoryOwnerByTile:{...s.territoryOwnerByTile,...Object.fromEntries(landmark.occupiedTileKeys.map(key=>[key,s.activePlayerId]))}});
    window.activateV39FooterTab('interaction');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:10,y:10}}));
  });
  const advance=async(turn,enemy)=>page.evaluate(({turn,enemy})=>{
    const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:turn},...(enemy===undefined?{}:{enemies:enemy?[{id:'security-invader',race:'ウルフ',className:'ウルフ',level:10,hp:100,currentHp:100,x:11,y:10,worldId:'surface',aggressive:true}]:[]})});
    window.dispatchEvent(new CustomEvent('v39:turn-stage-exploration',{detail:{turnNumber:turn}}));
    return window.getV39GameState().victory;
  },{turn,enemy});
  const read=()=>page.evaluate(()=>{const s=window.getV39GameState();return s.victory.progressByPlayerId[s.activePlayerId].securedTurnsByTile['10,10'];});
  assert.equal(await read(),0);await advance(2,false);assert.equal(await read(),1);await advance(3,true);assert.equal(await read(),0);
  assert((await page.locator('#v39-world-contact-subdetail').innerText()).includes('妨害中'));
  await page.screenshot({path:`${out}/blocked-390.png`});
  await advance(4,false);assert.equal(await read(),1);
  await page.evaluate(async()=>{window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();});
  await advance(4,false);assert.equal(await read(),1);
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({territoryOwnerByTile:{...s.territoryOwnerByTile,'11,10':''}});});
  assert.equal(await read(),undefined);
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({territoryOwnerByTile:{...s.territoryOwnerByTile,'11,10':s.activePlayerId}});});
  assert.equal(await read(),0);
  for(let turn=5;turn<=9;turn++){const victory=await advance(turn,false);assert.equal(victory.completed,turn===9);}
  assert.equal(await page.evaluate(()=>window.resolveV39Victory().changed),false);
  assert.equal(await page.evaluate(()=>window.advanceV39Turn()),false);
  await page.screenshot({path:`${out}/victory-390.png`});assert.deepEqual(errors,[]);
  console.log('Five elapsed secure turns, -1 interference, repeat/save/load, acquisition/loss/reacquisition, diplomacy/world/death exclusions, NPC parity, UI and victory stop passed');
}finally{await browser.close();}
