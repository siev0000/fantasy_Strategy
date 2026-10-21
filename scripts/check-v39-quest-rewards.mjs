import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/quest-rewards';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [320,390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  async function start(){await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39VillageIncidentTest();});await page.waitForFunction(()=>!window.isV39MapInputLocked?.());await page.locator('#v39-hub-tab-quests').click();}
  await start();
  const core=await page.evaluate(()=>{
    const fixture=window.getV39GameState(),rules=window.getV39QuestRewardRules(),world=window.getV39WorldPopulationRules(),map=window.__v39FieldRuntime.mapData;
    const own=s=>s.players.find(p=>p.id===s.activePlayerId),village=s=>s.neutralVillages.find(v=>v.incidentTest),bank=s=>own(s).factionState.settlements.find(b=>b.settlementId===own(s).factionState.selectedSettlementId);
    const check=(v,m)=>{if(!v)throw Error(m);},results=[];
    for(const kind of ['gold','wood','population','refusal','shortage','duplicate','pending','payment-shortage','expired','isolated','partial']){
      let s=structuredClone(fixture),v=village(s),p=own(s),actor=p.factionState.units[0];
      const q=world.listV39NeutralVillageQuests(s,p.id,v.id,map).find(q=>q.eventId==='TPL_VILLAGE_SUPPLY');
      const reward=kind==='wood'?{kind:'resource',name:'木材',amount:2}:kind==='population'?{kind:'population',name:'只人',amount:1}:{kind:'resource',name:'金',amount:5};
      if(kind==='shortage')v.materialStockByType.金=0;
      const request={...reward,mode:'normal',unitId:actor.id};
      if(kind==='wood')v.materialStockByType.木材=100;
      const attempted=rules.requestV39QuestRewardChange(s,p.id,v.id,q,request,()=>kind==='refusal'?1:0);
      check(attempted.ok,'request valid');check(own(attempted.state).factionState.units[0].ap===actor.ap-20,'AP20 on request');
      if(['refusal','shortage'].includes(kind)){check(!attempted.accepted,'request refused');check(!village(attempted.state).questRewardOffersByPlayerId?.[p.id]?.[q.eventId],'no forged offer');results.push(kind);continue;}
      check(attempted.accepted,`${kind}: request accepted`);
      check(bank(attempted.state).materialStockByType.金===bank(s).materialStockByType.金,'no early payment');
      if(kind==='duplicate'){const retry=rules.requestV39QuestRewardChange(attempted.state,p.id,v.id,q,request,()=>0);check(!retry.ok&&retry.state===attempted.state,'same-turn retry blocked without spending AP');results.push(kind);continue;}
      s=attempted.state;
      if(kind==='expired')s.timeline.turnNumber+=5;
      if(kind==='isolated'){
        const wrong=world.listV39NeutralVillageQuests(s,p.id,v.id,map).find(q=>q.eventId==='TPL_VILLAGE_HUNT');
        const accepted=world.acceptV39NeutralVillageQuest(s,p.id,v.id,map,wrong.eventId);check(accepted.ok&&!accepted.quest.rewardTerms,'offer cannot attach to another quest');results.push(kind);continue;
      }
      let accepted=world.acceptV39NeutralVillageQuest(s,p.id,v.id,map,q.eventId);check(accepted.ok,'accept quest');
      if(kind==='expired'){check(!accepted.quest.rewardTerms,'expired offer ignored');results.push(kind);continue;}
      check(JSON.stringify(accepted.quest.rewardTerms)===JSON.stringify(reward),'reward frozen on accept');
      s=JSON.parse(JSON.stringify(accepted.state));
      if(kind==='pending'){const retry=rules.requestV39QuestRewardChange(s,p.id,v.id,q,{...request,amount:6},()=>0);check(!retry.ok&&retry.state===s,'accepted reward cannot change');results.push(kind);continue;}
      if(kind==='payment-shortage')village(s).materialStockByType.金=0;
      if(kind==='partial')bank(s).foodStockByType.穀物=5;
      const beforeFood=bank(s).foodStockByType.穀物,beforeGold=bank(s).materialStockByType.金,beforeWood=bank(s).materialStockByType.木材,beforePop=bank(s).population,vPop=village(s).population,vGold=village(s).materialStockByType.金,vWood=village(s).materialStockByType.木材;
      const completed=world.completeV39NeutralVillageQuest(s,p.id,v.id);
      if(kind==='partial'){
        check(completed.ok&&!completed.village.questsByPlayerId[p.id].completed,'partial delivery remains pending');check(bank(completed.state).materialStockByType.金===beforeGold,'no early partial reward');
        bank(completed.state).foodStockByType.穀物=q.required-5;const final=world.completeV39NeutralVillageQuest(completed.state,p.id,v.id);
        check(final.ok&&final.village.questsByPlayerId[p.id].completed&&bank(final.state).materialStockByType.金===beforeGold+5,'partial delivery rewards only on final completion');results.push(kind);continue;
      }
      if(kind==='payment-shortage'){check(!completed.ok&&completed.state===s,'payment failure rolls back delivery');check(bank(s).foodStockByType.穀物===beforeFood,'no delivery lost');results.push(kind);continue;}
      check(completed.ok&&completed.village.questsByPlayerId[p.id].completed,'complete');check(bank(completed.state).foodStockByType.穀物===beforeFood-q.required,'delivery paid once');
      if(kind==='gold')check(bank(completed.state).materialStockByType.金===beforeGold+5&&village(completed.state).materialStockByType.金===vGold-5,'gold transferred');
      if(kind==='wood')check(bank(completed.state).materialStockByType.木材===beforeWood+2&&village(completed.state).materialStockByType.木材===vWood-2,'wood transferred');
      if(kind==='population')check(bank(completed.state).population===beforePop+1&&village(completed.state).population===vPop-1,'ordinary population transferred, no extra category');
      check(!world.completeV39NeutralVillageQuest(completed.state,p.id,v.id).ok,'duplicate reward blocked');results.push(kind);
    }
    let s=structuredClone(fixture),v=village(s),p=own(s),q=world.listV39NeutralVillageQuests(s,p.id,v.id,map)[0];
    const intimidated=rules.requestV39QuestRewardChange(s,p.id,v.id,q,{kind:'resource',name:'金',amount:5,mode:'intimidation',unitId:p.factionState.units[0].id},()=>0);
    check(intimidated.accepted&&village(intimidated.state).relationsByPlayerId[p.id]===-5,'intimidation changes relation');
    return results;
  });assert.equal(core.length,11);
  const multi=await page.evaluate(()=>{
    const fixture=window.getV39GameState(),rules=window.getV39QuestRewardRules(),world=window.getV39WorldPopulationRules(),map=window.__v39FieldRuntime.mapData;
    const own=s=>s.players.find(p=>p.id===s.activePlayerId),village=s=>s.neutralVillages.find(v=>v.incidentTest),bank=s=>own(s).factionState.settlements.find(b=>b.settlementId===own(s).factionState.selectedSettlementId);
    const check=(value,message)=>{if(!value)throw Error(message);},passed=[];
    for(const scenario of ['mixed','payment-shortage','population-total','reordered','duplicate-rows','invalid','empty','total-value']){
      let s=structuredClone(fixture),v=village(s),p=own(s),actor=p.factionState.units[0];
      v.materialStockByType.木材=100;
      const q=world.listV39NeutralVillageQuests(s,p.id,v.id,map).find(q=>q.eventId==='TPL_VILLAGE_SUPPLY');
      let rewards=[{kind:'resource',name:'金',amount:5},{kind:'resource',name:'木材',amount:2},{kind:'population',name:'只人',amount:1}];
      if(scenario==='population-total'){v.population=2;v.populationByRace={只人:1,ゴブリン:1};rewards=[{kind:'population',name:'只人',amount:1},{kind:'population',name:'ゴブリン',amount:1}];}
      if(scenario==='duplicate-rows')rewards=[{kind:'resource',name:'金',amount:2},{kind:'resource',name:'金',amount:3}];
      if(scenario==='invalid')rewards.push({kind:'resource',name:'木材',amount:0});
      if(scenario==='empty')rewards=[];
      if(scenario==='total-value')rewards=[{kind:'resource',name:'金',amount:8},{kind:'resource',name:'木材',amount:8}];
      const before=JSON.stringify(s),request={rewards,mode:'normal',unitId:actor.id};
      const result=rules.requestV39QuestRewardChange(s,p.id,v.id,q,request,()=>scenario==='total-value'?0.68:0);
      check(JSON.stringify(s)===before,'input state remains immutable');
      if(['invalid','empty'].includes(scenario)){check(!result.ok&&result.state===s,'invalid basket costs no AP');passed.push(scenario);continue;}
      check(result.ok&&own(result.state).factionState.units[0].ap===actor.ap-20,'whole basket costs AP20 once');
      if(['population-total','total-value'].includes(scenario)){check(!result.accepted,'aggregate population minimum and aggregate valuation');passed.push(scenario);continue;}
      check(result.accepted,'basket accepted');
      if(scenario==='reordered'){const retry=rules.requestV39QuestRewardChange(result.state,p.id,v.id,q,{...request,rewards:[...rewards].reverse()},()=>0);check(!retry.ok&&retry.state===result.state,'reordering does not bypass retry guard');passed.push(scenario);continue;}
      const accepted=world.acceptV39NeutralVillageQuest(result.state,p.id,v.id,map,q.eventId);check(accepted.ok,'basket reward quest accepted');
      s=JSON.parse(JSON.stringify(accepted.state));
      const terms=rules.getV39QuestRewardItems(village(s).questsByPlayerId[p.id]);
      check(terms.length===(scenario==='duplicate-rows'?1:3),'all terms frozen, duplicate rows merged');
      if(scenario==='duplicate-rows')check(terms[0].amount===5,'merged amount');
      if(scenario==='payment-shortage')village(s).materialStockByType.木材=0;
      const prior=JSON.stringify(s),stock=structuredClone(bank(s)),pop=village(s).population;
      const paid=world.completeV39NeutralVillageQuest(s,p.id,v.id);
      if(scenario==='payment-shortage'){check(!paid.ok&&paid.state===s&&JSON.stringify(s)===prior,'one missing reward rolls back all rewards, delivery and completion');passed.push(scenario);continue;}
      check(paid.ok&&village(paid.state).questsByPlayerId[p.id].completed,'all rewards paid');
      check(bank(paid.state).materialStockByType.金===stock.materialStockByType.金+5,'gold paid once');
      if(scenario==='mixed'){
        check(bank(paid.state).materialStockByType.木材===stock.materialStockByType.木材+2&&village(paid.state).materialStockByType.木材===98,'wood transferred');
        check(bank(paid.state).population===stock.population+1&&village(paid.state).population===pop-1,'population transferred');
      }
      check(!world.completeV39NeutralVillageQuest(paid.state,p.id,v.id).ok,'basket cannot be paid twice');passed.push(scenario);
    }
    return passed;
  });assert.equal(multi.length,8);
  for(const side of ['visitor','demon'])for(const eventId of ['TPL_VILLAGE_SUPPLY']){
    await start();
    if(side==='demon')await page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.incidentTest),id=v.sacrificeContract.playerId;window.setV39GameState({activePlayerId:id,timeline:{...s.timeline,activeTurnPlayerId:id}},{reason:'test-reward-side'});});
    await page.evaluate(()=>{const s=window.getV39GameState();const v=s.neutralVillages.find(v=>v.incidentTest);v.materialStockByType.木材=100;window.setV39GameState(s,{reason:'multi-reward-test-stock'});});
    await page.locator('#v39-hub-tab-trade').click();
    await page.locator('#v39-hub-trade [data-trade-add-side="1"]').click();
    const picker=page.locator('.v39-trade-picker-backdrop');
    const layout=()=>picker.locator('.v39-trade-resource-picker').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,top:el.getBoundingClientRect().top,footer:el.querySelector('footer').getBoundingClientRect().top}));
    const tradeLayout=await layout();
    await page.screenshot({path:out+'/actual-trade-picker-'+side+'-'+width+'.png'});
    await page.keyboard.press('Escape');
    await page.locator('#v39-hub-tab-quests').click();
    const baseline=await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),v=s.neutralVillages.find(v=>v.incidentTest);return {own:p.factionState.settlements[0].population,village:v.population,ap:p.factionState.units[0].ap,gold:p.factionState.settlements[0].materialStockByType.金,wood:p.factionState.settlements[0].materialStockByType.木材,vGold:v.materialStockByType.金};});
    await page.locator('[data-hub-quest="'+eventId+'"]').check();
    const editor=page.locator('[data-hub-reward-editor]');
    assert(await editor.isHidden(),'checkboxes must not open reward UI');
    await page.locator('[data-hub-reward-negotiate="'+eventId+'"]').click();
    assert(await page.locator('[data-hub-quests]').isHidden());
    assert.equal(await editor.locator('.v39-trade-baskets > .v39-trade-basket').count(),2,'current two-column trade layout');
    await editor.locator('[data-trade-item-select]').click();
    await editor.locator('[data-trade-item-remove]').click();
    assert(await page.locator('[data-hub-primary]').isDisabled());
    await editor.locator('[data-trade-add-side]').click();
    assert.deepEqual(await layout(),tradeLayout,'reward uses the real current full-screen trade picker layout');
    assert(await page.locator('#v39-village-menu > section').evaluate(el=>el.inert),'parent hub is locked while selecting');
    await picker.locator('[data-trade-resource-filter=basic]').click();
    assert.equal(await picker.locator('[data-trade-resource-add]').count(),3);
    await picker.locator('[data-trade-resource-add="木材"]').click();
    assert(await picker.isVisible(),'selection stays open until Done, same as trade');
    await picker.locator('[data-trade-picker-close]').last().click();
    await editor.locator('input[type=number]').fill('25');
    assert.equal(await editor.locator('input[type=range]').inputValue(),'25');
    await editor.locator('[data-trade-add-side]').click();
    await picker.locator('[data-trade-resource-filter=population]').click();
    assert.deepEqual(await layout(),tradeLayout,'population tab does not shrink the dialog');
    const race=await picker.locator('[data-trade-resource-add]').first().getAttribute('data-trade-resource-add');
    await picker.locator('[data-trade-resource-search]').fill(race);
    await picker.locator('[data-trade-resource-add]').first().click();
    await picker.locator('[data-trade-item-step="1"]').click();
    assert.equal(await picker.locator('[data-trade-resource-add] b').first().innerText(),'2');
    await page.screenshot({path:out+'/reward-picker-'+side+'-'+width+'.png'});
    await picker.locator('[data-trade-picker-close]').last().click();
    assert.equal(await editor.locator('input[type=number][data-trade-resource="'+race+'"]').inputValue(),'2');
    assert.equal(await editor.locator('input[type=number][data-trade-resource="木材"]').inputValue(),'25','adding population keeps wood');
    await editor.locator('input[type=number][data-trade-resource="'+race+'"]').fill('1');
    await editor.locator('[data-trade-add-side]').click();
    await picker.locator('[data-trade-resource-search]').fill('');
    await picker.locator('[data-trade-resource-filter=all]').click();
    await picker.locator('[data-trade-resource-add="金"]').click();
    await picker.locator('[data-trade-picker-close]').last().click();
    await editor.locator('input[type=number][data-trade-resource="金"]').fill('5');
    assert.equal(await editor.locator('[data-trade-basket="1"] [data-trade-item]').count(),3);
    await editor.locator('[data-trade-item-select="木材"]').click();
    await editor.locator('[data-trade-item-step="1"]').click();
    assert.equal(await editor.locator('input[type=number][data-trade-resource="木材"]').inputValue(),'26');
    assert.equal(await editor.locator('input[type=number][data-trade-resource="金"]').inputValue(),'5','editing wood must not change gold');
    await editor.locator('input[type=number][data-trade-resource="木材"]').fill('25');
    await page.screenshot({path:out+'/reward-editor-'+side+'-'+width+'.png'});
    await editor.locator('[data-trade-add-side]').click();
    await page.keyboard.press('Escape');
    assert(await editor.isVisible(),'Escape dismisses only the picker');
    assert(!await page.locator('#v39-village-menu > section').evaluate(el=>el.inert),'background unlocked');
    await editor.locator('[data-hub-reward-back]').click();
    assert(await page.locator('[data-hub-quest="'+eventId+'"]').isChecked(),'back preserves batch selection');
    await page.locator('[data-hub-reward-negotiate="'+eventId+'"]').click();
    assert.equal(await editor.locator('input[type=number][data-trade-resource="'+race+'"]').inputValue(),'1');
    assert.equal(await editor.locator('input[type=number][data-trade-resource="金"]').inputValue(),'5');
    assert.equal(await editor.locator('input[type=number][data-trade-resource="木材"]').inputValue(),'25');
    await page.evaluate(()=>{window.__rewardRandom=Math.random;Math.random=()=>0;});
    await page.locator('[data-hub-primary]').click();await page.evaluate(()=>{Math.random=window.__rewardRandom;});
    assert.match(await page.locator('[data-quest-entry="'+eventId+'"] [data-quest-reward-summary]').innerText(),/合意済み/);
    await page.locator('[data-hub-primary]').click();
    await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
    await page.locator('[data-hub-quest="'+eventId+'"]').check();await page.locator('[data-hub-primary]').click();
    const result=await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),v=s.neutralVillages.find(v=>v.incidentTest);return {own:p.factionState.settlements[0].population,village:v.population,ap:p.factionState.units[0].ap,quest:v.questsByPlayerId[p.id],gold:p.factionState.settlements[0].materialStockByType.金,wood:p.factionState.settlements[0].materialStockByType.木材,claims:v.soulClaimsByPlayerId?.[p.id]||0};});
    assert.equal(result.own,baseline.own+1);assert.equal(result.village,baseline.village-1);assert.equal(result.ap,baseline.ap-20);assert.equal(result.claims,0);
    assert.equal(result.gold,baseline.gold+5);assert.equal(result.wood,baseline.wood+25);
    assert(result.quest.completed&&Array.isArray(result.quest.rewardTerms)&&result.quest.rewardTerms.length===3);
    assert(await page.locator('[data-hub-primary]').isDisabled());
    await page.screenshot({path:out+'/population-'+side+'-'+eventId+'-'+width+'.png'});
  }
  assert.deepEqual(errors,[]);console.log(width+': 11 legacy + 8 multi-reward cases and three-item negotiation/payment/save for both players and village-plan quest source passed');await page.close();
}}finally{await browser.close();}
