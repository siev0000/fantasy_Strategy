import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/animal-army';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:width===320?640:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();await page.locator('[data-test-action="animal-army-test-start"]').click();
    await page.locator('#characterModal [data-v39-character-row="animal-army-field-0"]').click();
    await page.locator('#characterModal [data-animal-army-open]').click();
    await page.locator('[data-animal-army-select="animal-army-field-1"]').check();
    await page.locator('[data-animal-army-select="animal-army-field-2"]').check();
    await page.screenshot({path:`${out}/create-${width}.png`});
    const bounds=await page.locator('[data-animal-army-save]').boundingBox();assert(bounds.y+bounds.height<=(width===320?640:844));
    await page.locator('[data-animal-army-save]').click();
    const made=await page.evaluate(()=>{const s=window.getV39GameState({includeWorlds:false}),f=s.players.find(p=>p.id===s.activePlayerId).factionState;return f.units.find(u=>u.id==='animal-army-field-0');});
    assert.equal(made.level,6);assert.equal(made.animalArmy.members.length,3);assert.equal(made.combatProfile.attackCount,3);assert.equal(made.ap,0);
    await page.locator('#characterModal [data-animal-army-open]').click();
    await page.locator('[data-animal-army-select="animal-army-field-1"]').uncheck();
    await page.locator('[data-animal-army-select="animal-army-field-3"]').check();
    await page.locator('[data-animal-army-save]').click();
    const changed=await page.evaluate(()=>{const s=window.getV39GameState({includeWorlds:false}),f=s.players.find(p=>p.id===s.activePlayerId).factionState;return {army:f.units.find(u=>u.id==='animal-army-field-0'),removed:f.units.find(u=>u.id==='animal-army-field-1'),positions:f.units.filter(u=>u.id.startsWith('animal-army-field')).map(u=>`${u.x},${u.y}`)};});
    assert.equal(changed.army.level,8);assert.equal(changed.removed.level,6);assert.equal(changed.removed.ap,0);assert.equal(new Set(changed.positions).size,changed.positions.length);
    await page.locator('#characterModal [data-animal-army-open]').click();await page.locator('[data-animal-army-disband]').click();
    const split=await page.evaluate(()=>{const s=window.getV39GameState({includeWorlds:false});return s.players.find(p=>p.id===s.activePlayerId).factionState.units.filter(u=>u.id.startsWith('animal-army-field'));});
    assert.equal(split.length,4);assert(split.every(u=>!u.animalArmy&&u.ap===0));assert.deepEqual(split.map(u=>u.level).sort((a,b)=>a-b),[3,6,9,12]);
    // Stored units use the same editor, without putting the whole reserve on the field.
    await page.locator('#characterModal [data-v39-character-row="animal-army-stored-0"]').click();await page.locator('#characterModal [data-animal-army-open]').click();
    await page.locator('[data-animal-army-select="animal-army-stored-1"]').check();await page.locator('[data-animal-army-select="animal-army-stored-2"]').check();
    await page.locator('[data-animal-army-select="animal-army-stored-3"]').check();await page.locator('[data-animal-army-select="animal-army-stored-4"]').check();
    assert.equal(await page.locator('[data-animal-army-save]').isEnabled(),true);
    await page.locator('[data-animal-army-select="animal-army-stored-5"]').check();
    assert.equal(await page.locator('[data-animal-army-save]').isDisabled(),true,'six members exceed the limit');
    await page.locator('[data-animal-army-select="animal-army-stored-5"]').uncheck();
    await page.locator('[data-animal-army-save]').click();
    const stored=await page.evaluate(()=>{const s=window.getV39GameState({includeWorlds:false}),f=s.players.find(p=>p.id===s.activePlayerId).factionState;return {entries:f.facilityStorage.filter(e=>e.unit.id.startsWith('animal-army-stored')),fields:f.units.filter(u=>u.id.startsWith('animal-army-stored'))};});
    assert.equal(stored.entries.length,2);assert.equal(stored.entries[0].unit.level,12);assert.equal(stored.entries[1].unit.level,6);assert.equal(stored.entries[1].unit.animalArmy.members.length,5);assert.equal(stored.entries[1].unit.combatProfile.attackCount,5);assert.equal(stored.fields.length,0);
    await page.locator('#characterModal [data-animal-army-open]').click();await page.screenshot({path:`${out}/stored-${width}.png`});
    await page.locator('[data-animal-army-disband]').click();
    const restored=await page.evaluate(()=>{const s=window.getV39GameState({includeWorlds:false});return s.players.find(p=>p.id===s.activePlayerId).factionState.facilityStorage.filter(e=>e.unit.id.startsWith('animal-army-stored')).map(e=>e.unit.level);});assert.deepEqual(restored.sort((a,b)=>a-b),[4,5,7,8,10,12]);
    if(!process.env.V39_TEST_URL){
      const checks=await page.evaluate(async()=>{
        const {editV39AnimalArmy:edit}=await import('/src/lib/v39-animal-army.js');
        const {grantV39UnitExperience:grant,resolveV39UnitTotalExpForLevel:total,resolveV39UnitLevelCap:cap}=await import('/src/lib/v39-unit-experience.js');
        const {computeAttackDamage}=await import('/src/lib/v39-combat-engine.js');
        const state=window.getV39GameState({includeWorlds:false}),id=state.activePlayerId,map=window.__v39FieldRuntime.mapData;
        const f=s=>s.players.find(p=>p.id===id).factionState;
        f(state).units.find(u=>u.id==='animal-army-field-1').equipment=[{name:'長剣',slot:'武器1',quality:'common',id:'army-member-weapon'}];
        const request={anchorId:'animal-army-field-0',memberIds:['animal-army-field-0','animal-army-field-1']};
        const before=JSON.stringify(state),made=edit(state,id,request,map),army=made.army;
        if(!made.ok)throw Error(made.reason);
        const gain=grant(army,1200),sum=u=>u.animalArmy.members.reduce((n,m)=>n+(m.totalExp??total(m.level,'other')),0);
        const wounded=structuredClone(made.state),a=f(wounded).units.find(u=>u.id===army.id);a.hp=Math.floor(a.maxHp/2);a.currentHp=a.hp;
        const split=edit(wounded,id,{anchorId:army.id,disband:true},map);
        const denied=[];
        for(const mutate of [s=>{f(s).units.find(u=>u.id==='animal-army-field-1').isNamed=true;},s=>{f(s).units.find(u=>u.id==='animal-army-field-1').worldId='other';},s=>{f(s).units.find(u=>u.id==='animal-army-field-1').x=99;},s=>{f(s).units.find(u=>u.id==='animal-army-field-1').transportAssignment={};},s=>{s.activePlayerId='other';},s=>{f(s).units.find(u=>u.id==='animal-army-field-1').className='ファイター';},s=>{f(s).combatRuntime={cooldownsByUnitId:{'animal-army-field-1':{'爪':99999}}};}]){const s=structuredClone(state);mutate(s);denied.push(!edit(s,id,request,map).ok);}
        const filled=structuredClone(made.state);filled.enemies=[...(filled.enemies||[])];
        for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)filled.enemies.push({id:`block-${x}-${y}`,x,y,hp:1,worldId:'surface'});
        const blocked=!edit(filled,id,{anchorId:army.id,disband:true},map).ok;
        const maxed=grant({...army.animalArmy.members[0],level:15,totalExp:total(15,'other')},10000);
        const heroCap=cap({...army.animalArmy.members[0],unitType:'ヒーロー'});
        const damage=computeAttackDamage({attacker:army,target:army,skillRow:{名前:'テスト爪',行動:'A',攻撃手段:'爪',打撃:20,判定:'攻撃'},random:()=>0});
        const reserveIds=Array.from({length:5},(_,i)=>`animal-army-stored-${i}`);
        const reserve=edit(made.state,id,{anchorId:'animal-army-stored-0',memberIds:reserveIds},map);
        if(!reserve.ok)throw Error(reserve.reason);
        if(edit(made.state,id,{anchorId:'animal-army-stored-0',memberIds:[...reserveIds,'animal-army-stored-5']},map).ok)throw Error('six members accepted');
        window.setV39GameState({players:reserve.state.players},{reason:'army-save-test'});
        const save=window.exportV39SaveJson();window.importV39SaveJson(save);
        const loaded=f(window.getV39GameState({includeWorlds:false})).units.find(u=>u.id===army.id);
        if(f(window.getV39GameState({includeWorlds:false})).facilityStorage.find(e=>e.unit.id==='animal-army-stored-0')?.unit.animalArmy?.members.length!==5)throw Error('stored army lost on load');
        const loadedSplit=edit(window.getV39GameState({includeWorlds:false}),id,{anchorId:army.id,disband:true},window.__v39FieldRuntime.mapData);
        const equipmentPreserved=loadedSplit.ok&&loadedSplit.units.flatMap(u=>u.equipment||[]).filter(item=>item.id==='army-member-weapon').length===1;
        return {immutable:before===JSON.stringify(state),equipmentPreserved,level:army.level,exp:army.exp,need:army.animalArmy.members.map(m=>m.level),amount:gain.amount,totalDelta:sum(gain.unit)-sum(army),growMembers:gain.unit.animalArmy.members.map(m=>m.level),woundedSplit:split.ok&&split.units.every(u=>u.hp<u.maxHp),denied,blocked,maxLevel:maxed.unit.level,maxGain:maxed.amount,heroCap,loaded:loaded.animalArmy.members.length,loadedLevel:loaded.level,attackCount:damage.detail?.attackCount};
      });
      assert(checks.immutable);assert(checks.equipmentPreserved);assert.equal(checks.level,4);assert(checks.exp>0);assert.equal(checks.totalDelta,1200);assert.equal(checks.amount,1200);assert(checks.woundedSplit);assert(checks.denied.every(Boolean));assert(checks.blocked);assert.equal(checks.maxLevel,15);assert.equal(checks.maxGain,0);assert.equal(checks.heroCap,120);assert.equal(checks.loaded,2);assert.equal(checks.loadedLevel,4);assert.equal(checks.attackCount,2);
    }
    assert.deepEqual(errors,[]);console.log(`${width}: create, exchange, split, storage, average Lv/EXP, AP/HP and save passed`);await page.close();
  }
}finally{await browser.close();}
