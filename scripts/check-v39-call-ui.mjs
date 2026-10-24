import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/call',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.activateV39FooterTab('test');});
    await page.locator('[data-test-action="call-test-start"]').click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState().units.some(unit=>unit.id==='call-test-wolf'));
    const animals=()=>page.evaluate(()=>window.getV39ActiveFactionState().units.filter(unit=>unit.id.startsWith('call-test-')).map(unit=>({id:unit.id,hp:unit.hp,ap:unit.ap,equipment:unit.equipment,x:unit.x,y:unit.y,squadId:unit.squadId})));
    const before=await animals();
    const trigger=page.locator('#detailTechniqueList [data-v39-call-open]');assert.equal(await trigger.count(),1);
    await trigger.click();assert.equal(await page.locator('[data-call-option]').count(),3);
    await page.locator('[data-call-option="call-test-outside"]').click();assert(await page.locator('[data-call-confirm]').isDisabled());
    await page.locator('[data-call-option="call-test-wolf"]').click();await page.locator('[data-call-option="call-test-horse"]').click();
    await page.locator('[data-summon-tab="skills"]').click();await page.locator('[data-summon-tab="ability"]').click();
    assert.deepEqual(await animals(),before,'selection does not teleport');
    await page.screenshot({path:`output/web-game/call/modal-${width}.png`});
    await page.locator('[data-call-confirm]').click();
    const after=await animals();
    assert.deepEqual(after.map(({x,y,squadId,...unit})=>unit),before.map(({x,y,squadId,...unit})=>unit),'IDs, HP, AP and equipment preserved');
    const party=await page.evaluate(()=>{const f=window.getV39ActiveFactionState(),caster=f.units.find(u=>u.id==='expedition-test-king');return {id:caster.squadId,selected:f.selectedUnitId,squad:f.squads.find(s=>s.id===caster.squadId),solo:f.squads.find(s=>s.id==='solo')};});
    assert.equal(party.selected,'expedition-test-king');assert.equal(party.squad.movementLeaderId,'expedition-test-king');
    assert(after.slice(0,2).every(u=>u.squadId===party.id&&party.squad.unitIds.includes(u.id)),'called allies join caller party');
    assert(!party.solo.unitIds.includes('call-test-wolf')&&!party.solo.unitIds.includes('call-test-horse'),'old membership removed');
    assert.deepEqual(after[2],before[2],'territory outsider stays');assert(after.slice(0,2).every(unit=>Math.abs(unit.x-9)<=1&&Math.abs(unit.y-9)<=1));
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='expedition-test-king').ap),70);
    await page.screenshot({path:`output/web-game/call/joined-${width}.png`});
    await trigger.click();assert(await page.locator('[data-call-confirm]').isDisabled());await page.keyboard.press('Escape');
    await page.evaluate(()=>{const save=window.exportV39SaveJson();window.importV39SaveJson(save);});assert.deepEqual(await animals(),after);
    const skillLevels=await page.evaluate(()=>({human:window.deriveV39CharacterFromRaceClass({race:'只人',className:'戦闘試験官',level:11,testOnly:true}).acquiredSkillNames,
      demi:window.deriveV39CharacterFromRaceClass({race:'オーガ',className:'テストサモナー',level:11,testOnly:true}).acquiredSkillNames,
      demi12:window.deriveV39CharacterFromRaceClass({race:'オーガ',className:'テストサモナー',level:12,testOnly:true}).acquiredSkillNames}));
    assert(skillLevels.human.includes('死の刃'),'Skill11 is acquired at human class Lv11');
    assert(!skillLevels.demi.includes('TEST_動物呼集')&&skillLevels.demi12.includes('TEST_動物呼集'),'demi total Lv11 = class5; total12 = class6');
    if(!process.env.V39_PRODUCTION_CHECK)await page.evaluate(async()=>{
      const rules=await import('/src/lib/v39-call-rules.js'),art=await import('/src/lib/map-entity-artwork.js'),hex=await import('/src/lib/hex-grid.js');
      const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData,id=state.activePlayerId,caster='expedition-test-king';
      const check=(ok,name)=>{if(!ok)throw Error(name);};
      check(!rules.parseV39CallEffect({効果:'呼集_動物_数0'}),'invalid syntax');
      const fail=rules.callV39Units(state,id,caster,'TEST_動物呼集',map,['call-test-outside']);check(!fail.ok&&fail.state===state,'failure atomic');
      const blocked=structuredClone(state),f=blocked.players.find(player=>player.id===id).factionState,c=f.units.find(unit=>unit.id===caster);
      f.combatRuntime.cooldownsByUnitId[caster]={};c.ap=c.currentAp=100;
      const target=f.units.find(unit=>unit.id==='call-test-wolf');target.x=16;target.y=10;
      blocked.territoryOwnerByTile['16,10']=id;
      blocked.enemies=hex.getHexNeighborCoords(map.w,map.h,c.x,c.y).map((tile,i)=>({...tile,id:'block'+i,hp:100,worldId:'surface'}));
      const noSpace=rules.callV39Units(blocked,id,caster,'TEST_動物呼集',map,[target.id]);
      check(!noSpace.ok&&noSpace.state===blocked&&noSpace.reason.includes('隣接'),'blocked placement atomic without cooldown masking');
      target.worldId='other-world';check(!rules.inspectV39Call(blocked,id,caster,'TEST_動物呼集',map,[target.id]).available,'world restriction');
      const ready=structuredClone(state),rf=ready.players.find(p=>p.id===id).factionState;
      rf.combatRuntime.cooldownsByUnitId[caster]={};rf.units.find(u=>u.id===caster).ap=100;
      const rt=rf.units.find(u=>u.id==='call-test-wolf');rt.x=16;rt.y=10;ready.territoryOwnerByTile['16,10']=id;
      // 別部隊から移籍し、その部隊の移動先頭も残ったメンバーへ交代する。
      rf.squads=rf.squads.map(s=>({...s,unitIds:s.unitIds.filter(uid=>uid!==rt.id)}));
      const outside=rf.units.find(u=>u.id==='call-test-outside');outside.squadId='old-party';rt.squadId='old-party';
      rf.squads=rf.squads.map(s=>({...s,unitIds:s.unitIds.filter(uid=>uid!==outside.id)}));
      rf.squads.push({id:'old-party',label:'元部隊',unitIds:[rt.id,outside.id],movementLeaderId:rt.id});
      const transferred=rules.callV39Units(ready,id,caster,'TEST_動物呼集',map,[rt.id]);check(transferred.ok,'existing party transfer');
      const old=transferred.state.players.find(p=>p.id===id).factionState.squads.find(s=>s.id==='old-party');
      check(old.unitIds.length===1&&old.movementLeaderId===outside.id,'old party and leader repaired');
      const personal=structuredClone(ready);personal.players.find(p=>p.id===id).factionState.squads.find(s=>s.id==='old-party').cargoByUnitId={[rt.id]:{resourcesByType:{木材:2},equipmentInventory:[]}};
      const carried=rules.callV39Units(personal,id,caster,'TEST_動物呼集',map,[rt.id]);check(carried.ok,'personal cargo transfer');
      const cf=carried.state.players.find(p=>p.id===id).factionState;
      check(cf.squads.find(s=>s.id===carried.squadId).cargo.resourcesByType.木材===2&&!cf.squads.find(s=>s.id==='old-party').cargoByUnitId[rt.id],'cargo transferred once');
      const solo=structuredClone(ready),sf=solo.players.find(p=>p.id===id).factionState;
      sf.units.find(u=>u.id===caster).squadId='solo';sf.squads=sf.squads.map(s=>({...s,unitIds:s.unitIds.filter(uid=>uid!==caster)}));
      const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
      Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
      try{const joined=rules.callV39Units(solo,id,caster,'TEST_動物呼集',map,[rt.id]);check(joined.ok&&joined.squadId.startsWith('squad-'),'HTTP fallback party creation');}
      finally{if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);else delete crypto.randomUUID;}
      const loaded=structuredClone(ready);loaded.players.find(p=>p.id===id).factionState.squads.find(s=>s.id==='old-party').cargo={resourcesByType:{木材:3}};
      const cargoFail=rules.callV39Units(loaded,id,caster,'TEST_動物呼集',map,[rt.id]);check(!cargoFail.ok&&cargoFail.state===loaded&&cargoFail.reason.includes('荷下ろし'),'shared cargo protected atomically');
      const full=structuredClone(ready),ff=full.players.find(p=>p.id===id).factionState,party=ff.squads.find(s=>s.unitIds.includes(caster));
      for(let i=0;i<3;i++){const u={...ff.units.find(u=>u.id===caster),id:'extra'+i,squadId:party.id,summon:null};ff.units.push(u);party.unitIds.push(u.id);}
      const cap=rules.callV39Units(full,id,caster,'TEST_動物呼集',map,[rt.id]);check(!cap.ok&&cap.state===full&&cap.reason.includes('5体'),'normal member limit without teleport or AP loss');
      for(const [name,file,slot] of [['ゾンビ','ゾンビ・スケルトン_ユニット集1.webp',1],['スケルトン','ゾンビ・スケルトン_ユニット集1.webp',2],['グール','アンデッド・霊体系_ユニット集.webp',3]]) {
        for(const fn of [art.resolveUnitArtwork,art.resolveEnemyArtwork]){const result=fn({race:'ゾンビ',className:name});check(result.sourcePath.endsWith(file)&&result.sheetFrame.slotNumber===slot,'dedicated undead frame');}
      }
      check(art.resolveUnitArtwork({race:'ウルフ',className:'スケルトン'}).sheetFrame.slotNumber===5,'animal undead preserved');
    });
    await page.locator('[data-squad-detail-tab="basic"]').click();
    await page.locator('#mobileBattleMove').click();
    await page.waitForFunction(()=>window.getV39UnitMovePreview()?.unitIds.includes('call-test-wolf')&&window.getV39UnitMovePreview()?.unitIds.includes('call-test-horse'));
    const destination=await page.evaluate(()=>{const p=window.getV39UnitMovePreview(),tile=p.reachable.find(tile=>tile.cost>0);if(!tile)throw Error('no party movement destination');const [x,y]=tile.key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));return {x,y};});
    await page.locator('#moveOk').click();
    await page.waitForFunction(tile=>{const u=window.getV39ActiveFactionState().units.find(u=>u.id==='expedition-test-king');return u.x===tile.x&&u.y===tile.y;},destination);
    const walked=await animals();
    assert(walked.slice(0,2).some((u,i)=>u.x!==after[i].x||u.y!==after[i].y),'called members actually follow caller');
    assert.equal(new Set(walked.slice(0,2).map(u=>`${u.x},${u.y}`)).size,2,'followers do not overlap');
    assert.deepEqual(errors,[]);console.log(`${width}: call, party join, old membership, preserved identity/save and joint movement passed`);await page.close();
  }
}finally{await browser.close();}
