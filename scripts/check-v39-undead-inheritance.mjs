import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/undead-inheritance',{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:3022',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
  if(!process.env.V39_PRODUCTION_CHECK){
  const result=await page.evaluate(async()=>{
    const {buildV39UndeadInheritance:inherit}=await import('/src/lib/v39-undead-inheritance.js');
    const {convertV39CorpsesInDeathFog:convert}=await import('/src/lib/v39-corpse-undead-rules.js');
    const {createV39EventEnemy:createEnemy}=await import('/src/v39/ai/v39-enemy-spawn.js');
    const {resolveUndeadArtworkReference:art}=await import('/src/lib/undead-artwork-config.js');
    const original={id:'dead-ogre',race:'オーガ',className:'ウォーリアー',level:25,
      prerequisiteClassLevels:{ファイター:10},promotionGrowthStart:{level:25,raceLevels:8,classLevels:7},
      x:2,y:2,state:'死亡',hp:0,currentHp:0,equipment:[{slot:'武器1',name:'剣'}]};
    const spec=inherit(original,'スケルトン');
    const map={w:5,h:5,grid:Array.from({length:5},()=>Array(5).fill('平原')),
      purificationByTile:{'2,2':-5},fogMap:Array.from({length:5},()=>Array(5).fill({kind:'death',createdAtTurn:1,sourceKey:'2,2'}))};
    const state={players:[],enemies:[original],activeWorldId:'surface',worldEnvironment:{}};
    const patch=convert(state,map,2,{createEnemy,random:()=>0});
    const unit=patch.spawned[0].enemy,reloaded=window.applyV39DerivedCharacterData(JSON.parse(JSON.stringify(unit)));
    const bare=inherit({...original,equipment:[]});
    const low=inherit({race:'ヒューマン',className:'ファイター',level:1});
    const human=inherit({race:'ヒューマン',className:'ファイター',level:25});
    const wolf=inherit({race:'ウルフ',className:'ウルフ',level:25,strongAnimalClassName:'フレイムアニマル',strongAnimalClassLevel:10});
    return {spec,unit,reloaded,bare,low,human,wolf,original,
      images:[art(unit),art({race:'エルフ',className:'ゾンビ'}),art({race:'ウルフ',className:'スケルトン'}),art({race:'オーガ',className:'ゴースト'}),art({race:'竜人',className:'スケルトン'}),art({race:'ドレイク',className:'スケルトン'})]};
  });
  assert.equal(result.spec.level,22);
  assert.deepEqual(result.spec.prerequisiteClassLevels,{ファイター:5,ウォーリアー:3});
  assert.deepEqual(result.spec.undeadGrowthStart,{level:22,raceLevels:4,classLevels:10});
  assert.equal(result.unit.race,'オーガ');assert.equal(result.unit.className,'ゾンビ');
  assert.equal(result.unit.level,22);assert.equal(result.unit.equipment.length,1);
  assert.deepEqual(result.reloaded.derivedCharacter.prerequisiteClassLevels,{ファイター:5,ウォーリアー:3});
  assert.equal(result.reloaded.derivedCharacter.classLevels,10);assert.equal(result.reloaded.derivedCharacter.raceLevels,4);
  assert.equal(result.bare.equipment.length,0);assert.equal(result.low,null);
  assert.equal(result.human.level,22);assert.equal(result.human.prerequisiteClassLevels.ファイター,12);
  assert.equal(result.wolf.prerequisiteClassLevels.フレイムアニマル,5);
  assert.equal(result.images[0].slotNumber,9);assert.equal(result.images[1].slotNumber,3);
  assert.equal(result.images[2].slotNumber,5);assert.equal(result.images[3].slotNumber,6);
  assert.equal(result.images[4].slotNumber,12);assert.equal(result.images[5].slotNumber,10);
  }
  await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
    const f=window.getV39ActiveFactionState();
    const caster=window.applyV39DerivedCharacterData({...f.units.find(u=>u.id==='expedition-test-king'),x:7,y:7,position:[7,7],className:'テストサモナー',level:12,testOnly:true});
    const map=window.__v39FieldRuntime.mapData;
    for(let y=5;y<=9;y++)for(let x=5;x<=10;x++){
      map.grid[y][x]='平原';if(map.heightMap?.[y])map.heightMap[y][x]=0;
      if(map.specialMap?.[y])map.specialMap[y][x]=null;
      if(map.wallMap?.[y])map.wallMap[y][x]=null;
    }
    const corpse={id:'magic-body',race:'オーガ',className:'ウォーリアー',level:25,prerequisiteClassLevels:{ファイター:10},
      promotionGrowthStart:{level:25,raceLevels:8,classLevels:7},x:8,y:8,state:'死亡',hp:0,currentHp:0,equipment:[]};
    const enemyCorpse={...corpse,id:'enemy-body',x:8,y:7};
    const livingAlly={...corpse,id:'living-ally',x:9,y:7,state:'生存',hp:100,currentHp:100,maxHp:100,ap:40,currentAp:40};
    const livingEnemy={...livingAlly,id:'living-enemy',x:9,y:8};
    window.updateV39ActiveFactionState({units:[caster,corpse,livingAlly],squads:[{id:'solo',unitIds:[caster.id]}],selectedUnitId:caster.id,combatRuntime:{}});
    window.setV39GameState({enemies:[enemyCorpse,livingEnemy],enemySquads:[],neutralVillages:[],worldEnvironment:{}},{reason:'inheritance-test'});
    window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();document.querySelector('[data-squad-detail-tab="action"]')?.click();
    await window.waitForV39MapRenderSettled();
  });
  await page.locator('#detailTechniqueList [data-v39-attack-name="TEST_死者の呼び声"]').click();
  await page.evaluate(()=>{
    const s=window.getV39GameState({includeWorlds:false});
    window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1}},{reason:'test-cast-resolution'});
    window.dispatchEvent(new CustomEvent('v39:turn-advanced',{detail:{turnNumber:s.timeline.turnNumber+1}}));
  });
  await page.locator('[data-v39-cast-release]').click();
  const calls=await page.evaluate(()=>[window.executeV39AttackAt(8,7),window.executeV39AttackAt(8,7)]);
  assert.equal(calls.includes(true),true,'enemy corpse can be selected for the skill');
  const magic=await page.evaluate(()=>({f:window.getV39ActiveFactionState(),state:window.getV39GameState({includeWorlds:false})}));
  assert.equal(magic.f.units.some(u=>u.id==='magic-body'),true,'unselected allied corpse remains');
  assert.equal(magic.state.enemies.some(u=>u.id==='enemy-body'),false,'enemy corpse can be converted');
  assert.equal(magic.f.units.some(u=>u.id==='living-ally'),true,'unselected living ally remains');
  assert.equal(magic.state.enemies.some(u=>u.id==='living-enemy'),true,'living enemy remains untouched');
  const livingCheck=await page.evaluate(async()=>{
    const {selectV39SkillUndeadTargets:select,convertV39CorpsesInDeathFog:convert}=await import('/src/lib/v39-corpse-undead-rules.js');
    const {createV39EventEnemy:createEnemy}=await import('/src/v39/ai/v39-enemy-spawn.js');
    const state=window.getV39GameState({includeWorlds:false}),area=new Map([['8,8',1],['9,7',1],['9,8',1]]);
    const targets=select(state,state.activePlayerId,state.activeWorldId,area);
    const patch=convert(state,window.__v39FieldRuntime.mapData,state.timeline.turnNumber,{createEnemy,random:()=>0,...targets});
    return {corpses:[...targets.corpseIds],living:[...targets.livingUnitIds],
      spawned:patch.spawned.map(row=>({source:row.origin.corpseId,level:row.enemy.level,ap:row.enemy.ap,hp:row.enemy.hp,maxHp:row.enemy.maxHp})),
      enemyAlive:patch.enemies.some(unit=>unit.id==='living-enemy'),
      originalAllyGone:!patch.players.some(player=>player.factionState?.units?.some(unit=>unit.id==='living-ally'))};
  });
  assert.deepEqual(livingCheck.corpses,['magic-body']);
  assert.deepEqual(livingCheck.living,['living-ally']);
  assert.equal(livingCheck.spawned.some(row=>row.source==='living-ally'&&row.level===22&&row.ap===40),true,'living ally converts immediately with corpse inheritance and keeps AP');
  assert.equal(livingCheck.spawned.find(row=>row.source==='living-ally').hp,livingCheck.spawned.find(row=>row.source==='living-ally').maxHp,'new undead starts at full HP');
  assert.equal(livingCheck.spawned.some(row=>row.source==='magic-body'),true,'allied corpse can also convert');
  assert.equal(livingCheck.enemyAlive,true,'living enemy is excluded');
  assert.equal(livingCheck.originalAllyGone,true,'living source unit is replaced');
  const raised=magic.f.units.find(u=>u.undeadOrigin?.unitId==='enemy-body');
  assert(raised,'native death-call creates friendly undead');assert.equal(raised.level,22);assert.equal(raised.equipment.length,0);
  assert.equal(magic.f.combatRuntime.cooldownsByUnitId['expedition-test-king']['TEST_死者の呼び声'],magic.state.timeline.turnNumber+1);
  const saved=await page.evaluate(()=>{
    window.importV39SaveJson(window.exportV39SaveJson());
    return window.getV39ActiveFactionState().units.find(u=>u.undeadOrigin?.unitId==='enemy-body');
  });
  assert.equal(saved.level,22);assert.equal(saved.derivedCharacter.raceLevels,4);
  assert.deepEqual(saved.derivedCharacter.prerequisiteClassLevels,{ファイター:5,ウォーリアー:3});
  await page.evaluate(async id=>{
    await window.waitForV39MapRenderSettled();
    const marker=window.getV39MapEntityMarker(id),scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    scene.cameras.main.setZoom(scene.cameras.main.zoom*3).centerOn(marker.x,marker.y);
  },saved.id);
  await page.waitForFunction(id=>window.getV39MapEntityMarker(id)?.list.some(child=>child.type==='Image'&&child.texture.key.includes('ゾンビスケルトンユニット集1')),saved.id);
  const frame=await page.evaluate(id=>{const image=window.getV39MapEntityMarker(id).list.find(child=>child.type==='Image');return {x:image.frame.cutX,y:image.frame.cutY};},saved.id);
  assert.equal(frame.y,256);assert.equal(frame.x,saved.className==='ゾンビ'?0:128,'field renders original ogre species');
  await page.screenshot({path:'output/web-game/undead-inheritance/magic.png'});
  await page.evaluate(()=>{
    const faction=window.getV39ActiveFactionState(),state=window.getV39GameState({includeWorlds:false});
    window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id==='living-ally'?{...unit,x:8,y:7}:unit)});
    window.setV39GameState({timeline:{...state.timeline,turnNumber:state.timeline.turnNumber+1}},{reason:'living-conversion-ready'});
    window.dispatchEvent(new CustomEvent('v39:turn-advanced',{detail:{turnNumber:state.timeline.turnNumber+1}}));
  });
  await page.locator('#detailTechniqueList [data-v39-attack-name="TEST_死者の呼び声"]').click();
  await page.evaluate(()=>{
    const state=window.getV39GameState({includeWorlds:false});
    window.setV39GameState({timeline:{...state.timeline,turnNumber:state.timeline.turnNumber+1}},{reason:'living-conversion-cast'});
    window.dispatchEvent(new CustomEvent('v39:turn-advanced',{detail:{turnNumber:state.timeline.turnNumber+1}}));
  });
  await page.locator('[data-v39-cast-release]').click();
  const liveResult=await page.evaluate(()=>({accepted:window.executeV39AttackAt(8,7),state:window.getV39GameState({includeWorlds:false})}));
  assert.equal(liveResult.accepted,true,'living allied target accepts undead conversion');
  const liveFaction=liveResult.state.players.find(player=>player.id===liveResult.state.activePlayerId).factionState;
  assert.equal(liveFaction.units.some(unit=>unit.id==='living-ally'),false,'living source is removed');
  assert.equal(liveFaction.units.some(unit=>unit.undeadOrigin?.unitId==='living-ally'),true,'living ally becomes an undead unit');
  assert.equal(liveResult.state.enemies.some(unit=>unit.id==='living-enemy'),true,'living enemy remains alive');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(300);
  await page.screenshot({path:'output/web-game/undead-inheritance/magic-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log('Undead inheritance and native death-call checks passed');
}finally{await browser.close();}
