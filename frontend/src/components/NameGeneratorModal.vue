<script setup>
import { computed, ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import { raceData, getGameDataRows } from "../lib/game-data-registry.js";
import { generateNameResults } from "../lib/name-generator.js";

const props = defineProps({ show: { type: Boolean, default: false } });
const emit = defineEmits(["close"]);
const races = Array.isArray(raceData) ? raceData.filter(row => row?.key) : [];
const dictionary = getGameDataRows("命名辞書");
const race = ref(races[0]?.key || "");
const gender = ref("共通");
const mode = ref("words");
const hasGenderSpecificWords = computed(() => dictionary.some(row => row?.種族 === race.value && row?.使用可 === true && ["男性系", "女性系"].includes(row?.性別傾向)));
const results = ref([]);
const feedback = ref("");
const allCopyText = computed(() => results.value.map((row, i) =>
  String(i + 1) + ". " + row.name + " — " + row.meaning
).join("\n"));

function generate(count) {
  results.value = generateNameResults({
    race:race.value, gender:gender.value, mode:mode.value,
    count, lexicon:dictionary, races
  });
  feedback.value = results.value.length === count
    ? ""
    : results.value.length
      ? "重複を避けたため、生成できたのは" + results.value.length + "件です。"
      : "この条件で使える名前データがありません。";
}
function updateChoices() {
  results.value = [];
  feedback.value = "";
}
async function copy(text) {
  try {
    if (!navigator?.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
    feedback.value = "コピーしました。";
  } catch {
    feedback.value = "コピーできませんでした。名前を選択してコピーしてください。";
  }
}
watch(() => props.show, value => { if (value) generate(1); });
</script>

<template>
  <base-modal :show="show" title="名前作成" subtitle="種族ごとの命名辞書から名前を自動生成" wide variant="v39" @close="emit('close')">
    <div class="name-generator">
      <div class="name-generator-filters">
        <label>種族
          <select v-model="race" @change="updateChoices">
            <option v-for="item in races" :key="item.key" :value="item.key">{{ item.name || item.key }}</option>
          </select>
        </label>
        <label>性別傾向
          <select v-model="gender" @change="updateChoices">
            <option value="共通">共通</option>
            <option value="男性系">男性系</option>
            <option value="女性系">女性系</option>
          </select>
        </label>
        <label>生成方式
          <select v-model="mode" @change="updateChoices">
            <option value="words">語根を組み合わせる</option>
            <option value="presets">既存の名前候補から選ぶ</option>
          </select>
        </label>
      </div>
      <p v-if="mode === 'words' && race === '竜人'" class="name-generator-note">竜人は個人名と氏族名を「・」で区切って表示します。</p>
      <p v-if="mode === 'words' && !hasGenderSpecificWords" class="name-generator-note">この種族の語はすべて共通のため、男性系・女性系の生成候補に違いはありません。</p>
      <div class="name-generator-actions">
        <button type="button" @click="generate(1)">1人生成</button>
        <button type="button" @click="generate(10)">10人まとめて生成</button>
        <button type="button" :disabled="!results.length" @click="copy(allCopyText)">結果をまとめてコピー</button>
        <button type="button" class="name-generator-close" @click="emit('close')">閉じる</button>
      </div>
      <p v-if="feedback" class="name-generator-feedback" role="status">{{ feedback }}</p>
      <div class="name-generator-results" aria-live="polite">
        <p v-if="!results.length" class="name-generator-empty">生成すると、名前と構成語の意味が表示されます。</p>
        <article v-for="(result, i) in results" :key="i + ':' + result.name" class="name-generator-result">
          <div class="name-generator-result-main">
            <span class="name-generator-index">{{ i + 1 }}.</span>
            <strong>{{ result.name }}</strong>
            <button type="button" class="name-generator-copy" @click="copy(result.name)">名前をコピー</button>
          </div>
          <div class="name-generator-meaning">{{ result.meaning }}</div>
          <div v-if="result.parts.length" class="name-generator-parts">
            <span v-for="(part, j) in result.parts" :key="j">{{ part.word }}＝{{ part.meaning }}</span>
          </div>
        </article>
      </div>
    </div>
  </base-modal>
</template>

<style scoped>
.name-generator { display:flex; flex-direction:column; height:100%; min-height:0; gap:12px; color:#edf3f2; }
.name-generator-filters { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.name-generator-filters label { display:grid; gap:6px; font-size:15px; font-weight:750; }
.name-generator-filters select { min-height:42px; width:100%; background:#13242a; color:#edf3f2; border:1px solid #45616a; border-radius:7px; padding:6px; font-size:15px; }
.name-generator-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.name-generator-actions button, .name-generator-copy { min-height:40px; border-radius:7px; border:1px solid #609fad; color:#edf3f2; background:#1a4b55; padding:7px 12px; cursor:pointer; font-size:15px; }
.name-generator-actions button:disabled { opacity:.45; cursor:not-allowed; }
.name-generator-actions .name-generator-close { margin-left:auto; background:#24373b; }
.name-generator-feedback { margin:0; color:#b9e6b8; font-size:15px; }
.name-generator-note { margin:0; color:#aacbd1; font-size:14px; line-height:1.5; }
.name-generator-results { flex:1; min-height:0; overflow:auto; display:grid; align-content:start; gap:9px; }
.name-generator-result { border:1px solid #344b52; border-radius:8px; padding:10px 12px; background:#122329; display:grid; gap:6px; }
.name-generator-result-main { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.name-generator-result-main strong { font-size:20px; overflow-wrap:anywhere; }
.name-generator-index { color:#aabfc3; font-variant-numeric:tabular-nums; }
.name-generator-copy { min-height:32px; margin-left:auto; font-size:14px; }
.name-generator-meaning { color:#cce5ea; font-size:16px; }
.name-generator-parts { display:flex; gap:6px 16px; flex-wrap:wrap; font-size:15px; color:#93b6bf; }
.name-generator-empty { color:#93a4a7; padding:24px; text-align:center; }
@media (max-width:700px) {
  .name-generator-filters { grid-template-columns:1fr; gap:8px; }
  .name-generator-actions button { flex:1; }
  .name-generator-actions .name-generator-close { margin-left:0; }
  .name-generator-result-main strong { font-size:18px; }
}
</style>
