import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/village-sheet-dialogue';mkdirSync(out,{recursive:true});
const definitions=JSON.parse(readFileSync('config/v39-village-incident-test.json','utf8')).numberedEvents;
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39VillageIncidentTest();});
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    await page.waitForSelector('[data-sheet-event="TEST_SHEET_SUPPLY"]');
    await page.waitForFunction(()=>document.querySelector('.topbar').matches(':popover-open'));
    const originalHeader=await page.evaluate(()=>{
      const header=document.querySelector('.topbar'),rect=header.getBoundingClientRect();
      const modal=document.getElementById('v39-village-menu').getBoundingClientRect();
      return {front:header.contains(document.elementFromPoint(rect.left+20,rect.top+20)),top:modal.top,bottom:rect.bottom};
    });
    assert(originalHeader.front);assert.equal(originalHeader.top,originalHeader.bottom);
    const initial=await page.evaluate(()=>{
      window.__sheetInitial=window.getV39GameState();
      const s=window.__sheetInitial,p=s.players.find(p=>p.id===s.activePlayerId),base=p.factionState.settlements[0];
      return {wood:base.materialStockByType.木材,gold:base.materialStockByType.金,village:s.neutralVillages.find(v=>v.incidentTest).id};
    });
    await page.locator('[data-sheet-event="TEST_SHEET_SUPPLY"]').click();
    assert.equal(await page.locator('#v39-world-contact-actions').isHidden(),true,'selected conversation replaces the action list');
    await page.locator('[data-sheet-choice="1"]').click();
    const accepted=await page.evaluate(()=>{
      const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.incidentTest),p=s.players.find(p=>p.id===s.activePlayerId);
      return {quest:v.questsByPlayerId[s.activePlayerId],wood:p.factionState.settlements[0].materialStockByType.木材};
    });
    assert.equal(accepted.quest.dialogueEventId,'TEST_SHEET_SUPPLY');assert.equal(accepted.wood,initial.wood,'inspection/acceptance does not deliver');
    const stable=await page.evaluate(()=>{
      const actor=document.querySelector('[data-conversation-actor]'),choice=document.querySelector('[data-sheet-choice="1-1"]');
      document.querySelector('.v39-negotiation-conversation details').open=true;actor.focus();
      window.dispatchEvent(new CustomEvent('v39:conversation-updated'));
      return {actor:actor===document.querySelector('[data-conversation-actor]'),choice:choice===document.querySelector('[data-sheet-choice="1-1"]'),
        focused:document.activeElement===actor,open:document.querySelector('.v39-negotiation-conversation details').open};
    });
    assert(stable.actor&&stable.choice&&stable.focused&&stable.open,'unchanged conversation keeps choices, focus and folds');
    await page.locator('[data-sheet-choice="1-1"]').click();
    const read=()=>page.evaluate(()=>{
      const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.incidentTest),p=s.players.find(p=>p.id===s.activePlayerId),base=p.factionState.settlements[0];
      return {wood:base.materialStockByType.木材,gold:base.materialStockByType.金,relation:v.relationsByPlayerId[s.activePlayerId],
        complete:v.questsByPlayerId[s.activePlayerId].completed,villageGold:v.materialStockByType.金};
    });
    const completed=await read();
    assert.equal(completed.wood,initial.wood-10,'sheet cost and delivery charge only once');
    assert.equal(completed.gold,initial.gold+5);assert.equal(completed.villageGold,95);assert.equal(completed.relation,10);assert(completed.complete);
    await page.locator('[data-sheet-event-back]').click();await page.locator('[data-sheet-choice="1-1"]').click();
    assert.deepEqual(await read(),completed,'backtracking does not duplicate payment/reward');
    await page.evaluate(()=>{const save=window.exportV39SaveJson();window.importV39SaveJson(save);});
    await page.evaluate(id=>window.openV39VillageMenu(id),initial.village);
    if(await page.locator('[data-sheet-event-list]').count())await page.locator('[data-sheet-event-list]').click();
    await page.locator('[data-sheet-event="TEST_SHEET_SUPPLY"]').click();
    await page.locator('[data-sheet-event-back]').click();await page.locator('[data-sheet-choice="1-1"]').click();
    assert.deepEqual(await read(),completed,'load/resume does not repeat rewards');
    assert(await page.locator('.v39-conversation-lines .peer').innerText().then(value=>value.includes('謝礼')),'response uses existing conversation stage');
    assert(await page.locator('#v39-village-menu').evaluate(node=>node.scrollWidth<=innerWidth+1),'modal fits viewport');
    await page.screenshot({path:`${out}/delivery-${width}.png`});
    if(process.env.V39_PRODUCTION_CHECK!=='1') {
      // Pure-rule checks share the actual generated fixture and native world state.
      const rules=await page.evaluate(async definitions=>{
        const e=await import('/src/lib/v39-village-dialogue.js');
        const initial=structuredClone(window.__sheetInitial),v=initial.neutralVillages.find(v=>v.incidentTest);
        const def=Object.values(window.getV39ActiveFactionState().eventDialogueById).find(row=>row.eventId==='TEST_SHEET_SUPPLY').definition;
        const open=(s,d=def)=>e.openV39VillageDialogue(s,d,v.id,window.__v39FieldRuntime.mapData);
        const choose=(r,n)=>e.chooseV39VillageDialogue(r.state,r.session.instanceId,n,window.__v39FieldRuntime.mapData);
        const poor=structuredClone(initial);poor.neutralVillages.find(row=>row.id===v.id).materialStockByType.金=0;
        const started=choose(open(poor),'1'),before=JSON.stringify(started.state),failed=choose(started,'1-1');
        const unchanged=!failed.ok&&JSON.stringify(failed.state)===before&&JSON.stringify(started.state)===before;
        const paid=choose(choose(open(initial),'1'),'1-1');
        const receiptId=paid.session.instanceId;
        const expired=choose(open(initial),'1');expired.state.timeline.turnNumber=expired.state.neutralVillages.find(row=>row.id===v.id).questsByPlayerId[initial.activePlayerId].deadlineTurn;
        const expiredResult=choose(expired,'1-1');
        paid.state.timeline.turnNumber+=def.クールダウン;
        const repeated=open(paid.state),repeatAccepted=choose(repeated,'1');
        const outside=structuredClone(initial);outside.players[0].factionState.units.forEach(u=>{u.x=0;u.y=0;});
        const snapshot=window.getV39GameState(),session=Object.values(snapshot.players[0].factionState.eventDialogueById)[0];
        const title=session.definition.名前;session.definition.名前='mutated snapshot';
        const isolated=Object.values(window.getV39GameState().players[0].factionState.eventDialogueById)[0].definition.名前===title;
        const hunt=definitions.find(d=>d.ID==='TEST_SHEET_HUNT');
        const huntStart=choose(open(initial,hunt),'1');
        if(!huntStart.ok)throw new Error(huntStart.reason);
        const early=choose(huntStart,'1-1');
        huntStart.state.enemies=huntStart.state.enemies.map(u=>({...u,hp:0,currentHp:0,state:'死亡'}));
        const huntEnd=choose(huntStart,'1-1');
        const beforeAcceptance=structuredClone(initial);beforeAcceptance.enemies=[];
        const killedBefore=choose(open(beforeAcceptance,hunt),'1');
        const demon=definitions.find(d=>d.ID==='TEST_SHEET_DEMON');
        const restricted=open(initial,demon);
        const denied=choose(restricted,'1');
        const demonState=structuredClone(initial);demonState.activePlayerId=demonState.players.find(p=>p.race==='悪魔').id;
        const demonStart=choose(open(demonState,demon),'1');
        if(!demonStart.ok)throw new Error(demonStart.reason);
        const demonEnd=choose(demonStart,'1-1');
        const demonPlayer=demonEnd.state.players.find(p=>p.id===demonState.activePlayerId);
        return {unchanged,reason:failed.reason,outside:open(outside).ok,isolated,expired:expiredResult.ok,
          newCycle:repeated.session.instanceId!==receiptId&&repeatAccepted.ok,
          early:early.ok,hunt:huntEnd.ok,killedBefore:killedBefore.ok,demonDenied:denied.ok,demon:demonEnd.ok,
          souls:demonPlayer.factionState.settlements[0].foodStockByType.魂,
          villageSouls:demonEnd.state.neutralVillages.find(row=>row.id===v.id).soulStock,
          otherUnchanged:JSON.stringify(demonEnd.state.players[0])===JSON.stringify(demonState.players[0])};
      },definitions);
      assert(rules.unchanged,rules.reason);assert.equal(rules.outside,false);assert(rules.isolated,'snapshot mutation must not alter saved conversation');
      assert.equal(rules.early,false);assert(rules.hunt);assert.equal(rules.killedBefore,false);
      assert.equal(rules.expired,false);assert(rules.newCycle,'cooldown opens a new quest cycle, not the old reward branch');
      assert.equal(rules.demonDenied,false);assert(rules.demon);assert.equal(rules.souls,2);assert.equal(rules.villageSouls,8);assert(rules.otherUnchanged);
    }
    if(width===390) {
      await page.locator('[data-sheet-event-list]').click();await page.locator('[data-sheet-event="TEST_SHEET_HUNT"]').click();
      await page.locator('[data-sheet-choice="1"]').click();
      assert(await page.locator('[data-sheet-choice="1-1"]').isDisabled(),'hunt report requires accepted targets to be defeated');
      await page.evaluate(()=>{const s=window.getV39GameState({includeWorlds:false});window.setV39GameState({enemies:s.enemies.map(u=>({...u,hp:0,currentHp:0,state:'死亡'}))},{reason:'sheet-hunt-targets-defeated'});});
      await page.locator('[data-sheet-choice="1-1"]').click();
      assert(await page.evaluate(()=>{const s=window.getV39GameState();return s.neutralVillages.find(v=>v.incidentTest).questsByPlayerId[s.activePlayerId].completed;}));
      await page.screenshot({path:`${out}/hunt-${width}.png`});
      await page.evaluate(id=>{const s=window.getV39GameState();window.setV39ActivePlayer(s.players.find(p=>p.race==='悪魔').id);window.openV39VillageMenu(id);},initial.village);
      await page.locator('[data-sheet-event="TEST_SHEET_DEMON"]').click();await page.locator('[data-sheet-choice="1"]').click();await page.locator('[data-sheet-choice="1-1"]').click();
      const soul=await page.evaluate(()=>{const s=window.getV39GameState();return {stock:s.players.find(p=>p.id===s.activePlayerId).factionState.settlements[0].foodStockByType.魂,village:s.neutralVillages.find(v=>v.incidentTest).soulStock};});
      assert.equal(soul.stock,2);assert.equal(soul.village,8);
      await page.screenshot({path:`${out}/demon-${width}.png`});
    }
    assert.deepEqual(errors,[]);console.log(`${width}: sheet conversation, native delivery, once-only reward, resume, presence and viewport passed`);
    await page.close();
  }
} finally {await browser.close();}
