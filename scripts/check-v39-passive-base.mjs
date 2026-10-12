import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const out="output/web-game/passive-base";mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
 for(const width of [1100,390]) {
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
  await page.getByRole("button",{name:"探索開始",exact:true}).click();
  const report=await page.evaluate(()=>{
   const skills=window.getGameDataRows("スキル一覧"),classes=window.getGameDataRows("クラス");
   const fighter=classes.find(r=>r.名前==="ファイター"),old=fighter.Skill1;
   const fixture=name=>{fighter.Skill1=name;return window.applyV39DerivedCharacterData({id:"passive-base",race:"只人",className:"ファイター",level:1,equipment:[]});};
   const names=["守護精神","精度","野生感覚","光の加護","獣性","逃げ足"];
   const result={};
   try {
    for(const name of names){
     const row=skills.find(r=>r.名前===name),backup={...row};
     const unit=fixture(name);
     for(const [key,value] of Object.entries(row)) if(typeof value==="number"&&key!=="Lv") row[key]=0;
     const base=fixture(name);Object.assign(row,backup);
     const repeated=window.applyV39DerivedCharacterData(unit);
     result[name]={status:unit.status,baseStatus:base.status,skills:unit.skillLevels,baseSkills:base.skillLevels,
       res:unit.resistances,baseRes:base.resistances,body:unit.bodyWeaponLevels,baseBody:base.bodyWeaponLevels,
       repeated:JSON.stringify([unit.status,unit.skillLevels,unit.resistances,unit.bodyWeaponLevels])===JSON.stringify([repeated.status,repeated.skillLevels,repeated.resistances,repeated.bodyWeaponLevels])};
     const damage=window.computeV39AttackDamage({attacker:unit,target:{id:"target",status:{防御:0,速度:100}},
       skillRow:{名前:"通常",行動:"A",攻撃手段:"武器",物理:100,判定:"攻撃"},random:()=>0.5});
     if(name==="精度") result[name].combatAccuracy=damage.detail.accuracy;
    }
   }finally{fighter.Skill1=old;}
   const faction=window.getV39ActiveFactionState(),unit=window.applyV39DerivedCharacterData({...faction.units[0],race:"只人",className:"ガーディアン",level:3});
   unit.hp=unit.maxHp;unit.currentHp=unit.maxHp;
   window.updateV39ActiveFactionState({units:[unit],squads:[],selectedUnitId:unit.id});
   window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:unit.id}}));
   result.display=window.getV39ActiveFactionState().units[0].status;
   return result;
  });
  for(const name of ["守護精神","精度","野生感覚","光の加護","獣性","逃げ足"]) assert.ok(report[name].repeated,name);
  assert.equal(report.守護精神.status.防御-report.守護精神.baseStatus.防御,10);
  assert.equal(report.守護精神.status.精神-report.守護精神.baseStatus.精神,5);
  assert.equal(report.精度.status.命中-report.精度.baseStatus.命中,10);
  assert.equal(report.精度.combatAccuracy,report.精度.status.命中);
  assert.equal(report.野生感覚.skills.索敵-report.野生感覚.baseSkills.索敵,15);
  assert.equal(report.光の加護.res.光耐性-report.光の加護.baseRes.光耐性,15);
  assert.equal(report.獣性.body.爪-report.獣性.baseBody.爪,1);
  assert.equal(report.逃げ足.status.速度-report.逃げ足.baseStatus.速度,10);
  // 速度+10による通常の移動力増加と、移動速度+10の直接加算は別。
  assert.equal(report.逃げ足.status.移動-report.逃げ足.baseStatus.移動,11);
  await page.locator('[data-foot="squad"]').click();await page.locator('[data-squad-detail-tab="status"]').click();
  assert.equal(Number(await page.locator("#detailDef").textContent()),report.display.防御);
  assert.equal(Number(await page.locator("#detailMdef").textContent()),report.display.精神);
  await page.screenshot({path:`${out}/${width}.png`});assert.deepEqual(errors,[]);
  console.log(`${width}: permanent status/skills/resistance/body/movement, aliases, no double accumulation and UI passed`);
  await page.close();
 }
} finally {await browser.close();}
