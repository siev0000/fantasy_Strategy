import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/summon',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:width===320?568:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const faction=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({selectedUnitId:'expedition-test-king',units:faction.units.map(unit=>unit.id==='expedition-test-king'
        ?{...unit,x:9,y:9,position:[9,9],className:'テストサモナー',level:12,testOnly:true}:unit)});
      window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();document.querySelector('[data-squad-detail-tab="action"]')?.click();
      await window.waitForV39MapRenderSettled();
    });
    const trigger=page.locator('#detailTechniqueList [data-v39-summon-open]');
    assert.equal(await trigger.count(),1,'one grouped summon action');
    assert.equal(await page.locator('#detailTechniqueList [data-v39-attack-name^="TEST_召喚"]').count(),0);
    const snapshot=()=>page.evaluate(()=>{const f=window.getV39ActiveFactionState();return {ap:f.units.find(u=>u.id==='expedition-test-king').ap,units:f.units.filter(u=>u.summon).map(u=>({id:u.id,name:u.className,level:u.level,hp:u.hp,members:u.combatProfile?.memberCount||0,x:u.x,y:u.y,deadline:u.summon.expiresAtTurn}))};});
    await trigger.click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#v39-summon-modal').count(),0);
    assert.equal(await page.evaluate(()=>window.isV39MapInputLocked()),false,'cancel releases map lock');
    await trigger.click();assert.equal(await page.locator('[data-summon-option]').count(),3);
    await page.locator('[data-summon-option="TEST_召喚ゾンビ"]').click();
    assert.equal((await snapshot()).ap,100);assert.equal((await snapshot()).units.length,0);
    await page.locator('[data-summon-tab="skills"]').click();await page.locator('[data-summon-tab="ability"]').click();
    await page.screenshot({path:`output/web-game/summon/modal-${width}.png`});
    assert(await page.evaluate(()=>document.querySelector('#v39-summon-modal .modal').getBoundingClientRect().width<=innerWidth));
    await page.locator('[data-summon-option="TEST_召喚スケルトン"]').click();await page.locator('[data-summon-confirm]').click();
    const skeleton=await snapshot();assert.equal(skeleton.ap,70);assert.equal(skeleton.units.length,2);
    assert(skeleton.units.every(u=>u.name==='スケルトン'&&u.level===5&&u.members===4));
    await page.waitForFunction(id=>window.getV39MapEntityMarker(id)?.list.some(child=>child.type==='Image'&&child.texture.key.includes('ゾンビスケルトンユニット集1')),skeleton.units[0].id);
    assert.equal(await page.evaluate(id=>{const image=window.getV39MapEntityMarker(id).list.find(child=>child.type==='Image');return image.frame.cutWidth===128&&image.frame.cutHeight===128;},skeleton.units[0].id),true,'actual field uses cropped undead sheet');
    await trigger.click();await page.locator('[data-summon-option="TEST_召喚スケルトン"]').click();assert(await page.locator('[data-summon-confirm]').isDisabled());
    await page.locator('[data-summon-option="TEST_召喚ゾンビ"]').click();await page.locator('[data-summon-confirm]').click();
    await trigger.click();await page.locator('[data-summon-option="TEST_召喚グール"]').click();await page.locator('[data-summon-confirm]').click();
    const all=await snapshot();assert.equal(all.ap,10);assert.equal(all.units.length,5);
    assert.equal(new Set(all.units.map(u=>u.id)).size,5);assert.equal(new Set(all.units.map(u=>`${u.x},${u.y}`)).size,5);
    assert.equal(all.units.filter(u=>u.name==='ゾンビ'&&u.members===3).length,2);assert.equal(all.units.filter(u=>u.name==='グール'&&u.level===9&&u.members===0).length,1);
    assert(all.units.every(u=>u.hp>1),'upper species inherits base HP');
    const armed=await page.evaluate(()=>window.getV39ActiveFactionState().units.filter(u=>u.summon).map(u=>({name:u.className,equipment:u.equipment,body:u.bodyWeaponLevels})));
    assert(armed.filter(u=>u.name==='スケルトン').every(u=>u.equipment.length===1&&['剣','槍','棍棒'].includes(u.equipment[0].name)&&u.equipment[0].quality==='common'&&u.body.爪===1));
    assert(armed.filter(u=>u.name==='ゾンビ').every(u=>u.equipment.length===0&&u.body.爪===10&&u.body.牙===10));
    if(width===390) {
      for(const species of ['スケルトン','ゾンビ']) {
        const actor=await page.evaluate(name=>window.getV39ActiveFactionState().units.find(u=>u.summon&&u.className===name),species);
        await page.locator(`#squadMemberList [data-v39-unit-id="${actor.id}"]`).click();
        const action=species==='ゾンビ'?'牙':actor.equipment[0].name;
        await page.locator(`#detailTechniqueList [data-v39-attack-name="${action}"]`).click();
        const damage=await page.evaluate(()=>{
          const s=window.getV39GameState(),occupied=new Set(s.players.flatMap(p=>p.factionState.units).map(u=>`${u.x},${u.y}`));
          const key=window.getV39AttackSession().rangeTileKeys.find(key=>!occupied.has(key)),[x,y]=key.split(',').map(Number);
          const enemy={...window.applyV39DerivedCharacterData({id:'summon-attack-target',race:'只人',className:'ファイター',level:1,x,y,equipment:[]}),hp:10000,currentHp:10000,maxHp:10000,ap:0,state:'生存',worldId:s.activeWorldId};
          window.setV39GameState({enemies:[...s.enemies,enemy]},{reason:'summon-attack-test'});
          const actor=window.getV39SelectedSquadUnit(),beforeAp=actor.ap;
          const result=window.executeV39AttackAt(x,y);
          const next=window.getV39GameState(),hp=next.enemies.find(u=>u.id===enemy.id).hp;
          window.setV39GameState({enemies:next.enemies.filter(u=>u.id!==enemy.id)},{reason:'summon-attack-test-cleanup'});
          return {result,damage:10000-hp,apSpent:beforeAp-window.getV39ActiveFactionState().units.find(u=>u.id===actor.id).ap};
        });
        assert(damage.result&&damage.apSpent>0,`${species} can attack through the real action panel`);
      }
      await page.locator('#squadMemberList [data-v39-unit-id="expedition-test-king"]').click();
    }
    await page.evaluate(()=>{const marker=window.getV39MapEntityMarker('expedition-test-king'),scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];scene.cameras.main.setZoom(scene.cameras.main.zoom*2.5).centerOn(marker.x,marker.y);});
    await page.screenshot({path:`output/web-game/summon/party-${width}.png`});
    const party=await page.evaluate(()=>{const f=window.getV39ActiveFactionState(),caster=f.units.find(u=>u.id==='expedition-test-king');return {id:caster.squadId,summons:f.units.filter(u=>u.summon).every(u=>u.squadId===caster.squadId),count:f.squads.find(s=>s.id===caster.squadId)?.unitIds.length};});
    assert(party.summons&&party.count>5,'summons join caster squad as extra slots');
    await page.evaluate(id=>window.openV39SquadEditor({squadId:id}),party.id);
    assert.equal(await page.locator('[data-squad-edit-save]').isDisabled(),false,'extra summoned slots remain editable');
    await page.locator('[data-squad-edit-close]').click();
    await page.evaluate(()=>{const f=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:f.units.map(u=>({...u,ap:100,currentAp:100,actionPoint:100}))});window.startV39SelectedUnitMove();});
    assert.equal(await page.evaluate(()=>window.getV39UnitMovePreview()?.unitIds.filter(id=>id.startsWith('summon-')).length),5,'all summoned extra members take part in movement');
    await page.evaluate(()=>{window.cancelV39SelectedUnitMove();const f=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:f.units.map(u=>u.id==='expedition-test-king'?{...u,ap:10,currentAp:10,actionPoint:10}:u)});});
    await page.evaluate(()=>{const save=window.exportV39SaveJson();window.importV39SaveJson(save);});
    assert.deepEqual((await snapshot()).units,all.units);
    await page.evaluate(async()=>{for(let i=0;i<4;i++)if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw Error('turn');});
    assert.equal((await snapshot()).units.length,5,'not expired early');
    await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true});await window.waitForV39MapRenderSettled();});
    assert.equal((await snapshot()).units.length,0,'expires at deadline');
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().deadUnitReserve.some(entry=>entry.unit?.summon)),false,'no corpse reserve');
    if(width===390&&!process.env.V39_PRODUCTION_CHECK) {
      const report=await page.evaluate(async()=>{
        const rules=await import('/src/lib/v39-summon-rules.js'),hex=await import('/src/lib/hex-grid.js'),gear=await import('/src/lib/v39-equipment-rules.js');
        for(const [value,name] of [[0,'剣'],[0.4,'槍'],[0.9,'棍棒']])if(rules.buildV39SummonEquipment('スケルトン',{},()=>value)[0]?.name!==name)throw Error('random equipment candidate '+name);
        const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData,id=state.activePlayerId,unitId='expedition-test-king';
        const check=(ok,name)=>{if(!ok)throw Error(name);};
        check(rules.parseV39SummonEffect({効果:'召喚_グール_Lv9_数1'}).members===0,'individual');
        check(!rules.parseV39SummonEffect({効果:'召喚_グール_Lv9_数0'}),'zero count rejected');
        check(!rules.parseV39SummonEffect({効果:'召喚_グール_Lv9_Lv2'}),'duplicate level rejected');
        const caster=state.players[0].factionState.units.find(u=>u.id===unitId),cloned=structuredClone(state);
        const blockers=hex.getHexNeighborCoords(map.w,map.h,caster.x,caster.y).map((tile,i)=>({id:'block'+i,hp:100,x:tile.x,y:tile.y}));
        cloned.enemies=blockers;const fail=rules.summonV39Units(cloned,id,unitId,'TEST_召喚スケルトン',map);
        check(!fail.ok&&fail.state===cloned,'blocked action is atomic');
        const created=rules.summonV39Units(state,id,unitId,'TEST_召喚スケルトン',map);check(created.ok,'restored skill available');
        const single=structuredClone(state);single.players[0].factionState.units.find(u=>u.id===unitId).squadId='solo';
        single.players[0].factionState.squads=single.players[0].factionState.squads.map(s=>({...s,unitIds:s.unitIds.filter(id=>id!==unitId)}));
        const auto=rules.summonV39Units(single,id,unitId,'TEST_召喚スケルトン',map);check(auto.ok,'solo caster summons');
        const autoSquad=auto.state.players[0].factionState.squads.find(s=>s.summonOwnerId===unitId);
        check(autoSquad.movementLeaderId===unitId&&autoSquad.unitIds.length===3,'solo caster becomes leader of new party');
        created.created[0].status.攻撃=9999;check(created.created[1].status.攻撃!==9999,'independent unit objects');
        const death=structuredClone(created.state);death.players[0].factionState.units.find(u=>u.id===created.created[0].id).hp=0;
        check(rules.expireV39Summons(death,state.timeline.turnNumber).removed.length===1,'dead summon removed immediately');
        const cargo=structuredClone(created.state),first=cargo.players[0].factionState.units.find(u=>u.id===created.created[0].id);
        first.toolStockByType={薬草:2};first.worldId='surface';
        cargo.players[0].factionState.squads[0].cargoByUnitId={...cargo.players[0].factionState.squads[0].cargoByUnitId,[first.id]:{resourcesByType:{宝石:1},equipmentInventory:[]}};
        const expiry=rules.expireV39Summons(cargo,first.summon.expiresAtTurn);
        const loot=expiry.state.groundLootByTile[`${first.x},${first.y}`].cargo;
        check(loot.resourcesByType.薬草===2&&loot.resourcesByType.宝石===1&&!loot.equipmentInventory.length,'real cargo retained without conjured equipment');
        check(!expiry.state.players[0].factionState.squads[0].cargoByUnitId[first.id],'expired individual cargo reference removed');
        first.worldId='other-world';
        check(!rules.expireV39Summons(cargo,first.summon.expiresAtTurn).removed.some(u=>u.id===first.id),'inactive world processed separately');
        const equipment=gear.changeV39UnitEquipment(created.state,id,{unitId:created.created[0].id,slot:'武器1',inventoryIndex:-1});
        check(!equipment.ok&&equipment.reason.includes('召喚'),'conjured gear cannot be transferred');
        return {parser:true,atomic:true,independent:true,death:true};
      });console.log(report);
    }
    await page.screenshot({path:`output/web-game/summon/expired-${width}.png`});assert.deepEqual(errors,[]);await page.close();
    console.log(`${width}: grouped action, three previews, AP, count, army members, unique placement, save and expiry passed`);
  }
  const cave=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  cave.on('pageerror',e=>errors.push(String(e.stack)));
  await cave.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:3022',{waitUntil:'networkidle'});
  await cave.locator('[data-v39-cave-test]').click();
  await cave.getByRole('button',{name:'探索ゲーム',exact:true}).click();
  await cave.getByRole('button',{name:'探索開始',exact:true}).click();
  await cave.evaluate(async()=>{
    const map=structuredClone(window.__v39FieldRuntime.mapData);delete map.caveEventNpc;
    map.grid=map.grid.map(row=>row.map(()=>'洞窟'));
    window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
    window.setV39GameState({enemies:[],neutralVillages:[]});
    const faction=window.getV39ActiveFactionState();
    window.updateV39ActiveFactionState({selectedUnitId:faction.units[0].id,
      units:faction.units.map((unit,i)=>i?unit:{...unit,x:10,y:10,position:[10,10],className:'テストサモナー',level:12,testOnly:true})});
    window.refreshV39SquadDerivedUI();document.querySelector('[data-squad-detail-tab="action"]').click();
    await window.waitForV39MapRenderSettled();
  });
  await cave.locator('#detailTechniqueList [data-v39-summon-open]').click();
  await cave.locator('[data-summon-option="TEST_召喚グール"]').click();
  await cave.locator('[data-summon-confirm]').click();
  assert.equal(await cave.evaluate(()=>{const s=window.getV39GameState();return s.players.flatMap(p=>p.factionState.units).filter(u=>u.summon&&u.worldId===s.activeWorldId).length;}),1);
  await cave.evaluate(async()=>{for(let i=0;i<5;i++)await window.advanceV39Turn({skipUnactedFocus:true});});
  assert.equal(await cave.evaluate(()=>window.getV39ActiveFactionState().units.filter(u=>u.summon).length),0);
  assert.deepEqual(errors,[]);await cave.close();
  console.log('cave: actual action button, same-world placement and native expiry passed');
}finally{await browser.close();}
