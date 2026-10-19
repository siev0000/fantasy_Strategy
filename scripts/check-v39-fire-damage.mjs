import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/fire-damage';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    const checks=await page.evaluate(async()=>{
      const {applyV39DisasterMovementDamage:move,resolveV39DisasterDamage:rate,applyV39DisasterDamage:damage}=await import('/src/lib/v39-disaster-damage.js');
      const {applyEnemyPlanToSimulation:ai}=await import('/src/lib/v39-enemy-ai-planner.js');
      const {applyV39SquadMovement:squadMove}=await import('/src/lib/v39-squad-movement-rules.js');
      const originalRandom=Math.random;Math.random=()=>0.5;
      const event={disasterId:'災害:山火事',startsAtTurn:1,expiresAtTurn:2,unitDamageRate:0.1,tileKeys:['2,1','3,1']};
      const state={activeWorldId:'surface',timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[event]}};
      const unit={id:'probe',name:'probe',worldId:'surface',x:1,y:1,hp:100,currentHp:100,maxHp:100,ap:100};
      const path=[{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1}];
      const passed=move(unit,path,state),lethal=move({...unit,hp:5},path,state);
      const expired=move(unit,path,state,3),other=move({...unit,worldId:'cave:other'},path,state);
      const noMove=move({...unit,x:2},[{x:2,y:1}],state);
      const stood=damage({...unit,x:2},rate(event),1);
      const fire=rate(event,'movement');
      const mitigation={
        maxHp:damage({...unit,maxHp:1000},fire,1).entry.damage,
        defense:damage({...unit,status:{防御:100}},fire,1).entry.damage,
        resistance:damage({...unit,level:1,status:{炎耐性:50}},fire,1).entry.damage,
        immune:damage({...unit,status:{炎耐性:100}},fire,1).unit.hp,
        barrier:damage({...unit,barrier:{remaining:20}},fire,1),
        shield:damage({...unit,shield:{remaining:10}},fire,1),
        legacy:damage(unit,0.1,1).entry.damage
      };
      const overlapping=move(unit,path,{...state,worldEnvironment:{activeDisasters:[event,event]}});
      let simulation={...state,enemies:[unit],players:[],neutralVillages:[],enemyCombatRuntime:{}};
      for(const x of [2,3,4])simulation=ai(simulation,{type:'move',enemyId:unit.id,to:{x,y:1},cost:10,turnNumber:1});
      const deadAi=ai({...state,enemies:[{...unit,hp:5}],enemyCombatRuntime:{}},{type:'move',enemyId:unit.id,to:{x:2,y:1},cost:10,turnNumber:1});
      const follower={...unit,id:'follower',x:0};
      const squad=squadMove({units:[unit,follower],squads:[]},{ok:true,participantIds:[unit.id,follower.id],moveAp:100},
        {x:2,y:1,positions:[{id:unit.id,x:2,y:1},{id:follower.id,x:1,y:1}],frames:[[{id:unit.id,x:1,y:1},{id:follower.id,x:0,y:1}],[{id:unit.id,x:2,y:1},{id:follower.id,x:1,y:1}]]},10,state);
      Math.random=originalRandom;return {passed,lethal,expired,other,noMove,stood,mitigation,overlapping,ai:simulation.enemies[0],deadAi:deadAi.enemies[0],squadHp:squad.faction.units.map(u=>u.hp),unit};
    });
    assert.equal(checks.passed.unit.hp,46);assert.equal(checks.passed.unit.x,4);assert.equal(checks.passed.entries.length,2);
    assert.equal(checks.stood.unit.hp,19);assert.equal(checks.stood.entry.damage,81);
    assert.equal(checks.lethal.unit.hp,0);assert.equal(checks.lethal.unit.state,'死亡');assert.equal(checks.lethal.unit.x,2);
    assert.equal(checks.expired.unit.hp,100);assert.equal(checks.other.unit.hp,100);assert.equal(checks.noMove.unit.hp,100);
    assert.equal(checks.overlapping.unit.hp,46);assert.equal(checks.unit.hp,100);
    assert.equal(checks.ai.hp,46);assert.equal(checks.ai.ap,70);assert.equal(checks.deadAi.state,'死亡');
    assert.deepEqual(checks.squadHp,[73,100]);
    assert.equal(checks.mitigation.maxHp,27);assert.equal(checks.mitigation.defense,13);
    assert.equal(checks.mitigation.resistance,10);assert.equal(checks.mitigation.immune,100);
    assert.equal(checks.mitigation.barrier.unit.hp,100);assert.equal(checks.mitigation.barrier.unit.barrier.remaining,0);
    assert.equal(checks.mitigation.shield.unit.hp,83);assert.equal(checks.mitigation.shield.unit.shield.remaining,0);
    assert.equal(checks.mitigation.legacy,10);
    const original=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest();
      const s=window.getV39GameState(),p=s.players[0],map=window.__v39FieldRuntime.mapData;
      map.grid=map.grid.map(row=>row.map(()=> '平地'));map.heightLevelMap=map.grid.map(row=>row.map(()=>0));
      map.specialMap=[];map.reliefMap=[];map.lavaMap=[];map.wallMap=[];
      const unit={...p.factionState.units[0],x:3,y:10,position:[3,10],squadId:'solo',movementHold:false,
        hp:p.factionState.units[0].maxHp,currentHp:p.factionState.units[0].maxHp,ap:100,currentAp:100,actionPoint:100};
      const event={id:'fire-path-test',disasterId:'災害:山火事',name:'山火事',startsAtTurn:1,expiresAtTurn:2,
        unitDamageRate:0.1,movementDamageRate:0.1,stationaryDamageMultiplier:3,tileKeys:['4,10'],lastTickTurn:1};
      window.setV39GameState({enemies:[],enemySquads:[],neutralVillages:[],players:[{...p,factionState:{...p.factionState,units:[unit],squads:[],selectedUnitId:unit.id,moveCommandUnitId:'',villagePlacementMode:false}}],worldEnvironment:{activeDisasters:[event],lastNaturalEventTurn:1}},{reason:'fire-movement-test',trackUnitDeaths:false});
      window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();await window.waitForV39MapRenderSettled();
      const {applyV39DisasterDamage,resolveV39DisasterDamage}=await import('/src/lib/v39-disaster-damage.js');
      const expected=[0,1].map(roll=>applyV39DisasterDamage(window.getV39ActiveFactionState().units[0],resolveV39DisasterDamage(event,'movement'),1,'災害通過',()=>roll).unit.hp);
      return {hp:unit.hp,maxHp:unit.maxHp,id:unit.id,expected};
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    await page.evaluate(()=>window.startV39SelectedUnitMove());
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:5,y:10}})));
    await page.locator('#moveOk').click();
    try{await page.waitForFunction(id=>window.getV39ActiveFactionState().units.find(u=>u.id===id)?.x===5,original.id,{timeout:5000});}
    catch(error){console.log(await page.evaluate(()=>({preview:window.getV39UnitMovePreview(),units:window.getV39ActiveFactionState().units,lock:window.isV39MapInputLocked()})));console.log(errors);throw error;}
    const final=await page.evaluate(()=>window.getV39ActiveFactionState().units[0]);
    assert(final.hp>=Math.min(...original.expected)&&final.hp<=Math.max(...original.expected));
    assert(final.ap<100);
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    await page.screenshot({path:`${out}/moved-${width}.png`});
    const saved=await page.evaluate(()=>{window.importV39SaveJson(window.exportV39SaveJson());return window.getV39ActiveFactionState().units[0].hp;});
    assert.equal(saved,final.hp);assert.deepEqual(errors,[]);
    await page.evaluate(async()=>{
      const f=window.getV39ActiveFactionState(),u=f.units[0];
      window.updateV39ActiveFactionState({units:[{...u,x:3,y:10,position:[3,10],hp:1,currentHp:1,ap:100,currentAp:100,actionPoint:100}]});
      window.refreshV39SquadDerivedUI();await window.waitForV39MapRenderSettled();
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    await page.evaluate(()=>window.startV39SelectedUnitMove());
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:5,y:10}})));
    await page.locator('#moveOk').click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState().units[0].hp===0);
    const dead=await page.evaluate(()=>window.getV39ActiveFactionState().units[0]);
    assert.equal(dead.x,4);assert.equal(dead.state,'死亡');
    assert.deepEqual(errors,[]);
    console.log(`${width}: pass per tile, stay x3, expiry, overlap, worlds, lethal stop, enemy simulation, native player move and save passed`);
    await page.close();
  }
}finally{await browser.close();}
