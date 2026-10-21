import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const rows=JSON.parse(readFileSync('data/source/export/json/性格会話.json','utf8'));
assert.equal(rows.length,18);assert.equal(new Set(rows.map(r=>r.性格)).size,18);
const out='output/web-game/conversation-personality';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [320,390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39VillageIncidentTest();});
  await page.waitForSelector('#v39-hub-tab-talk');await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  const checks=await page.evaluate(()=>{
    const rules=window.getV39NegotiationRules(),rows=rules.getV39ConversationPersonalities(),s=window.getV39GameState();
    const allAssigned=s.players.every(p=>p.factionState.units.every(u=>u.conversationPersonality))&&s.neutralVillages.every(v=>v.conversationPersonality&&v.defenseUnits.every(u=>u.conversationPersonality));
    const choices=rows.map((_,i)=>rules.withV39ConversationPersonality({},()=>i/rows.length).conversationPersonality);
    const fixed=rules.withV39ConversationPersonality({conversationPersonality:'古風'},()=>{throw Error('existing personality rerolled');});
    const missing=rules.selectV39PersonalityLine({conversationPersonality:'尊大'},'存在しない列',{fallback:'{一人称}は{二人称}に話す。'});
    const actor=s.players.find(p=>p.id===s.activePlayerId).factionState.units.find(u=>u.id==='village-visitor-1');actor.conversationPersonality='尊大';
    const village=s.neutralVillages.find(v=>v.incidentTest);village.conversationPersonality='古風';if(village.leader)village.leader.conversationPersonality='古風';
    window.setV39GameState({players:s.players,neutralVillages:s.neutralVillages},{reason:'personality-fixture'});
    return {allAssigned,choices,fixed:fixed.conversationPersonality,missing,gaps:rules.getV39ConversationDataGaps()};
  });
  assert(checks.allAssigned);assert.equal(new Set(checks.choices).size,18);assert.equal(checks.fixed,'古風');assert.equal(checks.missing,'我は貴様に話す。');assert.deepEqual(checks.gaps,[]);
  const peer=page.locator('.v39-conversation-row.peer p span'),self=page.locator('.v39-conversation-row.self p span');
  const first=await peer.innerText();assert(rows.find(r=>r.性格==='古風').交渉開始.split('\n').includes(first));
  assert((await self.innerText()).includes('我'));
  await page.locator('#v39-hub-tab-info').click();await page.locator('#v39-hub-tab-talk').click();
  assert.equal(await peer.innerText(),first,'rerender must retain selected utterance');
  await page.locator('[data-hub-talk=relation]').click();await page.locator('[data-hub-primary]').click();
  const response=await peer.innerText();assert(rows.find(r=>r.性格==='古風').交渉成功.split('\n').some(line=>response.includes(line)),'result uses matching personality lines');
  assert(response.length>rows.find(r=>r.性格==='古風').交渉成功.split('\n')[0].length,'factual action result retained');
  const saved=await page.evaluate(()=>{
    const before=window.getV39GameState(),identities=s=>JSON.stringify({units:s.players.map(p=>p.factionState.units.map(u=>[u.id,u.conversationPersonality])),villages:s.neutralVillages.map(v=>[v.id,v.conversationPersonality])});
    const expected=identities(before),json=window.exportV39SaveJson(0);window.importV39SaveJson(json);
    return {expected,actual:identities(window.getV39GameState())};
  });
  assert.equal(saved.actual,saved.expected,'native save/load preserves personalities');
  await page.screenshot({path:`${out}/personality-${width}.png`});
  assert.deepEqual(errors,[]);console.log(`${width}: 18 personalities, pronouns, sheet lines, stable render, real action and native save/load passed`);await page.close();
}}finally{await browser.close();}
