import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

// This experiment only changes synthetic weapon inputs, never the live combat formula.
const settings={levels:[1,5,10,15,20,35,50],weaponPower:50,attack:100,defense:100,targetLevel:35,targetHp:300,anchorLevel:35,growthBase:75,offensiveGrowthBase:90,growthDivisor:10,initialRaceBonusLevels:5};
const browser=await chromium.launch();
let report;
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 report=await page.evaluate(async settings=>{
  const {buildWeaponAttackRow,computeAttackDamage}=await import('/src/lib/v39-combat-engine.js');
  const {V39_COMBAT_BALANCE}=await import('/src/lib/v39-gameplay-balance.js');
  const {buildCharacterStatusFromRules}=await import('/src/composables/unitStatusUtils.js');
  const {STATUS_GROWTH_FIELDS}=await import('/src/constants/unitCommon.js');
  const {createV39EquipmentEntry,buildV39EquipmentResistanceBonus,V39_EQUIPMENT_RARITIES}=await import('/src/lib/v39-equipment-rules.js');
  const common=V39_EQUIPMENT_RARITIES.find(r=>r.key==='common') || V39_EQUIPMENT_RARITIES[0];
  const armorSets={'None':[],'Clothes':['服'],'Armor':['鎧'],'Full armor':['兜','鎧','重靴']};
  const armorDefinitions=Object.fromEntries(Object.entries(armorSets).map(([name,names])=>{
   const items=names.map(n=>createV39EquipmentEntry(n,common.key));
   if(items.some(item=>!item))throw Error(`Missing armor: ${names}`);
   return [name,{items,resistance:buildV39EquipmentResistanceBonus(items),quality:common.label}];
  }));
  const growthRow=Object.fromEntries(STATUS_GROWTH_FIELDS.map(key=>[key,['攻撃','魔力'].includes(key)?settings.offensiveGrowthBase:settings.growthBase]));
  const growingStatus=level=>buildCharacterStatusFromRules({raceRow:growthRow,classRow:growthRow,level,raceLevels:0,classLevels:level,isHumanRace:true,statusGrowthFields:STATUS_GROWTH_FIELDS,statusGrowthDivisor:settings.growthDivisor,raceLevelBaseOffset:settings.initialRaceBonusLevels}).status;
  const unit=(id,level,status)=>({id,level,hp:settings.targetHp,maxHp:settings.targetHp,worldId:'surface',techniques:[],equipment:[],status:{攻撃:0,防御:0,魔力:0,精神:0,命中:100,速度:100,耐性貫通:0,...status}});
  function calculate(level,attack,defense,resistance=0,scaled=false,growing=false,armorName='None',weaponQuality=null) {
   const multiplier=scaled ? 1+(level-1)/(settings.anchorLevel-1) : 1;
   const status=growing ? growingStatus(level) : null;
   if(status){attack=status.攻撃;defense=status.防御;}
   const targetHp=status?.HP ?? settings.targetHp,targetLevel=growing?level:settings.targetLevel;
   const attacker=unit('experiment-attacker',level,{...status,攻撃:attack});
   const target=unit('experiment-target',targetLevel,{...status,防御:defense,物理耐性:resistance});
   const armor=armorDefinitions[armorName];
   target.equipment=armor.items;
   target.status.物理耐性+=armor.resistance.物理耐性 || 0;
   for(const item of armor.items)for(const [key,value] of Object.entries(item.statusBonus || {}))if(Object.hasOwn(target.status,key))target.status[key]+=value;
   attacker.hp=attacker.maxHp=targetHp;target.hp=target.maxHp=targetHp;
   const qualityWeapon=weaponQuality?createV39EquipmentEntry({装備名:'Experimental weapon',装備箇所:'武器',威力:settings.weaponPower,攻撃AP:25},weaponQuality,'武器1'):null;
   const row=buildWeaponAttackRow({name:'Experimental weapon',slot:'武器1',power:(qualityWeapon?.power??settings.weaponPower)*multiplier,attackAp:25});
   function hit(roll) {let count=0;return computeAttackDamage({attacker,target,skillRow:row,random:()=>count++%2===0?0:roll});}
   const low=hit(0),middle=hit(0.5),high=hit(1);
   return {level,targetLevel,hp:targetHp,status,attack,defense:target.status.防御,resistance:middle.detail.resistance,armor:armorName,weaponQuality:qualityWeapon?.qualityLabel??common.label,weaponMultiplier:multiplier,inputWeaponPower:row.物理,power:middle.detail.power,
    min:low.total,middle:middle.total,max:high.total,hpPercent:middle.total/targetHp*100,hitsToKill:middle.total>0?Math.ceil(targetHp/middle.total):null,
    hitRate:middle.detail.hitRate,fixedReduction:middle.detail.levelReduction,damageMultiplier:middle.detail.damageMultiplier,
    passiveCount:middle.detail.appliedPassiveSkillNames.length,attackCount:middle.detail.attackCount};
  }
  return {settings,damageMultiplier:V39_COMBAT_BALANCE.damageMultiplier,armorDefinitions,
   liveFormulaArmor:settings.levels.flatMap(l=>Object.keys(armorSets).map(name=>calculate(l,0,0,0,false,true,name))),
   qualityUpgradeAt15:settings.levels.flatMap(l=>Object.keys(armorSets).map(name=>calculate(l,0,0,0,false,true,name,l>=15?'uncommon':common.key))),
   armorComparison:settings.levels.flatMap(l=>Object.keys(armorSets).map(name=>calculate(l,0,0,0,true,true,name))),
   growthFixedWeapon:settings.levels.map(l=>calculate(l,0,0,0,false,true)),
   growthProposedWeapon:settings.levels.map(l=>calculate(l,0,0,0,true,true)),
   fixedWeaponByLevel:settings.levels.map(l=>calculate(l,settings.attack,settings.defense)),
   proposedWeaponByLevel:settings.levels.map(l=>calculate(l,settings.attack,settings.defense,0,true)),
   proposedWithResistance:settings.levels.map(l=>calculate(l,settings.attack,settings.defense,20,true)),
   fixedWeaponAttackSweep:[0,50,100,200,500].map(a=>calculate(35,a,settings.defense)),
   fixedWeaponDefenseSweep:[0,50,100,200,500].map(d=>calculate(35,settings.attack,d))};
 },settings);
 assert.deepEqual(errors,[]);
 assert(report.fixedWeaponByLevel.every(row=>row.middle===report.fixedWeaponByLevel[0].middle),'unmodified weapon has no independent attacker-level bonus with fixed stats');
 assert.equal(report.proposedWeaponByLevel.find(row=>row.level===35).weaponMultiplier,2);
 for(const row of report.growthProposedWeapon){assert.equal(row.hp,8*(row.level+5));assert.equal(row.attack,9*(row.level+5));assert.equal(row.defense,8*(row.level+5));assert.equal(row.targetLevel,row.level);}
 for(const row of report.armorComparison){assert(row.middle<=report.growthProposedWeapon.find(r=>r.level===row.level).middle);assert.equal(row.resistance,report.armorDefinitions[row.armor].resistance.物理耐性);}
 for(const table of Object.values(report).filter(Array.isArray))for(const row of table){
  assert.equal(row.passiveCount,0);assert.equal(row.attackCount,1);assert(row.min<=row.middle&&row.middle<=row.max);
 }
} finally {await browser.close();}
mkdirSync('output/combat-balance',{recursive:true});
writeFileSync('output/combat-balance/weapon-level-damage.json',JSON.stringify(report,null,2)+'\n');
const table=rows=>['| Lv | Target Lv | HP | Attack | Defense | Armor | Resistance | Weapon multiplier | Input weapon power | Calculated power | Min | Mid | Max | HP % | Hits to kill |',
 '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
 ...rows.map(r=>`| ${r.level} | ${r.targetLevel} | ${r.hp} | ${r.attack} | ${r.defense} | ${r.armor} | ${r.resistance} | ${r.weaponMultiplier.toFixed(3)} | ${r.inputWeaponPower.toFixed(2)} | ${r.power} | ${r.min} | ${r.middle} | ${r.max} | ${r.hpPercent.toFixed(1)} | ${r.hitsToKill??'-'} |`)].join('\n');
const sections=[['Live formula: fixed common weapon, armor comparison (no proposed level multiplier)',report.liveFormulaArmor],['Scenario: uncommon weapon from Lv15, common armor unchanged (no proposed level multiplier)',report.qualityUpgradeAt15],['Experiment only: armor comparison with proposed weapon level multiplier',report.armorComparison],['Same-level growth, fixed weapon',report.growthFixedWeapon],['Same-level growth, proposed weapon scaling',report.growthProposedWeapon],['Control: fixed stats, level only',report.fixedWeaponByLevel],['Control: fixed stats, proposed weapon-level scaling',report.proposedWeaponByLevel],['Control: fixed stats, proposed scaling, resistance 20',report.proposedWithResistance],['Control: fixed weapon, attack sweep',report.fixedWeaponAttackSweep],['Control: fixed weapon, defense sweep',report.fixedWeaponDefenseSweep]];
const markdown=['# Weapon-level damage experiment','',`Settings: ${JSON.stringify(settings)}`,'',
 `Real engine damage multiplier: ${report.damageMultiplier}. One hit, physical, no passive/terrain/army/critical/barrier/friendly-fire bonus.`,
 'Damage is conditional on a hit. Mid uses random factor 0.45 (not a sampled mean); miss chance is excluded. Nominal hit rate: 75%.',
 'Growth comparisons use equal attacker/target levels, HP included. Race/class reference values: 75, except attack/magic power 90. Shared growth helper: round(reference/10) * (5 + level). No class passives, equipment stats or class evolution. Human class-only allocation is used; equal race/class reference rows give the same totals for alternating allocation.',
 `Armor comparison uses real equipment creation/resistance aggregation: ${Object.entries(report.armorDefinitions).map(([name,armor])=>`${name}: ${armor.items.map(i=>i.name).join('+')||'none'} (${armor.quality}), physical resistance ${armor.resistance.物理耐性}`).join('; ')}. Armor status bonuses are included only in the armor comparison. No shield or guard absorption.`,
 'Only control sections keep target level 35 and HP300. Fixed resistance reduction is target level / 10 * resistance.',
 'Proposed multiplier only changes the synthetic weapon input. Production combat code/config/data are unchanged. Weapon power is rounded by the real engine after stat scaling.','',
 ...sections.flatMap(([title,rows])=>[`## ${title}`,'',table(rows),''])].join('\n');
writeFileSync('output/combat-balance/weapon-level-damage.md',markdown);
console.log(markdown);
