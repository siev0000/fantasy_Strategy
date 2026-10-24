import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const names=['効果','説明','範囲','体制','外交姿勢','組織','スキル一覧'];
const load=(directory,name)=>JSON.parse(readFileSync(`${directory}/${name}.json`,'utf8'));
const tables=Object.fromEntries(names.map(name=>[name,load('output/sheet-merge-final-data',name)]));
for(const name of names)assert.deepEqual(tables[name],load('output/sheet-merge-baseline',name),`${name}: source parity`);
mkdirSync('output/web-game/sheet-merge',{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.startV39CallTest==='function');
  const result=await page.evaluate(async tables=>{
    const registry=await import('/src/lib/game-data-registry.js');
    const policy=await import('/src/lib/v39-diplomacy-rules.js');
    const {createPlayerFactionState}=await import('/src/lib/player-state.js');
    const failures=[],ok=(value,label)=>{if(!value)failures.push(label);};
    for(const name of ['効果','説明'])ok(JSON.stringify(registry.getGameDataRows(name))===JSON.stringify(tables[name]),`${name}: runtime unchanged`);
    const selections={};
    for(const name of ['体制','外交姿勢','組織']) {
      const old=registry.getGameDataRows(name);
      const keyFields=name==='組織'?['項目名']:['項目カテゴリ','項目名'];
      const valid=old.filter(row=>keyFields.every(key=>row[key]));
      const oldIds=valid.map(row=>registry.getGameDataRecordId(name,row));
      const nextIds=tables[name].map(row=>registry.getGameDataRecordId(name,row));
      ok(JSON.stringify(oldIds)===JSON.stringify(nextIds),`${name}: saved IDs changed`);
      selections[name]=oldIds[0];
    }
    const saved={governmentSelections:{信仰:selections.体制},diplomacyStanceId:selections.外交姿勢,organizationIds:[selections.組織]};
    const before=policy.calculateV39NationPolicyModifiers(saved),backups={};
    try {
      for(const name of ['体制','外交姿勢','組織']) {
        const target=registry.getGameDataRows(name);backups[name]=target.slice();
        target.splice(0,target.length,...tables[name]);
      }
      ok(JSON.stringify(before)===JSON.stringify(policy.calculateV39NationPolicyModifiers(saved)),'policy modifiers changed');
      const restored=createPlayerFactionState({nationPolicy:JSON.parse(JSON.stringify(saved))});
      ok(restored.nationPolicy.governmentSelections.信仰===saved.governmentSelections.信仰,'government selection restore');
      ok(restored.nationPolicy.diplomacyStanceId===saved.diplomacyStanceId,'stance selection restore');
      ok(JSON.stringify(restored.nationPolicy.organizationIds)===JSON.stringify(saved.organizationIds),'organization selection restore');
    } finally {
      for(const [name,rows] of Object.entries(backups)){const target=registry.getGameDataRows(name);target.splice(0,target.length,...rows);}
    }
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();
    return {failures,modifiers:before};
  },tables);
  assert.deepEqual(result.failures,[]);
  await page.screenshot({path:'output/web-game/sheet-merge/game.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result,sourceTables:names.length,savedIds:'preserved'}));
} finally {await browser.close();}
