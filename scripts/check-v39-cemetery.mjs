import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/cemetery',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    const pure=await page.evaluate(async()=>{
      const {applyV39DeathPurification,findV39NewUnitDeaths,getV39DeathProtectionStatus}=await import('/src/lib/v39-death-purification.js');
      const {advanceV39Purification,applyV39DeathBlade}=await import('/src/lib/v39-purification-rules.js');
      const map={w:8,h:8,grid:Array.from({length:8},()=>Array(8).fill('平地')),purificationByTile:{}};
      const state={activeWorldId:'surface',timeline:{turnNumber:1},players:[{id:'p',factionState:{units:[],settlements:[{id:'a',settlementId:'a'},{id:'b',settlementId:'b'}]}}],enemies:[],
        territoryOwnerByTile:{'1,1':'p','2,1':'p','3,1':'p','6,1':'p'},territoryStateByTile:{'1,1':{settlementId:'a'},'2,1':{settlementId:'a'},'3,1':{settlementId:'a'},'6,1':{settlementId:'b'}},facilitiesByTile:{'1,1':['墓地']}};
      const deaths=Array.from({length:5},(_,i)=>({id:`d${i}`,x:2,y:1,hp:0,state:'死亡'}));
      const before=JSON.stringify({state,map}),protectedThree=applyV39DeathPurification(map,state,deaths.slice(0,3));
      const multiple=applyV39DeathPurification(map,{...state,facilitiesByTile:{'1,1':['墓地'],'3,1':['墓地']}},deaths);
      const nextTurn=applyV39DeathPurification(protectedThree.map,{...state,timeline:{turnNumber:2}},deaths.slice(0,2));
      const outside=applyV39DeathPurification(map,state,[{...deaths[0],x:7,y:7}]);
      const otherBase=applyV39DeathPurification(map,state,[{...deaths[0],x:6,y:1}]);
      const noFacility=applyV39DeathPurification(map,{...state,facilitiesByTile:{}},deaths.slice(0,1));
      const alive=deaths.map(u=>({...u,hp:1,state:'生存'}));
      const transitions=findV39NewUnitDeaths({...state,enemies:alive},{...state,enemies:deaths});
      const repeated=findV39NewUnitDeaths({...state,enemies:deaths},{...state,enemies:deaths});
      const preplaced=findV39NewUnitDeaths(state,{...state,enemies:deaths});
      const expired=findV39NewUnitDeaths({...state,enemies:alive},{...state,enemies:[]});
      const summon=findV39NewUnitDeaths({...state,enemies:[{...alive[0],summon:{}}]},{...state,enemies:[{...deaths[0],summon:{}}]});
      const decay=structuredClone(protectedThree.map);advanceV39Purification(decay,{...state,enemies:deaths},2,()=>1);
      const blade=structuredClone(noFacility.map);applyV39DeathBlade(blade,{skills:['死の刃']},[{x:2,y:1,beforeHp:1,afterHp:0,total:1}]);
      return {immutable:before===JSON.stringify({state,map}),one:protectedThree.protectedCount===2&&protectedThree.map.purificationByTile['2,1']===-1,
        multiple:multiple.protectedCount===4&&multiple.lossCount===1,next:nextTurn.protectedCount===2&&nextTurn.map.purificationByTile['2,1']===-1,
        outside:outside.lossCount===1,other:otherBase.lossCount===1,noFacility:noFacility.lossCount===1,
        transitions:transitions.length===5&&!repeated.length&&!preplaced.length&&!expired.length&&!summon.length,
        decay:decay.purificationByTile['2,1']===-2,blade:blade.purificationByTile['2,1']===-6,
        quota:getV39DeathProtectionStatus(protectedThree.map,state,'p','a').remaining===0};
    });
    for(const [key,value] of Object.entries(pure))assert.equal(value,true,key);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
      const {buildV39UnitEntity}=await import('/src/lib/v39-unit-creation-rules.js');
      const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),f=p.factionState,base=f.settlements[0];
      const enemies=Array.from({length:5},(_,i)=>({...buildV39UnitEntity({id:`cemetery-enemy-${i}`,name:`墓地試験${i}`,race:'ウルフ',className:'ウルフ',level:1,x:4,y:4,isNamed:false}),hp:1,currentHp:1,worldId:'surface'}));
      window.setV39GameState({enemies,territoryOwnerByTile:{...s.territoryOwnerByTile,'4,3':p.id,'4,4':p.id},territoryStateByTile:{...s.territoryStateByTile,'4,3':{settlementId:base.settlementId},'4,4':{settlementId:base.settlementId}},facilitiesByTile:{...s.facilitiesByTile,'4,3':['墓地']},players:s.players.map(row=>row.id===p.id?{...row,factionState:{...f,settlements:f.settlements.map(b=>b.settlementId===base.settlementId?{...b,buildings:['墓地'],tileFacilityMap:{'4,3':['墓地']}}:b)}}:row)});
    });
    const kill=async(id,fast=false)=>page.evaluate(({id,fast})=>{
      const s=window.getV39GameState(),enemies=s.enemies.map(u=>u.id===id?{...u,hp:0,currentHp:0,state:'死亡'}:u);
      if(fast)window.patchV39EnemyTurnState({enemies});else window.setV39GameState({enemies});
      const map=window.__v39FieldRuntime.mapData;return {value:map.purificationByTile['4,4']||0,ledger:map.deathPurificationProtection};
    },{id,fast});
    assert.equal((await kill('cemetery-enemy-0')).value,0);
    assert.equal((await kill('cemetery-enemy-1',true)).value,0);
    assert.equal((await kill('cemetery-enemy-2')).value,-1);
    assert.equal((await kill('cemetery-enemy-2')).value,-1,'dead state rewrite does not repeat');
    await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson()));
    assert.equal((await kill('cemetery-enemy-3')).value,-2,'save/load keeps exhausted quota');
    await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1}});});
    assert.equal((await kill('cemetery-enemy-4')).value,-2,'next turn restores protection');
    const factionAndBackground=await page.evaluate(()=>{
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),source=f.units.find(u=>!u.isSovereign&&u.hp>0),id='cemetery-cave-unit';
      const map=structuredClone(window.__v39FieldRuntime.mapData);map.purificationByTile={};delete map.deathPurificationProtection;
      const cave={...source,id,worldId:'cave:cemetery',x:2,y:2};
      window.setV39GameState({players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...f,units:[...f.units,cave]}}:p),explorationWorlds:{...s.explorationWorlds,'cave:cemetery':{map,spatial:{territoryOwnerByTile:{},territoryStateByTile:{},facilitiesByTile:{}}}}});
      const active=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:active.units.map(u=>u.id===id?{...u,hp:0,currentHp:0,state:'死亡'}:u)});
      const after=window.getV39GameState();return {value:after.explorationWorlds['cave:cemetery'].map.purificationByTile['2,2'],surface:window.__v39FieldRuntime.mapData.purificationByTile['4,4']};
    });
    assert.equal(factionAndBackground.value,-1);assert.equal(factionAndBackground.surface,-2);
    await page.evaluate(()=>{window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();});
    await page.locator('[data-settlement-page-select="operation"]').click();
    await page.locator('[data-settlement-fold="facility"] summary').click();
    assert.match(await page.locator('[data-v39-cemetery-quota]').innerText(),/残り1\/2/);
    await page.screenshot({path:`output/web-game/cemetery/quota-${width}.png`});
    const combat=await page.evaluate(async()=>{
      const {buildV39UnitEntity}=await import('/src/lib/v39-unit-creation-rules.js');
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState();
      const attacker={...buildV39UnitEntity({id:'cemetery-attacker',name:'実戦確認',race:'只人',className:'ファイター',level:20,x:3,y:3,isNamed:false}),worldId:'surface',equipment:[{slot:'武器1',name:'剣',quality:'common'}]};
      const victim={...s.enemies[0],id:'cemetery-combat-target',hp:1,currentHp:1,state:'生存',x:4,y:3};
      window.setV39GameState({players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...f,units:[...f.units.map(u=>({...u,x:7,y:7})),attacker]}}:p),enemies:[...s.enemies,victim]});
      const random=Math.random;let ok;
      try{Math.random=()=>0;ok=window.executeV39FactionCombatAction({playerId:s.activePlayerId,attackerId:attacker.id,targetUnitId:victim.id,skillRow:{名前:'墓地実戦確認',行動:'A',AP消費:0,攻撃手段:'武器',判定:'攻撃',切断:10000,命中:10000,射程:10}});}finally{Math.random=random;}
      const after=window.getV39GameState(),target=after.enemies.find(u=>u.id===victim.id),map=window.__v39FieldRuntime.mapData;
      return {ok,dead:target?.hp<=0||target?.state==='死亡',purification:map.purificationByTile['4,3']||0,used:Object.values(map.deathPurificationProtection.usedBySettlement)[0]};
    });
    assert(combat.ok&&combat.dead,JSON.stringify(combat));assert.equal(combat.purification,0);assert.equal(combat.used,2);
    assert.deepEqual(errors,[]);console.log(`${width}: death transitions, 2/turn quota, territory scopes, multiple cemeteries, save/load, fast enemy patch, faction update, background world and separate decay passed`);
    await page.close();
  }
}finally{await browser.close();}
