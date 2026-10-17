import assert from 'node:assert/strict';
import {selectFusionMaterial} from './lib/v39-fusion-ui.mjs';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/soul-storage',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    const initial=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();
      window.updateV39ActiveFactionState({soulStorage:[]},{reason:'soul-collection-test-reset'});
      const state=window.getV39GameState(),f=window.getV39ActiveFactionState();
      window.setV39GameState({enemies:state.enemies.map(u=>u.soulTestCorpse?{...u,equipment:[{name:'魂に移さない剣',slot:'武器1'}],corpseCargo:{resourcesByType:{木材:3}}}:u)});
      await window.waitForV39MapRenderSettled();
      const combat=await import('/src/lib/v39-combat-engine.js'),actor=f.units.find(u=>u.id==='expedition-test-king');
      return {cost:combat.resolveAttackApCost(combat.resolveActionSkillRows(actor).find(r=>r.名前==='TEST_魂回収'),actor),count:f.units.length,bodies:state.enemies.filter(u=>u.soulTestCorpse).map(u=>({id:u.id,x:u.x,y:u.y,level:u.level})),storage:f.soulStorage.length};
    });
    assert.equal(initial.storage,0);
    const skill=()=>page.locator('#detailTechniqueList [data-v39-attack-name="TEST_魂回収"]');
    await skill().click();
    const missing=await page.evaluate(target=>{
      const s=window.getV39GameState(),facilities={...s.facilitiesByTile};delete facilities['3,4'];
      window.setV39GameState({facilitiesByTile:facilities});
      const result=window.executeV39AttackAt(target.x,target.y),ap=window.getV39ActiveFactionState().units.find(u=>u.id==='expedition-test-king').ap;
      window.setV39GameState({facilitiesByTile:s.facilitiesByTile});
      return {result,ap};
    },initial.bodies[0]);
    assert.equal(missing.result,false);assert.equal(missing.ap,100);
    for(let i=0;i<2;i++){
      if(i)await page.evaluate(()=>{
        const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1},players:s.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id==='expedition-test-king'?{...u,ap:100,currentAp:100}:u)}}))});
        window.refreshV39SquadDerivedUI();document.querySelector('[data-squad-detail-tab="action"]')?.click();
      });
      await page.evaluate(()=>window.cancelV39SelectedUnitAttack());
      await skill().click();
      const target=initial.bodies[i];
      const result=await page.evaluate(target=>window.executeV39AttackAt(target.x,target.y),target);
      assert.equal(result,true,'native soul skill resolves');
      await page.evaluate(()=>{
        const s=window.getV39GameState(),f=window.getV39ActiveFactionState();
        if(f.combatRuntime.pendingActionsByUnitId?.['expedition-test-king']){
          window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1}});
          window.dispatchEvent(new CustomEvent('v39:turn-advanced',{detail:{turnNumber:s.timeline.turnNumber+1}}));
        }
      });
      const after=await page.evaluate(()=>{const s=window.getV39GameState(),f=window.getV39ActiveFactionState();return {count:f.units.length,souls:f.soulStorage,ap:f.units.find(u=>u.id==='expedition-test-king').ap,bodies:s.enemies.filter(u=>u.soulTestCorpse)};});
      assert.equal(after.count,initial.count);assert.equal(after.souls.length,i+1);assert.equal(after.ap,100-initial.cost);
      assert(after.bodies.find(u=>u.id===target.id).soulCollected);
      const soul=after.souls.find(s=>s.sourceUnitId===target.id);
      assert.equal(soul.level,target.level);assert.equal(soul.hp,0);assert.equal(soul.equipment.length,0);
      assert(!('x' in soul)&&!('corpseCargo' in soul));
    }
    const guards=await page.evaluate(async()=>{
      const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),f=p.factionState;
      const {collectV39Soul,getV39SoulArchives}=await import('/src/lib/v39-soul-storage.js');
      const {buildV39UndeadInheritance}=await import('/src/lib/v39-undead-inheritance.js');
      const {convertV39CorpsesInDeathFog}=await import('/src/lib/v39-corpse-undead-rules.js');
      const {createV39EventEnemy}=await import('/src/v39/ai/v39-enemy-spawn.js');
      const fusion=await import('/src/lib/v39-monster-fusion.js');
      const {getHexOffsetNeighbors}=await import('/src/lib/hex-grid.js');
      const body=s.enemies.find(u=>u.soulTestCorpse),before=JSON.stringify(s);
      const duplicate=collectV39Soul(s,p.id,body);
      const recipe=fusion.getV39FusionRecipes(s).find(r=>r.状態==='テスト専用');
      const request={playerId:p.id,actorId:'expedition-test-king',recipeId:recipe.id,mode:'skill',materialIds:f.soulStorage.map(s=>s.id)};
      const mixed=fusion.executeV39MonsterFusion(s,{...request,materialIds:[f.soulStorage[0].id,'fusion-test-devil']});
      const mixedOk=mixed.ok&&mixed.state.players.find(row=>row.id===p.id).factionState.soulStorage.length===1
        &&mixed.created.x===f.units.find(u=>u.id==='fusion-test-devil').x;
      const noArchive=structuredClone(s);delete noArchive.facilitiesByTile['3,4'];
      const missingArchiveRejected=!fusion.executeV39MonsterFusion(noArchive,request).ok;
      const blocked=structuredClone(s),bf=blocked.players.find(row=>row.id===p.id).factionState;
      const actor=bf.units.find(u=>u.id===request.actorId);
      bf.units.push(...getHexOffsetNeighbors(actor.x,actor.y).map((tile,index)=>({...actor,...tile,id:`blocker-${index}`})));
      const noSpace=fusion.executeV39MonsterFusion(blocked,request);
      const noSpaceRejected=!noSpace.ok&&noSpace.state===blocked&&bf.soulStorage.length===2;
      const converted=convertV39CorpsesInDeathFog(s,window.__v39FieldRuntime.mapData,s.timeline.turnNumber,{createEnemy:createV39EventEnemy,corpseIds:new Set(s.enemies.filter(u=>u.soulTestCorpse).map(u=>u.id))});
      const deadOwn={...body,id:'soul-collected-own'};
      window.setV39GameState({players:s.players.map(row=>row.id===p.id?{...row,factionState:{...f,units:[...f.units,deadOwn]}}:row)});
      const revival=window.reviveV39Unit(p.id,deadOwn.id);
      window.setV39GameState({players:s.players});
      window.importV39SaveJson(window.exportV39SaveJson());
      const markedSaved=window.getV39GameState().enemies.filter(u=>u.soulTestCorpse).every(u=>u.soulCollected);
      const underground={...s,activeWorldId:'cave-test',explorationWorlds:{surface:{spatial:{facilitiesByTile:s.facilitiesByTile,territoryOwnerByTile:s.territoryOwnerByTile}}}};
      return {duplicate:!duplicate.ok,immutable:before===JSON.stringify(s),noUndead:!buildV39UndeadInheritance(body)&&!converted.spawned.length,
        noRevival:!revival.ok,mixedOk,missingArchiveRejected,noSpaceRejected,markedSaved,saveBefore:f.soulStorage,saveAfter:window.getV39ActiveFactionState().soulStorage,undergroundArchive:getV39SoulArchives(underground,p.id).length>0,ids:f.soulStorage.map(s=>s.id)};
    });
    assert.deepEqual(guards.saveAfter,guards.saveBefore,'stored soul save identity');
    for(const key of ['duplicate','immutable','noUndead','noRevival','mixedOk','missingArchiveRejected','noSpaceRejected','markedSaved','undergroundArchive'])assert.equal(guards[key],true,key);
    await page.evaluate(()=>{window.refreshV39SquadDerivedUI();document.querySelector('[data-squad-detail-tab="action"]')?.click();});
    await page.locator('[data-v39-fusion-open]').first().click();
    await page.selectOption('[data-fusion-recipe]',{label:'テスト・バイコーン（テスト専用）'});
    for(let i=0;i<2;i++)await selectFusionMaterial(page,i,guards.ids[i]);
    assert(!await page.locator('[data-fusion-confirm]').isDisabled());
    await page.screenshot({path:`output/web-game/soul-storage/preview-${width}.png`});
    await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
    const made=await page.evaluate(()=>{const f=window.getV39ActiveFactionState();return {count:f.units.length,souls:f.soulStorage,created:f.units.find(u=>u.fusionGrowth)};});
    assert.equal(made.count,initial.count+1);assert.equal(made.souls.length,0);assert.equal(made.created.level,7);
    assert.equal(made.created.state,'生存');assert(made.created.hp>0&&!made.created.soulStored);
    assert(Number.isInteger(made.created.x)&&Number.isInteger(made.created.y));
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson()));
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().soulStorage.length),0);
    assert.deepEqual(errors,[]);console.log(`${width}: native AP/cooldown skill, archive required, soul-only fusion, no gear duplication, no resurrection/undead/recovery, cave archive and save/load passed`);
    await page.close();
  }
}finally{await browser.close();}
