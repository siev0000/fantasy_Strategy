<script setup>
import { computed, ref, watch } from "vue";
import EffectPlayerOverlay from "./EffectPlayerOverlay.vue";
import skillInfoDb from "../../../data/source/export/json/スキル一覧.json";
import { computeSkillScaledTriplet } from "../lib/skill-power.js";

const TABS = [
  ["squad", "部隊"], ["battle", "戦闘"], ["tile", "土地"],
  ["tileData", "土地データ"], ["manage", "管理"]
];
const STATUS = [["攻撃","攻撃"],["防御","防御"],["魔力","魔攻"],["精神","魔防"],["速度","速さ"],["命中","命中"],["SIZ","SIZ"],["移動","移動"]];
const PROF = ["隠密","感知","威圧","軽業","技術","早業","看破","騙す","知識","鑑定","装置","変装","制作","精神接続","魔法技術","指揮"];

const props = defineProps({
  selectedTileDetail:{type:Object,default:null}, tileUnits:{type:Array,default:()=>[]},
  tileEnemyUnits:{type:Array,default:()=>[]}, selectedUnitId:{type:String,default:""},
  canPlayEffect:{type:Boolean,default:false}, showTestControls:{type:Boolean,default:false}
});
const emit = defineEmits(["play-effect","select-unit","move-request","attack-request","open-skill-request","enemy-hp-adjust","manage-request"]);
const activeTab=ref("squad"), squadKey=ref(""), memberId=ref(""), techName=ref(""), enemyId=ref("");
const text=v=>String(v??"").trim();
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const unitId=u=>text(u?.id||u?.unitId||u?.characterId);
const allies=computed(()=>(Array.isArray(props.tileUnits)?props.tileUnits:[]).filter(Boolean));
const enemies=computed(()=>(Array.isArray(props.tileEnemyUnits)?props.tileEnemyUnits:[]).filter(Boolean));
const tabs=computed(()=>props.showTestControls?[...TABS,["effect","エフェクト"]]:TABS);

function selectTab(tabKey){
  const next=text(tabKey);
  if(!tabs.value.some(row=>row[0]===next))return;
  activeTab.value=next;
}

function squadInfo(u){
  const id=text(u?.squadId||u?.squad?.id||u?.groupId||u?.partyId);
  const name=text(u?.squadName||u?.squad?.name||u?.groupName||u?.partyName);
  return id?{key:`id:${id}`,label:name||`部隊 ${id}`}:(name?{key:`name:${name}`,label:name}:{key:"solo",label:"単独"});
}
const squads=computed(()=>{
  const m=new Map();
  for(const u of allies.value){
    const id=unitId(u); if(!id)continue;
    const s=squadInfo(u); if(!m.has(s.key))m.set(s.key,{...s,members:[]}); m.get(s.key).members.push(u);
  }
  return [...m.values()];
});
const squad=computed(()=>squads.value.find(x=>x.key===squadKey.value)||squads.value[0]||null);
const member=computed(()=>squad.value?.members?.find(u=>unitId(u)===memberId.value)||squad.value?.members?.[0]||null);
const enemy=computed(()=>enemies.value.find(u=>unitId(u)===enemyId.value)||enemies.value[0]||null);

function normalize(){
  if(!squads.value.length){squadKey.value="";memberId.value="";return;}
  const wanted=text(props.selectedUnitId);
  const g=wanted?squads.value.find(x=>x.members.some(u=>unitId(u)===wanted)):null;
  if(g){squadKey.value=g.key;memberId.value=wanted;return;}
  if(!squads.value.some(x=>x.key===squadKey.value))squadKey.value=squads.value[0].key;
  const rows=squads.value.find(x=>x.key===squadKey.value)?.members||[];
  if(!rows.some(u=>unitId(u)===memberId.value))memberId.value=unitId(rows[0]);
}
watch([squads,()=>props.selectedUnitId],normalize,{immediate:true});
watch(enemies,rows=>{if(rows.length&&!rows.some(u=>unitId(u)===enemyId.value))enemyId.value=unitId(rows[0]);},{immediate:true});
function chooseSquad(k){squadKey.value=k;memberId.value=unitId(squads.value.find(x=>x.key===k)?.members?.[0]);techName.value="";}
function chooseMember(u){memberId.value=unitId(u);techName.value="";emit("select-unit",{unitId:memberId.value});}
function coord(u){return Number.isFinite(Number(u?.x))&&Number.isFinite(Number(u?.y))?`(${u.x},${u.y})`:"(-,-)";}
function hp(u){const max=Math.max(0,Math.round(num(u?.status?.HP,num(u?.maxHp,0))));const cur=Math.max(0,Math.min(max||Infinity,Math.round(num(u?.hp,num(u?.currentHp,max)))));return [cur,max];}
function ap(u){const max=Math.max(1,Math.round(num(u?.actionPointMax,100)));return [Math.max(0,Math.min(max,Math.round(num(u?.actionPoint,max)))),max];}
function stat(u,k){const vals=[u?.status?.[k],u?.[k]];if(k==="移動")vals.push(u?.move,u?.movement,u?.moveRange);for(const v of vals)if(Number.isFinite(Number(v)))return Math.round(Number(v));return "-";}

const profRows=computed(()=>{
  const u=member.value;if(!u)return[];const src=[u?.skillLevels,u?.proficiencies,u?.skillLevelMap,u?.status];const out=[];
  for(const k of PROF){for(const s of src){if(s&&Number.isFinite(Number(s[k]))){out.push([k,Math.round(Number(s[k]))]);break;}}}return out;
});
const skillDb=new Map((Array.isArray(skillInfoDb)?skillInfoDb:[]).map(r=>[text(r?.名前),r]).filter(([n])=>n));
function techRaw(r){if(typeof r==="string")return{name:text(r),row:skillDb.get(text(r))||null};if(!r||typeof r!=="object")return null;const name=text(r.name||r.名前||r.skillName);return name?{name,row:r.名前?r:(skillDb.get(name)||r)}:null;}
const techRows=computed(()=>{const src=member.value?.techniques||member.value?.skills||member.value?.acquiredSkills||member.value?.skillNames||[];const seen=new Set(),out=[];for(const r of Array.isArray(src)?src:[]){const t=techRaw(r);if(t?.name&&!seen.has(t.name)){seen.add(t.name);out.push(t);}}return out;});
const tech=computed(()=>techRows.value.find(x=>x.name===techName.value)||techRows.value[0]||null);
watch(techRows,r=>{if(!r.length)techName.value="";else if(!r.some(x=>x.name===techName.value))techName.value=r[0].name;},{immediate:true});
function techMeta(t){const r=t?.row;if(!r)return"";const s=computeSkillScaledTriplet(r,member.value?.status||null);const a=[];if(text(r?.AP消費||r?.apCost||r?.AP))a.push(`AP ${text(r?.AP消費||r?.apCost||r?.AP)}`);if(Number.isFinite(Number(s?.power)))a.push(`威力 ${Math.round(Number(s.power))}`);if(text(r?.射程||r?.range))a.push(`射程 ${text(r?.射程||r?.range)}`);if(text(r?.範囲||r?.対象||r?.pattern))a.push(text(r?.範囲||r?.対象||r?.pattern));return a.join(" / ");}
function move(){const id=unitId(member.value);if(id)emit("move-request",{unitId:id});}
function attack(){const id=unitId(member.value);if(id){emit("attack-request",{unitId:id});emit("open-skill-request",{unitId:id});}}
function useTech(){const id=unitId(member.value);if(id)emit("open-skill-request",{unitId:id,skillName:tech.value?.name||""});}

const land=computed(()=>{const d=props.selectedTileDetail;if(!d)return[];return [["地形",text(d.title||d.terrain)||"-"],["領土",text(d.territory)||"-"],["危険度",text(d.danger)||"-"],["高度",text(d.heightLevel)?`Lv ${d.heightLevel}`:"-"],["施設",text(d.facilities)||"-"],["ユニット",text(d.units)||"-"],["敵",text(d.enemies)||"-"],["座標",Number.isFinite(Number(d.x))&&Number.isFinite(Number(d.y))?`(${d.x}, ${d.y})`:"-"]];});
const landData=computed(()=>{const d=props.selectedTileDetail;if(!d)return[];const r=[["町状態",text(d.village)||"-"],["領土状態",text(d.development)||"-"],["回復補正",text(d.tileRecovery)||"-"],["キャンプ",text(d.camp)||"-"],["川",text(d.river)||"-"],["滝",text(d.waterfall)||"-"],["移動停止",text(d.moveStopReason)||"-"]];if(props.showTestControls)r.push(["敵索敵/隠密",text(d.enemySense)||"-"]);return r;});
const manage=[["♟","自キャラ","character"],["⌂","都市・建設","build"],["⚒","装備","equipment"],["✚","ユニット作成","unit-create"],["☷","ログ","log"],["⚙","設定","settings"]];
</script>

<template>
<section class="fs-panel">
  <nav class="fs-tabs"><button v-for="t in tabs" :key="t[0]" type="button" :class="{active:activeTab===t[0]}" @click.stop="selectTab(t[0])">{{t[1]}}</button></nav>
  <div :key="activeTab" class="fs-body">
    <section v-if="activeTab==='squad'" class="fs-squad">
      <div v-if="squads.length" class="fs-squad-picker"><button v-for="s in squads" :key="s.key" :class="{active:squad?.key===s.key}" @click="chooseSquad(s.key)"><b>{{s.label}}</b><small>{{s.members.length}}体</small></button></div>
      <div v-if="squad" class="fs-split">
        <div class="fs-list">
          <button v-for="u in squad.members" :key="unitId(u)" class="fs-member" :class="{active:unitId(u)===unitId(member)}" @click="chooseMember(u)">
            <div class="fs-mhead"><span class="fs-avatar"><img v-if="u.iconSrc" :src="u.iconSrc" :alt="u.name||'キャラ'"/><b v-else>{{text(u.name).slice(0,1)||'兵'}}</b></span><strong>{{u.name||'キャラ'}}</strong><small>{{coord(u)}}</small></div>
            <div class="fs-vital"><span>HP</span><b>{{hp(u)[0]}} / {{hp(u)[1]}}</b></div><div class="fs-vital ap"><span>AP</span><b>{{ap(u)[0]}} / {{ap(u)[1]}}</b></div>
          </button>
        </div>
        <div class="fs-detail" v-if="member">
          <div class="fs-detail-head"><div><strong>{{member.name||'キャラ'}}</strong><small>{{coord(member)}}</small></div><button type="button" @click.stop="selectTab('battle')">戦闘へ</button></div>
          <h3>各種ステータス</h3><div class="fs-stats"><div v-for="s in STATUS" :key="s[0]"><span>{{s[1]}}</span><b>{{stat(member,s[0])}}</b></div></div>
          <h3>技能</h3><div v-if="profRows.length" class="fs-prof"><div v-for="p in profRows" :key="p[0]"><span>{{p[0]}}</span><b>{{p[1]}}</b></div></div><p v-else class="fs-empty">技能データなし</p>
          <h3>技</h3><div v-if="techRows.length" class="fs-tech"><button v-for="t in techRows" :key="t.name" :class="{active:tech?.name===t.name}" @click="techName=t.name"><strong>{{t.name}}</strong><small>{{techMeta(t)||'詳細データなし'}}</small></button></div><p v-else class="fs-empty">技データなし</p>
        </div>
      </div><p v-else class="fs-empty">このマスに自軍キャラクターはいません。</p>
    </section>

    <section v-else-if="activeTab==='battle'" class="fs-battle">
      <div class="fs-actions"><button @click="move">➜<span>移動</span></button><button class="danger" @click="attack">⚔<span>攻撃</span></button><button>◼<span>待機</span></button></div>
      <div class="fs-battle-grid"><div class="fs-tech fs-scroll"><button v-for="t in techRows" :key="t.name" :class="{active:tech?.name===t.name}" @click="techName=t.name"><strong>{{t.name}}</strong><small>{{techMeta(t)||'-'}}</small></button><p v-if="!techRows.length" class="fs-empty">使用可能な技がありません。</p></div>
      <aside class="fs-battle-side"><div class="fs-ap"><span>AP</span><b>{{ap(member)[0]}} / {{ap(member)[1]}}</b></div><button class="primary" :disabled="!tech" @click="useTech">使用</button><div class="fs-enemies fs-scroll"><button v-for="e in enemies" :key="unitId(e)" :class="{active:unitId(e)===unitId(enemy)}" @click="enemyId=unitId(e)"><span>{{e.name||'敵'}}</span><small>HP {{hp(e)[0]}}/{{hp(e)[1]}}</small></button></div></aside></div>
    </section>

    <section v-else-if="activeTab==='tile'" class="fs-land"><template v-if="selectedTileDetail"><div v-for="r in land" :key="r[0]"><span>{{r[0]}}</span><b>{{r[1]}}</b></div></template><p v-else class="fs-empty">マスを選択すると土地情報を表示します。</p></section>

    <section v-else-if="activeTab==='tileData'" class="fs-tile-data fs-scroll"><template v-if="selectedTileDetail"><div class="fs-preview"><article><img v-if="selectedTileDetail.terrainIconSrc" :src="selectedTileDetail.terrainIconSrc"/><b v-else>⬢</b><span>{{selectedTileDetail.terrainIconLabel||selectedTileDetail.terrain||'地形'}}</span></article><article><img v-if="selectedTileDetail.unitIconSrc" :src="selectedTileDetail.unitIconSrc"/><b v-else>♟</b><span>{{selectedTileDetail.unitName||'ユニットなし'}}</span></article></div><div class="fs-land compact"><div v-for="r in landData" :key="r[0]"><span>{{r[0]}}</span><b>{{r[1]}}</b></div></div></template><p v-else class="fs-empty">マスを選択すると土地データを表示します。</p></section>

    <section v-else-if="activeTab==='manage'" class="fs-manage"><button v-for="m in manage" :key="m[2]" @click="emit('manage-request',{key:m[2]})"><b>{{m[0]}}</b><span>{{m[1]}}</span></button></section>
    <section v-else-if="activeTab==='effect'" class="fs-scroll"><effect-player-overlay :inline="true" :can-play="canPlayEffect" @play-request="emit('play-effect',$event)"/></section>
  </div>
</section>
</template>

<style scoped>
.fs-panel{--line:#34464c;--active:#70d1df;--muted:#91a2a6;position:relative;z-index:42;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;color:#edf3f2;background:linear-gradient(180deg,rgba(16,27,32,.98),rgba(9,16,20,.98));border:1px solid #53686f;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr);font-size:14px;box-shadow:-4px 0 18px #0006}.fs-tabs{display:flex;gap:4px;padding:5px 6px;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none}.fs-tabs::-webkit-scrollbar,.fs-scroll::-webkit-scrollbar,.fs-list::-webkit-scrollbar,.fs-detail::-webkit-scrollbar,.fs-squad-picker::-webkit-scrollbar{display:none}.fs-tabs button{flex:1 0 auto;min-width:82px;min-height:36px;border:1px solid #3b4b50;border-radius:7px;background:#142126;color:#cad5d5;font-weight:700;font-size:13px}.fs-tabs button.active{border-color:var(--active);background:#183f49;color:#fff}.fs-body{min-height:0;overflow:hidden;padding:6px}.fs-scroll,.fs-list,.fs-detail{min-height:0;overflow:auto;scrollbar-width:none;overscroll-behavior:contain}.fs-squad{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:6px}.fs-squad-picker{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none}.fs-squad-picker button{flex:0 0 auto;min-width:100px;min-height:38px;border:1px solid #405158;border-radius:8px;background:#132026;color:#e8efee;padding:5px 9px;display:flex;justify-content:space-between;gap:8px;align-items:center}.fs-squad-picker button.active{border-color:var(--active);background:#18343b}.fs-squad-picker small{color:var(--muted)}.fs-split{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:6px;overflow:hidden}.fs-list{display:grid;align-content:start;gap:6px}.fs-member{border:1px solid var(--line);border-radius:9px;background:#111b20;color:#edf3f2;padding:7px;text-align:left;display:grid;gap:4px}.fs-member.active{border-color:var(--active);background:#163039}.fs-mhead{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;align-items:center}.fs-avatar{width:34px;height:34px;border:1px solid #4a5b61;border-radius:7px;background:#222d31;display:grid;place-items:center;overflow:hidden}.fs-avatar img{width:100%;height:100%;object-fit:cover}.fs-mhead strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-mhead small,.fs-detail-head small{font-size:10px;color:var(--muted)}.fs-vital{display:flex;justify-content:space-between;font-size:11px;color:#a9b8ba}.fs-vital b{color:#eef3f2}.fs-vital.ap b{color:#75c9f3}.fs-detail{display:grid;align-content:start;gap:6px;padding-bottom:8px}.fs-detail-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:6px}.fs-detail-head>div{display:grid}.fs-detail-head button{min-height:32px;border:1px solid #4c656c;border-radius:7px;background:#1d3036;color:#eef3f2}.fs-detail h3{margin:3px 0 0;font-size:11px;color:#cad5d5;border-left:3px solid #66c5d2;padding-left:6px}.fs-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.fs-stats div,.fs-prof div,.fs-land div{border:1px solid #314247;border-radius:7px;background:#132025;padding:5px}.fs-stats span,.fs-prof span,.fs-land span{display:block;font-size:9px;color:var(--muted)}.fs-stats b,.fs-prof b,.fs-land b{font-size:13px}.fs-prof{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}.fs-prof div{display:flex;justify-content:space-between}.fs-tech{display:grid;gap:4px}.fs-tech button{border:1px solid #3a4b51;border-radius:7px;background:#121d22;color:#edf3f2;padding:7px;text-align:left;display:grid;gap:2px}.fs-tech button.active{border-color:#d8b968;background:#292617}.fs-tech strong{font-size:11px}.fs-tech small{font-size:9px;color:#9badb0}.fs-empty{margin:6px;color:#8fa1a4;font-size:11px}.fs-battle{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:6px}.fs-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.fs-actions button{min-height:42px;border:1px solid #3e555b;border-radius:8px;background:#173139;color:#eef3f2;font-size:18px}.fs-actions span{display:block;font-size:10px}.fs-actions .danger{background:#472426;border-color:#865054}.fs-battle-grid{min-height:0;display:grid;grid-template-columns:1.6fr .8fr;gap:6px}.fs-battle-side{min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:6px}.fs-ap{border:1px solid var(--line);border-radius:7px;background:#132025;padding:7px;display:flex;justify-content:space-between}.fs-battle-side>.primary{min-height:38px;border:1px solid #9a8244;border-radius:8px;background:#6c5727;color:#fff}.fs-enemies{display:grid;align-content:start;gap:4px}.fs-enemies button{border:1px solid #583c40;border-radius:7px;background:#24181b;color:#f0dddd;padding:6px;text-align:left;display:grid}.fs-enemies button.active{border-color:#d47a7f}.fs-enemies small{font-size:9px;color:#bc989b}.fs-land{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;overflow:auto;scrollbar-width:none}.fs-land.compact{grid-template-columns:repeat(2,1fr);overflow:visible}.fs-land b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-tile-data{height:100%;display:grid;align-content:start;gap:7px}.fs-preview{display:grid;grid-template-columns:1fr 1fr;gap:7px}.fs-preview article{min-height:88px;border:1px solid var(--line);border-radius:8px;background:#121d22;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px;padding:8px}.fs-preview img{width:58px;height:58px;object-fit:contain}.fs-preview article>b{font-size:30px}.fs-preview span{font-size:11px;color:#cfd9d8}.fs-manage{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;overflow:auto}.fs-manage button{min-height:70px;border:1px solid #3c4e54;border-radius:9px;background:#142126;color:#eef3f2;display:grid;place-items:center}.fs-manage b{font-size:24px}.fs-manage span{font-size:11px}
@media (orientation:landscape){.fs-tabs{display:grid;grid-template-columns:repeat(3,1fr)}.fs-tabs button{min-width:0}}
@media (max-width:520px) and (orientation:portrait){.fs-tabs button{min-width:72px;font-size:12px}.fs-stats{grid-template-columns:repeat(2,1fr)}.fs-split{gap:4px}.fs-member{padding:5px}.fs-avatar{width:30px;height:30px}.fs-land{grid-template-columns:repeat(2,1fr)}.fs-manage{grid-template-columns:repeat(2,1fr)}}
</style>
