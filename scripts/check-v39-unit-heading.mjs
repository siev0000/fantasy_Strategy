import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch(),output='output/web-game/unit-heading';mkdirSync(output,{recursive:true});
async function selectFieldUnit(page,id){
 await page.evaluate(id=>{window.updateV39ActiveFactionState({selectedUnitId:id});window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();},id);
 await page.locator(`[data-v39-unit-id="${id}"]`).click();
 await page.locator('[data-squad-detail-tab="status"]').click();
}
try{
 for(const width of [320,390,540,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();await window.startV39RitualTest(3);});
  await page.locator('[data-summon-option="アークフレイムソルジャー"]').click();
  await page.locator('[data-summon-confirm]').click();
  await page.evaluate(()=>{const [key]=window.getV39FacilitySummonSelection().candidateTileKeys;const [x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));});
  await page.locator('[data-facility-placement-confirm]').click();
  const facility=await page.evaluate(()=>{const f=window.getV39ActiveFactionState();return f.units.find(u=>u.summon?.kind==='facility');});
  assert.equal(facility.name,'アークフレイムソルジャー');assert.equal(facility.level,30);
  assert.equal(facility.summon.facilityName,'火の儀式場III');assert.equal(facility.summon.settlementName,'検証拠点');
  // Older saves still carry the generated suffix and no source-name snapshot.
  await page.evaluate(id=>{const f=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:f.units.map(u=>u.id===id?{...u,name:u.name+'（施設召喚）',summon:{...u.summon,facilityName:undefined,settlementName:undefined}}:u)});},facility.id);
  await selectFieldUnit(page,facility.id);
  const card=page.locator(`[data-v39-unit-id="${facility.id}"]`);
  assert.equal(await card.locator('.squad-name').textContent(),'アークフレイムソルジャー');
  const metrics=await card.locator('.squad-name').evaluate(el=>{const s=getComputedStyle(el);return {font:parseFloat(s.fontSize),height:el.clientHeight,line:parseFloat(s.lineHeight),clamp:s.webkitLineClamp,title:el.title};});
  const headingFont=await page.locator('#detailUnitHeading .v39-unit-heading-name').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert(metrics.font>0&&metrics.font<=headingFont+0.1,'name must shrink only when needed');assert.equal(metrics.clamp,'none');assert(metrics.height<=headingFont*2.3+1);
  assert.equal(metrics.title,'アークフレイムソルジャー');
  const heights=await page.locator('#squadMemberList .squad-card:not(.selected)').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().height));
  assert(Math.max(...heights)-Math.min(...heights)<=2,'collapsed card heights not uniform');
  assert((await card.boundingBox()).height>Math.max(...heights),'selected card must expand');
  assert.equal(await page.locator('#detailUnitHeading .v39-unit-heading-name').textContent(),'アークフレイムソルジャー');
  assert.match(await page.locator('#detailUnitHeading').textContent(),/召喚元：火の儀式場III／検証拠点/);
  assert.doesNotMatch(await page.locator('#detailUnitHeading').textContent(),/Lv30/);
  assert.match(await page.locator('#detailAbilitySections summary').first().textContent(),/ステータス Lv30/);
  assert.match(await page.locator('#detailAbilitySections .v39-unit-lineage').textContent(),/種族：.*クラス：/);
  await page.screenshot({path:`${output}/field-${width}.png`});
  await page.evaluate(()=>window.openV39CharacterModal());
  const row=page.locator(`[data-v39-character-row="${facility.id}"]`);await row.click();
  assert(await row.locator('.squad-name').evaluate(el=>{
    const style=getComputedStyle(el);return parseFloat(style.fontSize)>0&&style.webkitLineClamp==='none';
  }),'modal uses the same fitting rule with its own available width');
  assert.match(await page.locator('#characterModal .v39-unit-heading').textContent(),/召喚元：火の儀式場III／検証拠点/);
  assert.doesNotMatch(await page.locator('#characterModal .v39-unit-heading').textContent(),/Lv30/);
  await page.screenshot({path:`${output}/modal-${width}.png`});
  await page.keyboard.press('Escape');
  await selectFieldUnit(page,'expedition-test-king');
  assert.equal(await page.locator('#detailUnitHeading .v39-unit-heading-origin').count(),0);
  await page.locator('[data-squad-detail-tab="action"]').click();
  await page.locator('[data-v39-summon-open="expedition-test-king"]').click();
  await page.locator('[data-summon-option="TEST_表召喚エレメンタル / フレイムエレメンタル"]').click();
  await page.locator('[data-summon-confirm]').click();
  const skill=await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.summon?.casterId==='expedition-test-king'));
  assert(skill.summon.casterName);
  await selectFieldUnit(page,skill.id);
  assert.equal(await page.locator('#detailUnitHeading .v39-unit-heading-origin').textContent(),`召喚者：${skill.summon.casterName}`);
  await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
  await selectFieldUnit(page,skill.id);
  assert.equal(await page.locator('#detailUnitHeading .v39-unit-heading-origin').textContent(),`召喚者：${skill.summon.casterName}`);
  await page.evaluate(({facility,casterId})=>{const f=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:f.units.filter(u=>u.id!==casterId).map(u=>u.id===facility.id?{...u,summon:facility.summon}:u),settlements:f.settlements.map(base=>({...base,buildings:[],tileFacilityMap:{}}))});},{facility,casterId:skill.summon.casterId});
  await selectFieldUnit(page,skill.id);
  assert.equal(await page.locator('#detailUnitHeading .v39-unit-heading-origin').textContent(),`召喚者：${skill.summon.casterName}`);
  await selectFieldUnit(page,facility.id);
  assert.match(await page.locator('#detailUnitHeading .v39-unit-heading-origin').textContent(),/火の儀式場III／検証拠点/);
  await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
  await selectFieldUnit(page,facility.id);
  assert.match(await page.locator('#detailUnitHeading .v39-unit-heading-origin').textContent(),/火の儀式場III／検証拠点/);
  assert.deepEqual(errors,[]);console.log(`${width}px: two-line readable names, uniform cards, shared heading, source fallback, status Lv, save/load OK`);await page.close();
 }
}finally{await browser.close();}
