import assert from "node:assert/strict";
import { mkdirSync,writeFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/passive-audit";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(600);
    const report=await page.evaluate(()=>{
      const skills=window.getGameDataRows("スキル一覧"),byName=new Map(skills.map(row=>[row.名前,row]));
      const actor={id:"passive-actor",level:10,hp:500,maxHp:500,status:{攻撃:100,命中:100,速度:10},techniques:[]};
      const target={id:"passive-target",level:1,status:{防御:0,速度:100},resistances:{},techniques:[]};
      const attack={名前:"確認攻撃",行動:"A",攻撃手段:"武器",物理:100,判定:"攻撃",射程:10};
      const damage=(passiveName,skill=attack,defender=target)=>window.computeV39AttackDamage({
        attacker:{...actor,techniques:passiveName?[{source:byName.get(passiveName)}]:[]},target:defender,skillRow:skill,random:()=>0.5});
      const base=damage(""),handling=damage("武器の扱い"),offense=damage("武器の攻め"),wrongMethod=damage("武器の扱い",{...attack,攻撃手段:"爪"});
      const fire={...attack,名前:"炎確認",攻撃手段:"魔法",系統:"炎",物理:0,炎:100,判定:""};
      const claw={...attack,名前:"爪",攻撃手段:"爪"};
      const defense=damage("",attack,{...target,techniques:[{source:byName.get("守護精神")}]});
      const magicDefense=damage("",{...fire,判定:"魔力"},{...target,techniques:[{source:byName.get("守護精神")}]});
      const explicit=damage("武器の攻め",{...attack,全威力:100});
      const conditionalActor={...actor,hp:250,techniques:[{source:byName.get("復讐の執念")}]};
      const conditional=window.computeV39AttackDamage({attacker:conditionalActor,target,skillRow:attack,random:()=>0.5});
      const conditionalOff=window.computeV39AttackDamage({attacker:{...conditionalActor,hp:500},target,skillRow:attack,random:()=>0.5});
      const unsupported=window.computeV39AttackDamage({attacker:{...actor,techniques:[{source:{名前:"未知条件試験",行動:"P",条件:"未知の条件",攻撃:999}}]},target,skillRow:attack,random:()=>0.5});
      const negative=window.computeV39AttackDamage({attacker:{...actor,techniques:[{source:{名前:"減算試験",行動:"P",命中:-15}}]},target,skillRow:attack,random:()=>0.5});
      const race=window.getGameDataRows("種族").find(row=>row.className==="ヒューマン").key;
      const acquisition=window.deriveV39CharacterFromRaceClass({race,className:"ファイター",level:10});
      return {skillCount:skills.length,passiveCount:skills.filter(row=>row.行動==="P").length,
        acquisition:acquisition.techniques.filter(row=>row.action==="P").map(row=>row.name),
        supported:{base:base.detail,handling:handling.detail,offense:offense.detail,wrongMethod:wrongMethod.detail},
        additional:{explicit:explicit.detail.power,conditional:conditional.detail.power,conditionalOff:conditionalOff.detail.power,
          unsupported:unsupported.detail,negative:negative.detail.accuracy,magicDefense:magicDefense.detail.defense},
        resolved:{fireBase:damage("",fire).detail.power,fireEnhanced:damage("炎強化",fire).detail.power,
          clawBase:damage("",claw).detail.power,clawEnhanced:damage("猛獣の爪",claw).detail.power,
          defenderBase:base.detail.defense,defenderPassive:defense.detail.defense,
          fireApplied:damage("炎強化",fire).detail.appliedPassiveSkillNames,
          clawApplied:damage("猛獣の爪",claw).detail.appliedPassiveSkillNames}};
    });
    assert.equal(report.skillCount,755);assert.equal(report.passiveCount,222);
    assert.ok(report.acquisition.includes("武器の扱い"));assert.ok(report.acquisition.includes("武器の攻め"));
    assert.ok(report.supported.handling.accuracy>report.supported.base.accuracy);
    assert.ok(report.supported.offense.power>report.supported.base.power);
    assert.deepEqual(report.supported.wrongMethod.appliedPassiveSkillNames,[]);
    assert.equal(report.resolved.fireEnhanced,report.resolved.fireBase+10);
    assert.equal(report.resolved.clawEnhanced,report.resolved.clawBase+10);
    assert.equal(report.resolved.defenderPassive,report.resolved.defenderBase+10);
    assert.equal(report.additional.explicit,report.supported.offense.power);
    assert.equal(report.additional.conditional,report.supported.base.power+20);
    assert.equal(report.additional.conditionalOff,report.supported.base.power);
    assert.equal(report.additional.magicDefense,5);
    assert.equal(report.additional.negative,85);
    assert.equal(report.additional.unsupported.power,report.supported.base.power);
    assert.ok(report.additional.unsupported.passiveDiagnostics.some(entry=>entry.condition==="未知の条件"));
    await page.locator('[data-foot="squad"]').click();
    await page.locator('[data-squad-detail-tab="action"]').click();
    await page.screenshot({path:`${out}/${width}.png`});
    assert.deepEqual(errors,[]);
    writeFileSync(`${out}/${width}.json`,JSON.stringify(report,null,2));
    console.log(JSON.stringify({width,report}));await page.close();
  }
} finally {await browser.close();}
