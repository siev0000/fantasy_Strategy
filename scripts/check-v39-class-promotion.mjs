import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/class-promotion',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const derive=window.applyV39DerivedCharacterData;
      const faction=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({selectedUnitId:'expedition-test-king',units:faction.units.map(unit=>unit.id==='expedition-test-king'
        ? {...derive({...unit,level:13}),hp:100,currentHp:100,totalExp:6000,exp:20}:unit)});
      await window.waitForV39MapRenderSettled();window.openV39CharacterModal();
    });
    await page.locator('[data-v39-character-row="expedition-test-king"]').click();
    await page.locator('[data-v39-character-detail-tab="growth"]').click();
    const before=await page.evaluate(()=>{const u=window.getV39ActiveFactionState().units.find(u=>u.id==='expedition-test-king');return {level:u.level,totalExp:u.totalExp,hp:u.hp,ap:u.ap};});
    await page.locator('.v39-char-promotion').filter({has:page.locator('[data-v39-class-acquire="ウォーリアー"]')}).locator('summary').click();
    await page.locator('[data-v39-class-acquire="ウォーリアー"]').click();
    const after=await page.evaluate(()=>{const u=window.getV39ActiveFactionState().units.find(u=>u.id==='expedition-test-king');return {className:u.className,level:u.level,totalExp:u.totalExp,ap:u.ap,prior:u.prerequisiteClassLevels,own:u.derivedCharacter.classLevels,race:u.derivedCharacter.raceLevels};});
    assert.equal(after.className,'ウォーリアー');assert.equal(after.level,before.level);assert.equal(after.totalExp,before.totalExp);assert.equal(after.ap,before.ap);
    assert.equal(after.prior.ファイター,10);assert.equal(after.own,3);assert.equal(after.race,0);
    await page.screenshot({path:`output/web-game/class-promotion/growth-${width}.png`});
    await page.evaluate(()=>{const save=window.exportV39SaveJson();window.importV39SaveJson(save);});
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.id==='expedition-test-king').derivedCharacter.classLevels),3);
    if(width===390&&!process.env.V39_PRODUCTION_CHECK) {
      const report=await page.evaluate(async()=>{
        const {applyV39DerivedCharacterData:derive}=await import('/src/v39/unit/v39-character-derived-rules.js');
        const promotion=await import('/src/lib/v39-class-progression.js'),xp=await import('/src/lib/v39-unit-experience.js');
        const support=await import('/src/lib/v39-squad-support.js'),passive=await import('/src/lib/v39-passive-rules.js');
        const data=await import('/src/lib/game-data-registry.js');
        const check=(ok,name)=>{if(!ok)throw Error(name);};
        const unit=derive({id:'u',race:'只人',className:'ファイター',level:13,hp:100,x:4,y:4,ap:100});
        const state={activePlayerId:'p',activeWorldId:'surface',timeline:{phase:'player'},players:[{id:'p',factionState:{units:[unit],squads:[{id:'s',unitIds:['u']}],settlements:[]}}]};
        const warrior=data.getGameDataRows('クラス').find(row=>row.名前==='ウォーリアー');
        check(!promotion.inspectV39ClassPromotion(state,'p',derive({...unit,level:10}),warrior).available,'surplus required');
        check(promotion.inspectV39ClassPromotion(state,'p',derive({...unit,level:11}),warrior).surplus===1,'one extra level');
        const result=promotion.acquireV39UpperClass(state,'p','u','ウォーリアー');check(result.ok,'promotion');
        check(!promotion.acquireV39UpperClass(result.state,'p','u','ウォーリアー').ok,'duplicate rejected');
        const trained=result.state.players[0].factionState.units[0],category=xp.resolveV39UnitRaceCategory(trained);
        const leveled=xp.grantV39UnitExperience({...trained,totalExp:xp.resolveV39UnitTotalExpForLevel(13,category)},xp.resolveV39UnitExpNeed(13,category)).unit;
        check(leveled.derivedCharacter.classLevels===4&&leveled.prerequisiteClassLevels.ファイター===10,'new growth stays in upper class');
        const goblin=derive({...unit,race:'ゴブリン',level:26});state.players[0].factionState.units=[goblin];
        const nonhuman=promotion.acquireV39UpperClass(state,'p','u','ウォーリアー');check(nonhuman.ok,'nonhuman promotion');
        const g=nonhuman.state.players[0].factionState.units[0];check(g.derivedCharacter.raceLevels===13&&g.derivedCharacter.classLevels===3,'race is not transferred');
        const row={名前:'部隊指揮',行動:'P',効果:'部隊支援',対象:'他部隊員',攻撃:5};
        const actor={id:'a',race:'只人',className:'ファイター',hp:100,status:{攻撃:100},techniques:[]};
        const commander={...actor,id:'c',techniques:[{source:row}]};
        const owner={players:[{factionState:{units:[actor,commander],squads:[{id:'s',unitIds:['a','c']}]}}]};
        const buff=support.applyV39SquadSupport(actor,owner);check(buff.status.攻撃===105,'other member bonus');
        check(support.applyV39SquadSupport(buff,owner).status.攻撃===105,'repeat non stacking');
        check(passive.resolveV39PassiveContext(buff,{攻撃手段:'武器'}).unit.status.攻撃===105,'combat no double bonus');
        check(support.applyV39SquadSupport(commander,owner).status.攻撃===100,'self excluded');
        commander.worldId='cave';check(support.applyV39SquadSupport(buff,owner).status.攻撃===100,'world exit removes');commander.worldId='surface';
        const conditional={名前:'同伴強化',行動:'P',対象:'自身',条件:'部隊クラス_ナイト',防御:10};
        actor.techniques=[{source:conditional}];commander.className='ナイト';
        check(support.applyV39SquadSupport(actor,owner).status.防御===10,'class companion');
        conditional.条件='部隊種族_エルフ';commander.race='エルフ';check(support.applyV39SquadSupport(actor,owner).status.防御===10,'race companion');
        conditional.条件='部隊統治者';commander.isSovereign=true;check(support.applyV39SquadSupport(actor,owner).status.防御===10,'sovereign companion');
        conditional.条件='不明条件';check(!support.applyV39SquadSupport(actor,owner).status.防御,'unknown condition not unconditional');
        return {promotion:true,continuedGrowth:true,nonhuman:true,squadSkills:true};
      });console.log(report);
    }
    assert.deepEqual(errors,[]);await page.close();console.log(`${width}: native promotion, level conservation and real save/load passed`);
  }
}finally{await browser.close();}
