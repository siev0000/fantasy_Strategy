<script setup>
import {ref} from "vue";
import {V39_CAVE_TEMPLATES} from "../lib/v39-cave-generator.js";
import {caveRaceOptions,caveClassOptions,defaultCaveProfiles} from "../lib/v39-cave-adventure.js";
import {startV39CaveTest} from "../v39/core/v39-cave-world.js";
const emit=defineEmits(["started"]);
const profiles=ref(defaultCaveProfiles()),activeProfileIndex=ref(0),seed=ref("expedition-1"),templateId=ref("random"),error=ref("");
const hasUnits=!!window.getV39ActiveFactionState?.()?.units?.length;
function start(){try{startV39CaveTest(profiles.value,{seed:seed.value,templateId:templateId.value});emit("started");}catch(cause){error.value=cause.message;}}
</script>
<template><div class="cave-setup"><form class="cave-party-creation" @submit.prevent="start">
      <p>{{hasUnits?"選択中の部隊で洞窟へ入ります。":"3人を通常ゲームのユニットとして作成します。ユニットタブを切り替えて設定してください。"}}</p>
      <template v-if="!hasUnits">
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
            <label>種族<select v-model="profiles[activeProfileIndex].race" :aria-label="`種族${activeProfileIndex+1}`"><option v-for="row in caveRaceOptions" :key="row.key" :value="row.key">{{ row.name }}</option></select></label>
            <label>クラス<select v-model="profiles[activeProfileIndex].className" :aria-label="`クラス${activeProfileIndex+1}`"><option v-for="row in caveClassOptions" :key="row.名前" :value="row.名前">{{ row.ルビ || row.名前 }}</option></select></label>
            <label>初期Lv<input v-model.number="profiles[activeProfileIndex].level" type="number" min="1" max="50" required :aria-label="`初期Lv${activeProfileIndex+1}`"></label>
          </fieldset>
        </div>
      </template>
      <div class="cave-settings"><label>形状<select v-model="templateId"><option value="random">ランダム</option><option v-for="row in V39_CAVE_TEMPLATES" :key="row.id" :value="row.id">{{ row.名前 }}</option></select></label><label>シード<input v-model="seed" required maxlength="100"></label></div>
      <div class="cave-start-bar"><p v-if="error" role="alert">{{error}}</p><button class="cave-start-button" type="submit">探索開始</button></div>
    </form></div></template>
<style scoped>
.cave-party-creation{display:grid;gap:10px}.cave-party-creation>p{margin:0}.cave-unit-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.cave-unit-tabs button{display:grid;gap:2px;text-align:center}.cave-unit-tabs button.active{border-color:#82d9e8;background:#24404a;box-shadow:inset 0 0 0 1px #82d9e8}.cave-unit-tabs small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b8c8c9;font-size:var(--font-secondary)}.cave-profile-panel fieldset{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0;margin:0}.cave-profile-panel label,.cave-settings label{display:grid;gap:4px}.cave-settings{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:4px}.cave-settings label{flex:1;min-width:140px}.cave-start-bar{position:sticky;bottom:0;z-index:3;display:grid;gap:6px;margin:0 -2px -2px;padding:10px 2px 2px;background:linear-gradient(to bottom,rgba(13,23,26,0),var(--panel) 34%)}.cave-start-bar [role=alert]{margin:0}.cave-start-button{width:100%;min-height:44px;font-weight:700;border-color:#82d9e8;background:#24404a}button,input,select{font:inherit;color:inherit;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:8px;min-width:0}[role=alert]{color:#ffb199}@media(max-width:700px){.cave-profile-panel fieldset{grid-template-columns:1fr}.cave-unit-tabs button{padding:8px 4px}.cave-unit-tabs small{font-size:10px}.cave-settings{display:grid;grid-template-columns:1fr}.cave-settings label{min-width:0}}
</style>
