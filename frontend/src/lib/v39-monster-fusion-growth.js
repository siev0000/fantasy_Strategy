import {resolveV39UnitExpNeed,resolveV39UnitRaceCategory} from './v39-unit-experience.js';

const text=value=>String(value??'').trim();
const fail=reason=>({ok:false,reason});

export function collectV39FusionClassLevels(unit){
  const derived=unit?.derivedCharacter;
  if(!derived?.ok)return null;
  const levels={};
  const add=(name,value)=>{if(text(name)&&Number.isFinite(Number(value))&&Number(value)>=0)levels[text(name)]=(levels[text(name)]||0)+Math.floor(Number(value));};
  add(derived.race||unit.race,derived.raceLevels);
  add(derived.className||unit.className,derived.classLevels);
  for(const [name,value] of Object.entries(derived.prerequisiteClassLevels||{}))add(name,value);
  if(derived.strongAnimalClassName)add(derived.strongAnimalClassName,derived.strongAnimalClassLevel);
  return levels;
}

function fractionalProgress(value,category){
  const level=Math.floor(value),fraction=Math.max(0,Math.round((value-level)*1e12)/1e12);
  const need=resolveV39UnitExpNeed(level,category);
  return {level,fraction,exp:fraction*need,need};
}

// Reserve required classes, then apportion the remaining integer budget once.
function inheritedLevels(weights,required,budget){
  const rows=Object.entries(weights).filter(([name,weight])=>weight>0||required.has(name)).map(([name,weight],index)=>({name,weight,index,level:required.has(name)?1:0}));
  for(const name of required)if(!rows.some(row=>row.name===name))return fail(`素材に必要クラスがありません: ${name}`);
  let remaining=budget-rows.reduce((sum,row)=>sum+row.level,0);
  if(remaining<0)return fail('完成Lvでは、条件・獲得クラスをすべてLv1以上で保持できません');
  const total=rows.reduce((sum,row)=>sum+row.weight,0);
  if(!total)return fail('素材の種族・クラスLvを取得できません');
  for(const row of rows){const share=remaining*row.weight/total;row.level+=Math.floor(share);row.remainder=share-Math.floor(share);}
  const extra=budget-rows.reduce((sum,row)=>sum+row.level,0);
  const ranked=[...rows].sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(let i=0;i<extra;i++)ranked[i].level++;
  return {ok:true,levels:Object.fromEntries(rows.filter(row=>row.level>0).map(row=>[row.name,row.level]))};
}

export function calculateV39MonsterFusionGrowth({materials=[],requiredClasses=[],acquiredClasses=[],levelCap=120}={}){
  if(materials.length<2)return fail('合体には異なる素材ユニットが2体以上必要です');
  const ids=materials.map(unit=>text(unit.id));
  if(ids.some(id=>!id)||new Set(ids).size!==ids.length)return fail('同じ素材ユニットを重複して使用できません');
  if(materials.some(unit=>!Number.isSafeInteger(unit.level)||unit.level<1))return fail('素材Lvが不正です');
  const required=new Set(requiredClasses.map(text).filter(Boolean));
  const acquired=[...new Set(acquiredClasses.map(text).filter(Boolean))];
  const weights={};
  for(const unit of materials){
    const levels=collectV39FusionClassLevels(unit);
    if(!levels)return fail(`種族・クラスLvを取得できません: ${unit.name||unit.id}`);
    for(const [name,value] of Object.entries(levels))weights[name]=(weights[name]||0)+value;
  }
  const sourceLevel=materials.reduce((sum,unit)=>sum+unit.level,0);
  if(!Number.isSafeInteger(sourceLevel))return fail('素材Lvの合計が大きすぎます');
  for(const name of required)if(!(weights[name]>0))return fail(`素材に必要クラスがありません: ${name}`);
  for(const name of acquired)if(!(name in weights))weights[name]=0;
  const highestLevel=Math.max(...materials.map(unit=>unit.level));
  const targetValue=highestLevel+(sourceLevel-highestLevel)/5;
  if(targetValue>levelCap)return fail(`合体後のLvが上限${levelCap}を超えます`);
  const base=inheritedLevels(weights,new Set([...required,...acquired]),Math.floor(targetValue));
  if(!base.ok)return base;
  const levelsByClass={...base.levels};
  const acquiredPool=acquired.reduce((sum,name)=>sum+levelsByClass[name],0);
  const baseValue=targetValue-acquiredPool;
  const baseProgress=fractionalProgress(baseValue,resolveV39UnitRaceCategory(materials[0]));
  const acquiredProgress=Object.fromEntries(acquired.map(name=>[name,{
    ...fractionalProgress(levelsByClass[name],resolveV39UnitRaceCategory({race:name})),finalLevel:levelsByClass[name]
  }]));
  const level=Object.values(levelsByClass).reduce((sum,value)=>sum+value,0);
  if(level>levelCap)return fail(`合体後のLvが上限${levelCap}を超えます`);
  return {ok:true,sourceLevel,highestLevel,targetValue,baseValue,baseProgress,
    baseLevels:Object.fromEntries(Object.entries(levelsByClass).filter(([name])=>!acquired.includes(name))),acquiredProgress,
    acquiredPool,levelsByClass,level,requiredClasses:[...required]};
}
