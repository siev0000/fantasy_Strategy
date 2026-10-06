<script setup>
import {computed,ref,watch} from "vue";
import {V39_CAVE_TEMPLATES} from "../lib/v39-cave-generator.js";
import {caveRaceOptions,caveClassOptions} from "../lib/v39-cave-adventure.js";
import {resolveV39UnitRaceCategory} from "../lib/v39-unit-experience.js";
import {startV39CaveTest} from "../v39/core/v39-cave-world.js";

const emit=defineEmits(["started"]);
const categoryOptions=Object.freeze([
  Object.freeze({key:"human",name:"人族",partySize:3,startLevel:10}),
  Object.freeze({key:"demi",name:"亜人",partySize:2,startLevel:13}),
  Object.freeze({key:"demon",name:"魔族",partySize:1,startLevel:17})
]);
const defaultClasses=["ファイター","アーチャー","クレリック"];
const startCategory=ref("human"),activeProfileIndex=ref(0),seed=ref(""),templateId=ref("random"),error=ref("");
const hasUnits=!!window.getV39ActiveFactionState?.()?.units?.length;

function categoryRule(key=startCategory.value){return categoryOptions.find(row=>row.key===key)||categoryOptions[0];}
function racesForCategory(key=startCategory.value){return caveRaceOptions.filter(row=>resolveV39UnitRaceCategory({race:row.key})===categoryRule(key).key);}
function buildProfiles(key=startCategory.value){
  const rule=categoryRule(key),races=racesForCategory(key);
  if(!races.length)return [];
  return Array.from({length:rule.partySize},(_,index)=>{
    const race=races[index%races.length];
    const preferredClass=defaultClasses[index]||defaultClasses[0];
    return {
      name:`探索者${index+1}`,
      race:race.key,
      className:caveClassOptions.find(row=>row.名前===preferredClass)?.名前||caveClassOptions[0]?.名前||"",
      // 洞窟へ来られる段階を想定したテスト開始値。最終調整前なので画面から変更できる。
      level:rule.startLevel
    };
  });
}

const profiles=ref(buildProfiles());
const activeRule=computed(()=>categoryRule());
const availableRaces=computed(()=>racesForCategory());
function selectCategory(key){startCategory.value=key;}
watch(startCategory,key=>{
  profiles.value=buildProfiles(key);
  activeProfileIndex.value=0;
  error.value="";
});
function start(){
  try{
    if(!hasUnits&&profiles.value.length!==activeRule.value.partySize)throw new Error(`${activeRule.value.name}は${activeRule.value.partySize}人で探索を開始します。`);
    startV39CaveTest(profiles.value,{seed:seed.value,templateId:templateId.value});
    emit("started");
  }catch(cause){error.value=cause.message;}
}
</script>

<template>
  <div class="cave-setup">
    <form class="cave-party-creation" @submit.prevent="start">
      <p v-if="hasUnits">選択中の部隊で洞窟へ入ります。</p>
      <template v-else>
        <div class="cave-category-section">
          <div class="cave-section-head">
            <strong>探索する種族系統</strong>
            <small>系統で開始人数と基準Lvが決まります</small>
          </div>
          <div class="cave-category-grid" role="radiogroup" aria-label="洞窟探索の種族系統">
            <button v-for="row in categoryOptions" :key="row.key" type="button" role="radio"
              :aria-checked="startCategory===row.key" :class="['cave-category-button',{active:startCategory===row.key}]" @click="selectCategory(row.key)">
              <strong>{{ row.name }}</strong>
              <span>{{ row.partySize }}人 / Lv{{ row.startLevel }}</span>
            </button>
          </div>
          <p class="cave-category-summary"><strong>{{ activeRule.name }}</strong>で開始：{{ activeRule.partySize }}人 / 基準Lv{{ activeRule.startLevel }}</p>
        </div>

        <div class="cave-unit-tabs" role="tablist" aria-label="洞窟探索ユニット">
          <button v-for="(profile,index) in profiles" :key="index" type="button" role="tab"
            :aria-selected="activeProfileIndex===index" :class="{active:activeProfileIndex===index}" @click="activeProfileIndex=index">
            <span>ユニット{{ index+1 }}</span><small>{{ profile.name || `探索者${index+1}` }} / Lv{{ profile.level }}</small>
          </button>
        </div>
        <div class="cave-profile-panel" role="tabpanel">
          <fieldset v-if="profiles[activeProfileIndex]">
            <legend>ユニット{{ activeProfileIndex+1 }}</legend>
            <label>名前<input v-model="profiles[activeProfileIndex].name" required maxlength="30" :aria-label="`名前${activeProfileIndex+1}`"></label>
            <label>具体種族<select v-model="profiles[activeProfileIndex].race" :aria-label="`種族${activeProfileIndex+1}`"><option v-for="row in availableRaces" :key="row.key" :value="row.key">{{ row.name }}</option></select></label>
            <label>クラス<select v-model="profiles[activeProfileIndex].className" :aria-label="`クラス${activeProfileIndex+1}`"><option v-for="row in caveClassOptions" :key="row.名前" :value="row.名前">{{ row.ルビ || row.名前 }}</option></select></label>
            <label>初期Lv<input v-model.number="profiles[activeProfileIndex].level" type="number" min="1" max="120" required :aria-label="`初期Lv${activeProfileIndex+1}`"></label>
          </fieldset>
        </div>
      </template>
      <div class="cave-settings"><label>形状<select v-model="templateId"><option value="random">ランダム</option><option v-for="row in V39_CAVE_TEMPLATES" :key="row.id" :value="row.id">{{ row.名前 }}</option></select></label><label>シード<input v-model="seed" placeholder="空欄で毎回ランダム" maxlength="100"></label></div>
      <div class="cave-start-bar"><p v-if="error" role="alert">{{error}}</p><button class="cave-start-button" type="submit">探索開始</button></div>
    </form>
  </div>
</template>

<style scoped>
.cave-party-creation{display:grid;gap:12px}.cave-party-creation>p{margin:0}.cave-category-section{display:grid;gap:8px}.cave-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.cave-section-head small{color:#9fb0b2;font-size:var(--font-secondary)}.cave-category-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.cave-category-button{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:58px;padding:10px;text-align:left}.cave-category-button strong{align-self:center}.cave-category-button span{align-self:center;font-weight:700;color:#dbe7e8}.cave-category-button.active{border-color:#82d9e8;background:#24404a;box-shadow:inset 0 0 0 1px #82d9e8}.cave-category-summary{margin:0;padding:7px 9px;border:1px solid #3c555c;border-radius:6px;background:#15252a;color:#c8d7d9}.cave-unit-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.cave-unit-tabs button{display:grid;gap:2px;text-align:center}.cave-unit-tabs button.active{border-color:#82d9e8;background:#24404a;box-shadow:inset 0 0 0 1px #82d9e8}.cave-unit-tabs small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b8c8c9;font-size:var(--font-secondary)}.cave-profile-panel fieldset{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0;margin:0}.cave-profile-panel label,.cave-settings label{display:grid;gap:4px}.cave-settings{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:4px}.cave-settings label{flex:1;min-width:140px}.cave-start-bar{position:sticky;bottom:0;z-index:3;display:grid;gap:6px;margin:0 -2px -2px;padding:10px 2px 2px;background:linear-gradient(to bottom,rgba(13,23,26,0),var(--panel) 34%)}.cave-start-bar [role=alert]{margin:0}.cave-start-button{width:100%;min-height:44px;font-weight:700;border-color:#82d9e8;background:#24404a}button,input,select{font:inherit;color:inherit;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:8px;min-width:0}button{cursor:pointer}[role=alert]{color:#ffb199}@media(max-width:700px){.cave-section-head{display:grid;gap:2px}.cave-category-grid{gap:5px}.cave-category-button{min-height:58px;padding:8px 6px}.cave-profile-panel fieldset{grid-template-columns:1fr}.cave-unit-tabs{grid-template-columns:repeat(auto-fit,minmax(90px,1fr))}.cave-unit-tabs button{padding:8px 4px}.cave-unit-tabs small{font-size:10px}.cave-settings{display:grid;grid-template-columns:1fr}.cave-settings label{min-width:0}}
</style>
