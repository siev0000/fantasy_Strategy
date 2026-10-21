import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true}),errors=[];
try{
  const page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.startV39SpecialVillageTest==='function');
  const pure=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39SpecialVillageTest();window.closeV39VillageMenu();
    const rules=await import('/src/lib/v39-special-villages.js'),exp=await import('/src/lib/v39-unit-experience.js');
    const creation=await import('/src/lib/v39-unit-creation-rules.js');
    const promotion=await import('/src/lib/v39-class-progression.js');
    const artwork=await import('/src/lib/map-entity-artwork.js');
    const {applyV39DerivedCharacterData:derive}=await import('/src/v39/unit/v39-character-derived-rules.js');
    const ok=(v,m)=>{if(!v)throw new Error(m);};
    const s=window.getV39GameState(),p=s.players[0],bank=p.factionState.settlements[0];
    const request={settlementId:bank.settlementId,race:'只人'};
    const reports=[];
    for(let i=0;i<3;i++){
      const state=structuredClone(s),actor=state.players[0].factionState.units[i],village=state.neutralVillages[i];
      actor.hp=15;actor.currentHp=15;
      const oldCategory=exp.resolveV39UnitRaceCategory(actor),oldNeed=exp.resolveV39UnitExpNeed(actor.level,oldCategory);
      actor.totalExp=exp.resolveV39UnitTotalExpForLevel(actor.level,oldCategory)+Math.floor(oldNeed*.37);
      const oldProgress=exp.resolveV39UnitExpDisplay(actor);
      const check=rules.inspectV39SpecialVillageReincarnation(state,p.id,village.id,{...request,unitId:actor.id});
      ok(check.available,check.reasons.join(' / '));
      const before=JSON.stringify(state),result=rules.reincarnateV39VillageNegotiator(state,p.id,village.id,{...request,unitId:actor.id});
      ok(result.ok,'転生失敗');ok(JSON.stringify(state)===before,'入力stateを変更');
      const unit=result.unit,d=unit.derivedCharacter;
      ok(unit.race===check.targetRace&&d.raceLevels===3&&d.classLevels===20&&unit.level===23,'主要種族/Lv配分が不正');
      ok(JSON.stringify(artwork.resolveUnitArtwork({...unit,fusionAppearanceClass:'マンティコア',strongFusionResultName:'マンティコア'}))===JSON.stringify(artwork.resolveUnitArtwork({race:unit.race,className:unit.className})),'旧合体画像が主要種族画像より優先');
      ok(unit.hp<=15&&unit.ap===80,'HP/APを回復');
      ok(JSON.stringify(unit.equipment)===JSON.stringify(actor.equipment),'装備変更');
      ok(result.state.players[0].race===p.race,'国の種族まで変更');
      ok(result.state.players[0].factionState.settlements[0].population===97,'生贄消費不正');
      ok(result.state.players[0].factionState.units.filter(u=>u.id!==actor.id).every(u=>JSON.stringify(u)===JSON.stringify(state.players[0].factionState.units.find(o=>o.id===u.id))),'交渉者以外まで転生');
      ok(actor.acquiredSkillNames.every(name=>unit.acquiredSkillNames.includes(name)),'習得スキルを失う');
      const newProgress=exp.resolveV39UnitExpDisplay(unit);
      ok(Math.abs(newProgress.exp/newProgress.need-oldProgress.exp/oldProgress.need)<.001,'レベル途中のEXP進捗を失う');
      const repeat=rules.reincarnateV39VillageNegotiator(result.state,p.id,village.id,{...request,unitId:actor.id});ok(!repeat.ok&&repeat.state===result.state,'同種族でLvを加算');
      const growth=exp.grantV39UnitExperience(unit,exp.resolveV39UnitExpNeed(unit.level,'demon')).unit;
      ok(growth.level===24&&growth.derivedCharacter.raceLevels===4&&growth.derivedCharacter.classLevels===20,'転生後の成長配分が不正');
      if(i===0){
        const promoted=promotion.acquireV39UpperClass(result.state,p.id,actor.id,'ウォーリアー');
        ok(promoted.ok,`転生後の上位職取得に失敗:${promoted.reason}`);
        const grown=promoted.state.players[0].factionState.units.find(u=>u.id===actor.id);
        ok(grown.derivedCharacter.raceLevels===3&&grown.derivedCharacter.classLevels===10&&grown.prerequisiteClassLevels.ファイター===10,'転生時の配分が上位職の配分を上書き');
      }
      reports.push({race:unit.race,level:unit.level,raceLevels:d.raceLevels,classLevels:d.classLevels});
    }
    const v=s.neutralVillages[0],actorId=p.factionState.units[0].id,req={...request,unitId:actorId};
    const gob=structuredClone(s);gob.players[0].factionState.units[0]=creation.buildV39UnitEntity({id:actorId,race:'ゴブリン',className:'ファイター',level:10,x:v.x,y:v.y});
    const gobResult=rules.reincarnateV39VillageNegotiator(gob,p.id,v.id,req);
    ok(gobResult.ok&&gobResult.unit.level===13&&gobResult.unit.derivedCharacter.raceLevels===3&&gobResult.unit.derivedCharacter.classLevels===5&&gobResult.unit.prerequisiteClassLevels.ゴブリン===5,'元の種族Lvを保持しない');
    const fused=structuredClone(gob);fused.players[0].factionState.units[0].fusionGrowth={levelsByClass:{ゴブリン:5,ファイター:5},baseExp:3,baseNeed:20,acquiredSkillNames:[]};
    const fusedResult=rules.reincarnateV39VillageNegotiator(fused,p.id,v.id,req);
    ok(fusedResult.ok&&fusedResult.unit.level===13&&fusedResult.unit.derivedCharacter.raceLevels===3,'合体由来のLv配分が転生配分を上書き');
    const fusedGrowth=exp.grantV39UnitExperience(fusedResult.unit,exp.resolveV39UnitExpNeed(13,'demon')).unit;
    ok(fusedGrowth.level===14&&fusedGrowth.derivedCharacter.raceLevels===4&&fusedGrowth.prerequisiteClassLevels.ゴブリン===5,'合体個体の転生後成長が不正');
    const speciesClass=structuredClone(s);speciesClass.players[0].factionState.units[0]=creation.buildV39UnitEntity({id:actorId,race:'只人',className:'エンジェル',level:10,x:v.x,y:v.y});
    const speciesResult=rules.reincarnateV39VillageNegotiator(speciesClass,p.id,v.id,req);
    ok(speciesResult.ok&&speciesResult.unit.level===10&&speciesResult.unit.derivedCharacter.raceLevels===10&&speciesResult.unit.derivedCharacter.classLevels===0,'種族と職業が同名の場合にLvを二重計上');
    const secondary=structuredClone(s);secondary.players[0].factionState.units[0]=derive({...p.factionState.units[0],secondClassName:'クレリック'});
    const sec=rules.reincarnateV39VillageNegotiator(secondary,p.id,v.id,req);
    ok(sec.ok&&sec.unit.derivedCharacter.secondClassName==='クレリック','取得済み第二職を失う');
    let chain=rules.reincarnateV39VillageNegotiator(s,p.id,v.id,req).state;
    let actor=chain.players[0].factionState.units[0];actor.x=s.neutralVillages[1].x;actor.y=s.neutralVillages[1].y;
    chain=rules.reincarnateV39VillageNegotiator(chain,p.id,s.neutralVillages[1].id,req).state;
    actor=chain.players[0].factionState.units[0];actor.x=v.x;actor.y=v.y;chain.timeline.turnNumber++;
    const back=rules.reincarnateV39VillageNegotiator(chain,p.id,v.id,req);
    ok(back.ok&&back.unit.level===26&&back.unit.derivedCharacter.raceLevels===3&&back.unit.prerequisiteClassLevels.デヴィル===3,'種族切替で取得済みLvを増殖');
    for(const scenario of ['poor','ap','dead','far','army','summon','hostile','cave','cap']){
      const state=structuredClone(s),unit=state.players[0].factionState.units[0];
      if(scenario==='poor'){state.players[0].factionState.settlements[0].population=3;state.players[0].factionState.settlements[0].populationByRace={只人:3};}
      if(scenario==='ap')unit.ap=19;if(scenario==='dead')unit.hp=0;if(scenario==='far')unit.x=0;
      if(scenario==='army')unit.combatProfile={mode:'army',memberCount:3};if(scenario==='summon')unit.summon={casterId:'x'};
      if(scenario==='hostile')state.neutralVillages[0].hostilePlayerIds=[p.id];if(scenario==='cave')state.activeWorldId='cave';
      if(scenario==='cap')Object.assign(unit,creation.buildV39UnitEntity({id:actorId,race:'只人',className:'ファイター',level:119,x:v.x,y:v.y}));
      const result=rules.reincarnateV39VillageNegotiator(state,p.id,v.id,req);ok(!result.ok&&result.state===state,`無効条件で費用/転生を確定:${scenario}`);
    }
    window.setV39GameState(back.state,{reason:'reincarnation-save-test'});window.importV39SaveJson(window.exportV39SaveJson(0));
    const saved=window.getV39GameState().players[0].factionState.units[0];
    ok(saved.race==='エンジェル'&&saved.level===26&&saved.reincarnationGrowthStart.raceLevels===3,'保存読込で主要種族/Lvが変化');
    return reports;
  });
  await page.close();
  const ui=await browser.newPage({viewport:{width:390,height:844}});ui.on('pageerror',e=>errors.push(String(e)));
  await ui.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});await ui.waitForFunction(()=>typeof window.startV39SpecialVillageTest==='function');
  await ui.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39SpecialVillageTest();});
  await ui.locator('[data-hub-talk="special-reincarnation"]').click();
  const panel=ui.locator('[data-special-village-reincarnation]'),primary=ui.locator('[data-hub-primary]');
  assert.equal(await primary.isEnabled(),true);assert.match(await panel.innerText(),/エンジェル Lv3/);
  await mkdir('output/web-game/reincarnation',{recursive:true});await panel.scrollIntoViewIfNeeded();
  await ui.screenshot({path:'output/web-game/reincarnation/reincarnation-390.png'});await primary.click();
  const applied=await ui.evaluate(()=>{const s=window.getV39GameState(),u=s.players[0].factionState.units[0];return {race:u.race,level:u.level,raceLevels:u.derivedCharacter.raceLevels,ap:u.ap,population:s.players[0].factionState.settlements[0].population};});
  assert.deepEqual(applied,{race:'エンジェル',level:23,raceLevels:3,ap:80,population:97});assert.equal(await primary.isDisabled(),true);
  await ui.setViewportSize({width:1100,height:900});await panel.scrollIntoViewIfNeeded();await ui.screenshot({path:'output/web-game/reincarnation/reincarnation-1100.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pure,applied,errors},null,2));
}finally{await browser.close();}
