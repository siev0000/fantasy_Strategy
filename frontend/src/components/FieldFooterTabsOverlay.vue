<script setup>
import { computed, ref, watch } from "vue";
import { skillData as skillInfoDb } from "../lib/game-data-registry.js";
import { computeSkillScaledTriplet } from "../lib/skill-power.js";
import { getRaceIconSrc } from "../lib/race-icon-library.js";
import { SKILL_LEVEL_FIELDS } from "../constants/unitCommon.js";

const TABS = [
  ["action", "行動"],
  ["info", "情報"],
  ["interaction", "交流"]
];
const STATUS = [["攻撃","攻撃"],["防御","防御"],["魔力","魔力"],["精神","精神"],["命中","命中"],["速度","速度"],["SIZ","SIZ"],["APP","APP"],["移動","移動"],["飛行","飛行"]];
const PROF = [...new Set([...SKILL_LEVEL_FIELDS,"感知","軽業","騙す","知識","鑑定","装置","制作","精神接続","魔法技術"])];

const props = defineProps({
  selectedTileDetail:{type:Object,default:null}, tileUnits:{type:Array,default:()=>[]},
  tileEnemyUnits:{type:Array,default:()=>[]}, selectedUnitId:{type:String,default:""},
  canPlayEffect:{type:Boolean,default:false}, showTestControls:{type:Boolean,default:false}
});
const emit = defineEmits(["play-effect","select-unit","move-request","attack-request","open-skill-request","enemy-hp-adjust","manage-request"]);
const activeTab=ref("action"), squadKey=ref(""), memberId=ref(""), techName=ref(""), enemyId=ref("");
const text=v=>String(v??"").trim();
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const unitId=u=>text(u?.id||u?.unitId||u?.characterId);
const allies=computed(()=>(Array.isArray(props.tileUnits)?props.tileUnits:[]).filter(Boolean));
const enemies=computed(()=>(Array.isArray(props.tileEnemyUnits)?props.tileEnemyUnits:[]).filter(Boolean));
const tabs=computed(()=>TABS);

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
function level(u){return Math.max(1,Math.floor(num(u?.level,num(u?.status?.Lv,1))));}
function raceIconSrc(u){return getRaceIconSrc(text(u?.race));}
function hp(u){const max=Math.max(0,Math.round(num(u?.status?.HP,num(u?.maxHp,0))));const cur=Math.max(0,Math.min(max||Infinity,Math.round(num(u?.hp,num(u?.currentHp,max)))));return [cur,max];}
function ap(u){const max=Math.max(1,Math.round(num(u?.actionPointMax,100)));return [Math.max(0,Math.min(max,Math.round(num(u?.actionPoint,max)))),max];}
function stat(u,k){const vals=k==="飛行"?[u?.skillLevels?.飛行,u?.status?.飛行,u?.飛行,0]:[u?.status?.[k],u?.[k]];if(k==="移動")vals.push(u?.move,u?.movement,u?.moveRange);for(const v of vals)if(Number.isFinite(Number(v)))return Math.round(Number(v));return "-";}

const profRows=computed(()=>{
  const u=member.value;if(!u)return[];const src=[u?.skillLevels,u?.proficiencies,u?.skillLevelMap,u?.status];const out=[];
  for(const k of PROF.filter(key=>key!=="飛行")){for(const s of src){if(s&&Number.isFinite(Number(s[k]))){out.push([k,Math.round(Number(s[k]))]);break;}}}return out;
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
</script>

<template>
<section class="fs-panel">
  <nav class="fs-tabs" aria-label="ユニット操作カテゴリ">
    <button v-for="t in tabs" :key="t[0]" type="button" :class="{active:activeTab===t[0]}" @click.stop="selectTab(t[0])">{{t[1]}}</button>
  </nav>
  <div :key="activeTab" class="fs-body">
    <section v-if="activeTab==='action'" class="fs-battle">
      <template v-if="member">
        <div class="fs-detail-head fs-action-head"><div><strong>{{member.name||'キャラ'}}</strong><small>{{coord(member)}}</small></div><button type="button" @click.stop="selectTab('info')">情報へ</button></div>
        <div class="fs-actions">
          <button @click="move">➜<span>移動</span></button>
          <button class="danger" @click="attack">⚔<span>攻撃</span></button>
          <button disabled title="待機処理は未接続">◼<span>待機</span></button>
        </div>
        <div class="fs-battle-grid">
          <div class="fs-tech fs-scroll"><button v-for="t in techRows" :key="t.name" :class="{active:tech?.name===t.name}" @click="techName=t.name"><strong>{{t.name}}</strong><small>{{techMeta(t)||'-'}}</small></button><p v-if="!techRows.length" class="fs-empty">使用可能な技がありません。</p></div>
          <aside class="fs-battle-side"><div class="fs-ap"><span>AP</span><b>{{ap(member)[0]}} / {{ap(member)[1]}}</b></div><button class="primary" :disabled="!tech" @click="useTech">使用</button><div class="fs-enemies fs-scroll"><button v-for="e in enemies" :key="unitId(e)" :class="{active:unitId(e)===unitId(enemy)}" @click="enemyId=unitId(e)"><span>{{e.name||'敵'}}</span><small>HP {{hp(e)[0]}}/{{hp(e)[1]}}</small></button></div></aside>
        </div>
      </template>
      <p v-else class="fs-empty">情報からユニットを選択してください。</p>
    </section>

    <section v-else-if="activeTab==='info'" class="fs-squad">
      <div v-if="squads.length" class="fs-squad-picker"><button v-for="s in squads" :key="s.key" :class="{active:squad?.key===s.key}" @click="chooseSquad(s.key)"><b>{{s.label}}</b><small>{{s.members.length}}体</small></button></div>
      <div v-if="squad" class="fs-split">
        <div class="fs-list">
          <button v-for="u in squad.members" :key="unitId(u)" class="fs-member" :class="{active:unitId(u)===unitId(member)}" @click="chooseMember(u)">
            <div class="fs-mhead">
              <span class="fs-avatar fs-level-badge" :title="`${text(u?.race)||'種族不明'} / Lv${level(u)}`" :aria-label="`${text(u?.race)||'種族不明'} Lv${level(u)}`">
                <img v-if="raceIconSrc(u)" :src="raceIconSrc(u)" :alt="`${text(u?.race)||'種族不明'} アイコン`"/>
                <b v-else class="fs-avatar-fallback">{{text(u?.race).slice(0,1)||text(u.name).slice(0,1)||'兵'}}</b>
                <span class="fs-avatar-level">Lv{{level(u)}}</span>
              </span>
              <strong>{{u.name||'キャラ'}}</strong><small>{{coord(u)}}</small>
            </div>
            <div class="fs-vital"><span>HP</span><b>{{hp(u)[0]}} / {{hp(u)[1]}}</b></div><div class="fs-vital ap"><span>AP</span><b>{{ap(u)[0]}} / {{ap(u)[1]}}</b></div>
          </button>
        </div>
        <div class="fs-detail" v-if="member">
          <div class="fs-detail-head"><div><strong>{{member.name||'キャラ'}}</strong><small>{{coord(member)}}</small></div><button type="button" @click.stop="selectTab('action')">行動へ</button></div>
          <h3>ステータス</h3><div class="fs-stats"><div v-for="s in STATUS" :key="s[0]"><span>{{s[1]}}</span><b>{{stat(member,s[0])}}</b></div></div>
          <h3>技能</h3><div v-if="profRows.length" class="fs-prof"><div v-for="p in profRows" :key="p[0]"><span>{{p[0]}}</span><b>{{p[1]}}</b></div></div><p v-else class="fs-empty">技能データなし</p>
          <h3>スキル</h3><div v-if="techRows.length" class="fs-tech"><button v-for="t in techRows" :key="t.name" :class="{active:tech?.name===t.name}" @click="techName=t.name"><strong>{{t.name}}</strong><small>{{techMeta(t)||'詳細データなし'}}</small></button></div><p v-else class="fs-empty">取得スキルなし</p>
        </div>
      </div><p v-else class="fs-empty">このマスに自軍キャラクターはいません。</p>
    </section>

    <section v-else class="fs-interaction fs-scroll">
      <template v-if="member">
        <div class="fs-detail-head"><div><strong>{{member.name||'キャラ'}}</strong><small>{{coord(member)}}</small></div><button type="button" @click.stop="selectTab('info')">情報へ</button></div>
        <div class="fs-interaction-empty">現在利用できる交流はありません。</div>
      </template>
      <p v-else class="fs-empty">情報からユニットを選択してください。</p>
    </section>
  </div>
</section>
</template>

<style scoped>
.fs-panel{--line:#34464c;--active:#70d1df;--muted:#91a2a6;position:relative;z-index:42;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;color:#edf3f2;background:linear-gradient(180deg,rgba(16,27,32,.98),rgba(9,16,20,.98));border:1px solid #53686f;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr);font-size:var(--font-size-14);box-shadow:-4px 0 18px #0006}.fs-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:5px 6px;border-bottom:1px solid var(--line)}.fs-tabs button{min-width:0;min-height:36px;border:1px solid #3b4b50;border-radius:7px;background:#142126;color:#cad5d5;font-weight:700;font-size:var(--font-secondary)}.fs-tabs button.active{border-color:var(--active);background:#183f49;color:#fff}.fs-body{min-height:0;overflow:hidden;padding:6px}.fs-scroll,.fs-list,.fs-detail{min-height:0;overflow:auto;scrollbar-width:none;overscroll-behavior:contain}.fs-scroll::-webkit-scrollbar,.fs-list::-webkit-scrollbar,.fs-detail::-webkit-scrollbar,.fs-squad-picker::-webkit-scrollbar{display:none}.fs-squad{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:6px}.fs-squad-picker{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none}.fs-squad-picker button{flex:0 0 auto;min-width:100px;min-height:38px;border:1px solid #405158;border-radius:8px;background:#132026;color:#e8efee;padding:5px 9px;display:flex;justify-content:space-between;gap:8px;align-items:center}.fs-squad-picker button.active{border-color:var(--active);background:#18343b}.fs-squad-picker small{color:var(--muted)}.fs-split{min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:6px;overflow:hidden}.fs-list{display:grid;align-content:start;gap:6px}.fs-member{border:1px solid var(--line);border-radius:9px;background:#111b20;color:#edf3f2;padding:7px;text-align:left;display:grid;gap:4px}.fs-member.active{border-color:var(--active);background:#163039}.fs-mhead{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;align-items:center}.fs-avatar{width:42px;height:42px;border:1px solid #4a5b61;border-radius:7px;background:#222d31;display:grid;place-items:center;overflow:hidden;position:relative;isolation:isolate}.fs-avatar img{width:100%;height:100%;object-fit:cover}.fs-avatar-fallback{font-size:18px;opacity:.7}.fs-avatar::after{content:"";position:absolute;left:0;right:0;bottom:0;height:36%;z-index:1;background:linear-gradient(180deg,transparent,rgba(3,10,13,.45));pointer-events:none}.fs-avatar-level{position:absolute;left:1px;right:1px;bottom:1px;z-index:2;color:#fff;text-align:center;font-size:13px;font-weight:800;line-height:1.25;text-shadow:0 1px 2px #000,0 0 3px #000;white-space:nowrap}.fs-mhead strong{font-size:var(--font-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-mhead small,.fs-detail-head small{font-size:var(--font-size-10);color:var(--muted)}.fs-vital{display:flex;justify-content:space-between;font-size:var(--font-size-11);color:#a9b8ba}.fs-vital b{color:#eef3f2}.fs-vital.ap b{color:#75c9f3}.fs-detail{display:grid;align-content:start;gap:6px;padding-bottom:8px}.fs-detail-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:6px}.fs-detail-head>div{display:grid}.fs-detail-head button{min-height:32px;border:1px solid #4c656c;border-radius:7px;background:#1d3036;color:#eef3f2}.fs-detail h3{margin:3px 0 0;font-size:var(--font-size-11);color:#cad5d5;border-left:3px solid #66c5d2;padding-left:6px}.fs-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.fs-stats div,.fs-prof div{border:1px solid #314247;border-radius:7px;background:#132025;padding:5px}.fs-stats span,.fs-prof span{display:block;font-size:var(--font-size-9);color:var(--muted)}.fs-stats b,.fs-prof b{font-size:var(--font-secondary)}.fs-prof{display:grid;grid-template-columns:repeat(2,1fr);gap:4px}.fs-prof div{display:flex;justify-content:space-between}.fs-tech{display:grid;gap:4px}.fs-tech button{border:1px solid #3a4b51;border-radius:7px;background:#121d22;color:#edf3f2;padding:7px;text-align:left;display:grid;gap:2px}.fs-tech button.active{border-color:#d8b968;background:#292617}.fs-tech strong{font-size:var(--font-size-11)}.fs-tech small{font-size:var(--font-size-9);color:#9badb0}.fs-empty{margin:6px;color:#8fa1a4;font-size:var(--font-size-11)}.fs-battle{height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:6px}.fs-action-head{min-height:32px}.fs-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.fs-actions button{min-height:42px;border:1px solid #3e555b;border-radius:8px;background:#173139;color:#eef3f2;font-size:var(--font-size-18)}.fs-actions button:disabled{opacity:.45;cursor:not-allowed}.fs-actions span{display:block;font-size:var(--font-size-10)}.fs-actions .danger{background:#472426;border-color:#865054}.fs-battle-grid{min-height:0;display:grid;grid-template-columns:1.6fr .8fr;gap:6px}.fs-battle-side{min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:6px}.fs-ap{border:1px solid var(--line);border-radius:7px;background:#132025;padding:7px;display:flex;justify-content:space-between}.fs-battle-side>.primary{min-height:38px;border:1px solid #9a8244;border-radius:8px;background:#6c5727;color:#fff}.fs-battle-side>.primary:disabled{opacity:.45}.fs-enemies{display:grid;align-content:start;gap:4px}.fs-enemies button{border:1px solid #583c40;border-radius:7px;background:#24181b;color:#f0dddd;padding:6px;text-align:left;display:grid}.fs-enemies button.active{border-color:#d47a7f}.fs-enemies small{font-size:var(--font-size-9);color:#bc989b}.fs-interaction{height:100%;min-height:0;display:grid;align-content:start;gap:8px}.fs-interaction-empty{border:1px solid var(--line);border-radius:8px;background:#121d22;color:#9badb0;padding:12px;font-size:var(--font-size-11)}
@media (max-width:520px) and (orientation:portrait){.fs-tabs button{font-size:var(--font-compact)}.fs-stats{grid-template-columns:repeat(2,1fr)}.fs-split{gap:4px}.fs-member{padding:5px}.fs-avatar{width:40px;height:40px}}
</style>
