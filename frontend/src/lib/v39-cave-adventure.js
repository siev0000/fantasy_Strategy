import { classData, raceData, equipmentData } from "./game-data-registry.js";
import { buildV39UnitEntity, buildV39ClassEquipment, getV39InitialJobClasses } from "./v39-unit-creation-rules.js";
import { applyV39DerivedCharacterData } from "../v39/unit/v39-character-derived-rules.js";
import { resolveV39UnitInitialLevel, resolveV39DamageExpReward, grantV39UnitExperience } from "./v39-unit-experience.js";
import { createV39EquipmentEntry, getV39EquipmentSlotCandidates } from "./v39-equipment-rules.js";
import { resolveAttackRows, resolveAttackApCost, resolveAttackRange, resolveAreaType, resolveSplashSpec, resolveSkillHealing, resolveAttackPower, computeAttackDamage } from "./v39-combat-engine.js";
import { createV39EventEnemy, getV39EnemySpawnDefinitions } from "../v39/ai/v39-enemy-spawn.js";
import { generateV39CaveMap, populateV39CaveMonsters, findV39CavePath } from "./v39-cave-generator.js";
import { getHexNeighborCoords } from "./hex-grid.js";
import { V39_CAVE_BALANCE as balance } from "./v39-gameplay-balance.js";
import { createCaveSites, caveSiteVisible } from "./v39-cave-sites.js";

export const caveRaceOptions = raceData.filter(row=>classData.some(item=>item.名前===row.className));
export const caveClassOptions = getV39InitialJobClasses();
export const caveEquipmentOptions = equipmentData.filter(row=>getV39EquipmentSlotCandidates(row).length);
const key = tile => `${tile.x},${tile.y}`;
const alive = unit => unit.hp>0;
function log(game,message) { game.log.unshift(`B${game.floor} T${game.turn} ${message}`); game.log.length=Math.min(game.log.length,balance.logLimit); }

export function createCaveCharacter(profile,index) {
  if (!caveRaceOptions.some(row=>row.key===profile.race) || !caveClassOptions.some(row=>row.名前===profile.className)) throw new Error("種族またはクラスが無効です");
  if (!String(profile.name||"").trim()) throw new Error("キャラクター名を入力してください");
  const level=Number(profile.level);
  if (!Number.isInteger(level)||level<1||level>50) throw new Error("初期Lvは1〜50で指定してください");
  const row=classData.find(item=>item.名前===profile.className);
  const equipment=buildV39ClassEquipment(row);
  if (!equipment.some(item=>item.slot==="武器1")) {
    const weapon=caveEquipmentOptions.find(item=>getV39EquipmentSlotCandidates(item).includes("武器1"));
    if (weapon) equipment.push({slot:"武器1",name:weapon.装備名});
  }
  const unit=buildV39UnitEntity({...profile,id:`cave-party-${index}`,unitType:"ヒーロー",equipment});
  if (!unit.derivedCharacter?.ok) throw new Error(`キャラクター生成に失敗しました: ${profile.name}`);
  return {...unit,caveCooldowns:{}};
}

export function defaultCaveProfiles() {
  const classes=["ファイター","アーチャー","クレリック"];
  const race=caveRaceOptions.find(row=>row.key==="只人") || caveRaceOptions[0];
  return Array.from({length:balance.partySize},(_,i)=>({name:`探索者${i+1}`,race:race.key,className:caveClassOptions.find(row=>row.名前===classes[i])?.名前||caveClassOptions[0].名前,level:resolveV39UnitInitialLevel(race.key)}));
}

export function revealCave(game) {
  const seen=new Set([key(game.position)]),queue=[{...game.position,distance:0}];
  for(let i=0;i<queue.length;i++) {
    const tile=queue[i];
    if(tile.distance>=balance.visionDistance) continue;
    for(const next of getHexNeighborCoords(game.map.w,game.map.h,tile.x,tile.y)) {
      if(game.map.grid[next.y][next.x]!=="洞窟"||seen.has(next.key)) continue;
      seen.add(next.key);queue.push({...next,distance:tile.distance+1});
    }
  }
  game.visible=[...seen];game.discovered=[...new Set([...game.discovered,...seen])];
  for(const site of game.sites||[])if(caveSiteVisible(game,site))site.discovered=true;
}

export function generateCaveFloor(game) {
  const map=generateV39CaveMap({seed:`${game.seed}:floor-${game.floor}`,templateId:game.templateId,entranceCount:game.entranceCount||2});
  let definitions=getV39EnemySpawnDefinitions("洞窟");
  let levelBonus=(game.floor-1)*balance.floorLevelStep;
  if(game.caveTest) {
    const height=Math.floor((game.floor-1)/balance.testFloorsPerHeight);
    const races=[...new Set(definitions.map(row=>row.race))].sort();
    // 階層の生成順や再訪で抽選結果を変えず、区分が変わるたびに次の種へ切り替える。
    const seedOffset=[...String(game.seed)].reduce((value,char)=>(Math.imul(value,31)+char.codePointAt(0))>>>0,0);
    const race=races[(seedOffset+height)%races.length];
    definitions=definitions.filter(row=>row.race===race);
    map.caveTest=true;
    map.caveDifficultyHeight=height;
    map.caveHabitatRace=race;
    levelBonus=height*window.getV39EnemySpawnRules().terrainLevelStep;
  }
  const factory = options => createV39EventEnemy({...options,level:Math.min(balance.adventureEnemyLevelCap,options.level+levelBonus)});
  const enemies=populateV39CaveMonsters(map,definitions,factory);
  if(balance.bossFloorInterval>0&&game.floor%balance.bossFloorInterval===0) {
    const definition=[...definitions].sort((a,b)=>b.maxLevel-a.maxLevel)[0];
    const occupied=new Set([...enemies,...map.entrances].map(key));
    const exit=map.entrances[1];
    const candidates=map.grid.flatMap((line,y)=>line.flatMap((terrain,x)=>{
      if(terrain!=="洞窟"||occupied.has(`${x},${y}`))return [];
      if(map.entrances.some(entry=>findV39CavePath(map,{x,y},entry).length-1<=balance.entranceSafeDistance))return [];
      const distance=findV39CavePath(map,{x,y},exit).length-1;
      return distance>balance.entranceSafeDistance?[{x,y,distance}]:[];
    })).sort((a,b)=>a.distance-b.distance);
    const tile=candidates[0];
    if(!tile)throw new Error("洞窟ボスの配置場所がありません");
    const boss=createV39EventEnemy({id:`${map.id}-boss`,name:`${definition.name}（ボス）`,race:definition.race,className:definition.className,
      level:Math.min(balance.adventureEnemyLevelCap,definition.maxLevel+levelBonus+balance.bossLevelBonus),x:tile.x,y:tile.y,
      metadata:{spawnTerrain:"洞窟",sourceDefinitionId:definition.definitionId,image:definition.row.画像,aggressive:true}});
    if(!boss)throw new Error("洞窟ボスの生成に失敗しました");
    enemies.push({...boss,isCaveBoss:true});
  }
  return {map,enemies,sites:createCaveSites(map,enemies)};
}

function enterFloor(game) {
  const {map,enemies}=generateCaveFloor(game);
  game.map=map;game.enemies=enemies;game.position={...map.entrances[0]};game.route=[];game.discovered=[];
  game.trail=game.party.map(()=>({...game.position}));
  game.sites=createCaveSites(map,enemies);
  for(const unit of game.party) {unit.x=game.position.x;unit.y=game.position.y;unit.ap=alive(unit)?unit.maxAp:0;unit.currentAp=unit.ap;}
  revealCave(game);log(game,`${map.templateName}へ到着`);
}

export function createCaveAdventure(profiles,{seed="adventure",templateId="random"}={}) {
  if(profiles.length!==balance.partySize) throw new Error(`キャラクターを${balance.partySize}体作成してください`);
  const game={seed,templateId,party:profiles.map(createCaveCharacter),inventory:{鉱石:0,宝石:0},floor:1,turn:1,phase:"player",map:null,enemies:[],sites:[],position:null,visible:[],discovered:[],route:[],log:[]};
  enterFloor(game);return game;
}

export function caveActions(unit) {
  // 第一段階は即時・単体の攻撃と回復。未対応の範囲/待機/持続効果を単体へ偽装しない。
  return resolveAttackRows(unit).filter(row=>resolveAreaType(row)==="single"&&resolveSplashSpec(row).value===0
    &&!(Number(row.待機)>0)&&!(Number(row.効果時間)>0)&&!String(row.効果||"").includes("蘇生")
    &&(resolveAttackPower(row,unit)>0||resolveSkillHealing(row,unit)>0));
}

export function caveActionUnavailable(game,unit,row) {
  if(game.phase!=="player"||!alive(unit)) return "行動できません";
  const cooldown=(unit.caveCooldowns?.[row.名前]||0)-game.turn;
  if(cooldown>0) return `CT ${cooldown}`;
  if(unit.ap<resolveAttackApCost(row,unit)) return "AP不足";
  if(unit.hp<=Math.max(0,Number(row.HP消費)||0)) return "HP不足";
  return "";
}

export function moveCaveParty(game,target) {
  if(game.phase!=="player") throw new Error("行動できません");
  const path=findV39CavePath(game.map,game.position,target,game.enemies.filter(alive).map(key));
  if(!path.length) throw new Error("敵または壁に通路を塞がれています");
  const units=game.party.filter(alive);
  const steps=Math.min(path.length-1,...units.map(unit=>Math.floor(unit.ap/balance.moveApPerTile)));
  if(steps<1) throw new Error("移動APが足りません");
  game.route=path.slice(0,steps+1);
  // 途中のマスも発見する。遠い目的地を押しただけでその先のFogは解除しない。
  for(const tile of game.route.slice(1)) {
    game.position={...tile};
    game.trail=[{...tile},...game.trail].slice(0,game.party.length);
    revealCave(game);
  }
  for(const unit of game.party) {unit.x=game.position.x;unit.y=game.position.y;if(alive(unit))unit.ap-=steps*balance.moveApPerTile;unit.currentAp=unit.ap;}
  log(game,`${steps}マス移動`);return game.route;
}

// 隊列は表示用。射程・敵AIは既存のパーティー共通位置を参照する。
export function cavePartyFormation(game,trail=game.trail) {
  return game.party.map((unit,index)=>({unit,index,position:trail[index]||game.position}));
}

export function reorderCaveParty(game,unitId,direction) {
  if(game.phase!=="player") throw new Error("並び替えできません");
  const index=game.party.findIndex(unit=>unit.id===unitId),next=index+direction;
  if(index<0||![1,-1].includes(direction)||next<0||next>=game.party.length) throw new Error("この順番には移動できません");
  [game.party[index],game.party[next]]=[game.party[next],game.party[index]];
  log(game,`隊列：${game.party.map(unit=>unit.name).join(" → ")}`);
}

function hurt(game,attacker,target,row,random) {
  const before=Math.max(0,target.hp);
  const damage=computeAttackDamage({attacker,target,skillRow:row,random});
  target.hp-=damage.total;target.currentHp=target.hp;target.state=alive(target)?"生存":"死亡";
  log(game,`${attacker.name} → ${target.name}：${row.名前} ${damage.total} (${damage.hits.join(",")})${damage.missCount?" Miss":""}${alive(target)?"":" 撃破"}`);
  return {before,damage};
}

export function useCaveAction(game,actorId,actionIndex,targetId,random=Math.random) {
  const actor=game.party.find(unit=>unit.id===actorId),row=actor&&caveActions(actor)[actionIndex];
  if(!row) throw new Error("行動を選択してください");
  const unavailable=caveActionUnavailable(game,actor,row);if(unavailable)throw new Error(unavailable);
  const healing=resolveSkillHealing(row,actor);
  const target=(healing>0?game.party:game.enemies).find(unit=>unit.id===targetId&&alive(unit));
  if(!target) throw new Error(healing>0?"生存している仲間を選んでください":"敵を選んでください");
  if(!healing) {
    if(!game.visible.includes(key(target))) throw new Error("見えていない敵は攻撃できません");
    const path=findV39CavePath(game.map,game.position,target);
    if(!path.length||path.length-1>resolveAttackRange(row,actor)) throw new Error("射程外です");
  }
  actor.ap-=resolveAttackApCost(row,actor);actor.currentAp=actor.ap;
  actor.hp-=Math.max(0,Number(row.HP消費)||0);actor.currentHp=actor.hp;
  const ct=Math.max(0,Math.ceil(Number(row.CT)||0));if(ct)actor.caveCooldowns[row.名前]=game.turn+ct+1;
  if(healing>0) {const amount=Math.min(healing,target.maxHp-target.hp);target.hp+=amount;target.currentHp=target.hp;log(game,`${actor.name}：${row.名前} → ${target.name} +${amount}`);return;}
  const {before}=hurt(game,actor,target,row,random);target.provoked=true;
  const reward=resolveV39DamageExpReward(target,before,Math.max(0,target.hp));
  target.expRewardedHpDamage=reward.nextRewardedHpDamage;
  const recipients=game.party.filter(alive),share=Math.floor(reward.rawExp/Math.max(1,recipients.length));
  game.party=game.party.map(unit=>alive(unit)?grantV39UnitExperience(unit,share).unit:unit);
  if(share>0) log(game,`生存メンバーに経験値 +${share}`);
}

export function endCaveTurn(game,random=Math.random) {
  if(game.phase!=="player") return;
  game.phase="enemy";
  for(const enemy of game.enemies.filter(alive)) {
    if(!game.party.some(alive)) break;
    let path=findV39CavePath(game.map,enemy,game.position,game.enemies.filter(unit=>alive(unit)&&unit.id!==enemy.id).map(key));
    if(!path.length||(!enemy.provoked&&(!enemy.aggressive||path.length-1>balance.enemyDetectDistance))) continue;
    const rows=caveActions(enemy).filter(row=>!resolveSkillHealing(row,enemy)&&(enemy.caveCooldowns?.[row.名前]||0)<=game.turn&&resolveAttackApCost(row,enemy)<=enemy.maxAp);
    if(!rows.length) continue;
    if(!rows.some(row=>path.length-1<=resolveAttackRange(row,enemy))) {
      const step=Math.min(balance.enemyMoveSteps,path.length-2);if(step>0){enemy.x=path[step].x;enemy.y=path[step].y;}
      path=findV39CavePath(game.map,enemy,game.position);
    }
    const usable=rows.filter(row=>path.length>0&&path.length-1<=resolveAttackRange(row,enemy));
    if(!usable.length) continue;
    const row=usable[Math.floor(random()*usable.length)],targets=game.party.filter(alive),target=targets[Math.floor(random()*targets.length)];
    hurt(game,enemy,target,row,random);
    const ct=Math.max(0,Math.ceil(Number(row.CT)||0));if(ct){enemy.caveCooldowns ||= {};enemy.caveCooldowns[row.名前]=game.turn+ct+1;}
  }
  game.turn++;game.phase=game.party.some(alive)?"player":"defeat";
  for(const unit of game.party){unit.ap=alive(unit)?unit.maxAp:0;unit.currentAp=unit.ap;}
  revealCave(game);log(game,game.phase==="defeat"?"全滅しました":"プレイヤーターン");
}

export function changeCaveEquipment(game,unitId,slot,name) {
  const unit=game.party.find(item=>item.id===unitId);
  if(game.phase!=="player"||!unit||!alive(unit))throw new Error("装備変更できません");
  const item=name?createV39EquipmentEntry(name,undefined,slot):null;
  if(name&&(!item||item.slot!==slot))throw new Error("このスロットには装備できません");
  const equipment=unit.equipment.filter(entry=>entry.slot!==slot);if(item)equipment.push(item);
  const next=applyV39DerivedCharacterData({...unit,equipment});
  next.hp=Math.min(next.maxHp,unit.hp);next.currentHp=next.hp;
  game.party=game.party.map(entry=>entry.id===unitId?next:entry);log(game,`${unit.name}：${slot} ${name||"外す"}`);
}

export function descendCave(game) {
  if(game.phase!=="player"||!game.map.entrances.slice(1).some(entry=>entry.key===key(game.position)))throw new Error("次の出入口まで移動してください");
  game.floor++;enterFloor(game);
}

export function caveSiteUnavailable(game,site,actor) {
  if(game.phase!=="player"||!site.discovered)return "行動できません";
  if(site.remaining<=0)return "使い切りました";
  if(site.wall) {
    if(!getHexNeighborCoords(game.map.w,game.map.h,site.x,site.y).some(tile=>tile.key===key(game.position)))return "隣接マスから採取できます";
    if(!actor||!alive(actor))return "生存している担当者を選んでください";
    if(actor.ap<balance.miningApCost)return "AP不足";
  } else {
    if(site.key!==key(game.position))return "群生地のマスへ移動してください";
    if(site.lastUseTurn===game.turn)return "このターンは休息済みです";
    if(!game.party.some(unit=>alive(unit)&&unit.hp<unit.maxHp))return "回復が必要な仲間はいません";
    if(game.party.some(unit=>alive(unit)&&unit.ap<balance.recoveryApCost))return "AP不足";
  }
  return "";
}

export function useCaveSite(game,siteId,actorId) {
  const site=game.sites.find(item=>item.id===siteId),actor=game.party.find(unit=>unit.id===actorId);
  if(!site)throw new Error("地点がありません");
  const reason=caveSiteUnavailable(game,site,actor);if(reason)throw new Error(reason);
  if(site.wall) {
    actor.ap-=balance.miningApCost;actor.currentAp=actor.ap;
    game.inventory[site.name]++;
    log(game,`${actor.name}：${site.name} +1`);
  } else {
    for(const unit of game.party.filter(alive)) {
      const amount=Math.min(unit.maxHp-unit.hp,Math.ceil(unit.maxHp*balance.recoveryHpRate));
      unit.hp+=amount;unit.currentHp=unit.hp;unit.ap-=balance.recoveryApCost;unit.currentAp=unit.ap;
      log(game,`${site.name}：${unit.name} HP +${amount}`);
    }
    site.lastUseTurn=game.turn;
  }
  site.remaining--;
}
