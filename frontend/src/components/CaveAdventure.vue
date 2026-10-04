<script setup>
import {ref} from "vue";
import {V39_CAVE_TEMPLATES} from "../lib/v39-cave-generator.js";
import {caveRaceOptions,caveClassOptions,defaultCaveProfiles} from "../lib/v39-cave-adventure.js";
import {startV39CaveTest} from "../v39/core/v39-cave-world.js";
const emit=defineEmits(["started"]);
const profiles=ref(defaultCaveProfiles()),seed=ref("expedition-1"),templateId=ref("random"),error=ref("");
const hasUnits=!!window.getV39ActiveFactionState?.()?.units?.length;
function start(){try{startV39CaveTest(profiles.value,{seed:seed.value,templateId:templateId.value});emit("started");}catch(cause){error.value=cause.message;}}
</script>
<template><div class="cave-setup"><form class="cave-party-creation" @submit.prevent="start">
      <p>{{hasUnits?"選択中の部隊で洞窟へ入ります。":"3人を通常ゲームのユニットとして作成します。"}}</p>
      <div v-if="!hasUnits" class="cave-profile-grid">
        <fieldset v-for="(profile,index) in profiles" :key="index"><legend>キャラクター{{ index+1 }}</legend>
          <label>名前<input v-model="profile.name" required maxlength="30" :aria-label="`名前${index+1}`"></label>
          <label>種族<select v-model="profile.race" :aria-label="`種族${index+1}`"><option v-for="row in caveRaceOptions" :key="row.key" :value="row.key">{{ row.name }}</option></select></label>
          <label>クラス<select v-model="profile.className" :aria-label="`クラス${index+1}`"><option v-for="row in caveClassOptions" :key="row.名前" :value="row.名前">{{ row.ルビ || row.名前 }}</option></select></label>
          <label>初期Lv<input v-model.number="profile.level" type="number" min="1" max="50" required :aria-label="`初期Lv${index+1}`"></label>
        </fieldset>
      </div>
      <div class="cave-settings"><label>形状<select v-model="templateId"><option value="random">ランダム</option><option v-for="row in V39_CAVE_TEMPLATES" :key="row.id" :value="row.id">{{ row.名前 }}</option></select></label><label>シード<input v-model="seed" required maxlength="100"></label><button type="submit">探索開始</button></div>
    </form><p v-if="error" role="alert">{{error}}</p></div></template>
<style scoped>
.cave-profile-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cave-profile-grid fieldset{min-width:0}.cave-profile-grid label,.cave-settings label{display:grid;gap:4px}.cave-settings{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}button,input,select{font:inherit;color:inherit;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:6px;min-width:0}[role=alert]{color:#ffb199}@media(max-width:700px){.cave-profile-grid{grid-template-columns:1fr}}
</style>
