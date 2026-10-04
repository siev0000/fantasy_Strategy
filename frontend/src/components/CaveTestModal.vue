<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { V39_CAVE_TEMPLATES, generateV39CaveMap, populateV39CaveMonsters, findV39CavePath } from "../lib/v39-cave-generator.js";
import { createV39EventEnemy, getV39EnemySpawnDefinitions } from "../v39/ai/v39-enemy-spawn.js";
import { resolveMonsterSheetArtwork } from "../lib/monster-sheet-artwork.js";
import CaveAdventure from "./CaveAdventure.vue";

const props = defineProps({show:Boolean});
const dialogElement = ref(null);
const adventureMode = ref(false);
const emit = defineEmits(["close","started"]);
const seed = ref("cave-1"), templateId = ref("random"), entranceCount = ref(2);
const map = ref(null), enemies = ref([]), hero = ref(null), selectedEnemy = ref(null), route = ref([]), error = ref("");
const routeKeys = computed(()=>new Set(route.value.map(tile=>tile.key)));
const enemyByTile = computed(()=>new Map(enemies.value.map(enemy=>[`${enemy.x},${enemy.y}`,enemy])));
const entrancesByTile = computed(()=>new Map((map.value?.entrances||[]).map((entry,index)=>[entry.key,index+1])));
const cells = computed(()=>map.value?.grid.flatMap((row,y)=>row.map((terrain,x)=>({x,y,key:`${x},${y}`,terrain}))) || []);
const radius = 18, stepX = Math.sqrt(3)*radius, stepY = radius*1.5;
const center = tile => ({x:radius+tile.x*stepX+(tile.y%2?stepX/2:0),y:radius+tile.y*stepY});
const polygon = tile => Array.from({length:6},(_,i)=>{const angle=(i*60-30)*Math.PI/180,c=center(tile);return `${c.x+radius*Math.cos(angle)},${c.y+radius*Math.sin(angle)}`;}).join(" ");
const viewBox = computed(()=>`0 0 ${(map.value?.w||1)*stepX+radius*2} ${(map.value?.h||1)*stepY+radius*2}`);
const routeLine = computed(()=>route.value.map(tile=>{const c=center(tile);return `${c.x},${c.y}`;}).join(" "));

function generate() {
  try {
    const next = generateV39CaveMap({seed:seed.value,templateId:templateId.value,entranceCount:Number(entranceCount.value)});
    const spawned = populateV39CaveMonsters(next,getV39EnemySpawnDefinitions("洞窟"),createV39EventEnemy);
    map.value=next; enemies.value=spawned; hero.value={...next.entrances[0]}; selectedEnemy.value=null; route.value=[]; error.value="";
  } catch (cause) { error.value=cause.message; }
}
function selectTile(tile) {
  const enemy=enemyByTile.value.get(tile.key);
  if (enemy) { selectedEnemy.value=enemy; return; }
  if (tile.terrain !== "洞窟") return;
  const path=findV39CavePath(map.value,hero.value,tile,[...enemyByTile.value.keys()]);
  if (!path.length) { error.value="敵に通路を塞がれています。別の通路を選択してください。"; return; }
  hero.value={...tile}; route.value=path; selectedEnemy.value=null; error.value="";
}
function monsterStyle(enemy) {
  const art=resolveMonsterSheetArtwork(enemy);
  if (!art) return {};
  const frame=art.sheetFrame;
  return {backgroundImage:`url("${art.src}")`,backgroundSize:`${frame.columns*100}% ${frame.rows*100}%`,backgroundPosition:`${frame.column/(frame.columns-1)*100}% ${frame.row/(frame.rows-1)*100}%`};
}
function close() { map.value=null; enemies.value=[]; emit("close"); }
watch(()=>props.show,show=>{if(show){generate();nextTick(()=>dialogElement.value?.focus());}},{immediate:true});
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="cave-test-overlay" @keydown.esc="close">
      <section ref="dialogElement" class="cave-test-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="cave-test-title">
        <header><h2 id="cave-test-title">洞窟生成テスト</h2><button type="button" @click="close">開始画面に戻る</button></header>
        <div class="cave-test-modes"><button type="button" :disabled="!adventureMode" @click="adventureMode=false">生成確認</button><button type="button" :disabled="adventureMode" @click="adventureMode=true">探索ゲーム</button></div>
        <CaveAdventure v-if="adventureMode" @started="emit('started')" />
        <form v-if="!adventureMode" class="cave-test-controls" @submit.prevent="generate">
          <label>形状<select v-model="templateId"><option value="random">ランダム</option><option v-for="row in V39_CAVE_TEMPLATES" :key="row.id" :value="row.id">{{ row.名前 }}</option></select></label>
          <label>シード<input v-model="seed" required aria-label="洞窟シード"></label>
          <label>出入口<select v-model="entranceCount"><option v-for="n in [2,3,4]" :key="n" :value="n">{{ n }}か所</option></select></label>
          <button type="submit">生成</button>
        </form>
        <p v-if="error&&!adventureMode" role="alert">{{ error }}</p>
        <div v-if="map&&!adventureMode" class="cave-test-map">
          <svg :viewBox="viewBox" aria-label="洞窟マップ">
            <polygon v-for="tile in cells" :key="tile.key" :points="polygon(tile)" :data-cave-tile="tile.key" :data-terrain="tile.terrain"
              :tabindex="tile.terrain==='洞窟'?0:-1" :class="['cave-cell',{floor:tile.terrain==='洞窟',route:routeKeys.has(tile.key)}]" @click="selectTile(tile)" @keydown.enter="selectTile(tile)"><title>{{ tile.terrain }} ({{ tile.key }})</title></polygon>
            <polyline v-if="route.length" :points="routeLine" class="cave-route" />
            <g v-for="entry in map.entrances" :key="entry.key" class="cave-marker" :transform="`translate(${center(entry).x},${center(entry).y})`">
              <circle r="13" fill="#304e45" stroke="#8ee2b5" /><text text-anchor="middle" dy="5">{{ entrancesByTile.get(entry.key) }}</text>
            </g>
            <g v-for="enemy in enemies" :key="enemy.id" :data-cave-enemy="enemy.id" @click="selectTile({...enemy,key:`${enemy.x},${enemy.y}`,terrain:'洞窟'})">
              <circle :cx="center(enemy).x" :cy="center(enemy).y" r="15" fill="#643e3a" :stroke="selectedEnemy?.id===enemy.id?'#fff4a8':'#db8777'" />
              <foreignObject :x="center(enemy).x-16" :y="center(enemy).y-16" width="32" height="32"><div class="cave-monster-art" :style="monsterStyle(enemy)" /></foreignObject>
              <title>{{ enemy.name }} Lv{{ enemy.level }}</title>
            </g>
            <g v-if="hero" class="cave-marker" :transform="`translate(${center(hero).x},${center(hero).y})`"><circle r="9" fill="#83d9ec" stroke="#fff" /></g>
          </svg>
        </div>
        <footer v-if="map&&!adventureMode">
          <div><strong>{{ map.templateName }}</strong> · {{ map.w }}×{{ map.h }} · 敵{{ enemies.length }}体
            <p>青：操作位置 ／ 数字：出入口 ／ 赤：敵<br>通路を押すと移動、敵を押すとデータ表示。戦闘・地上への移動は未接続です。</p></div>
          <div v-if="selectedEnemy" data-cave-enemy-detail><strong>{{ selectedEnemy.name }} Lv{{ selectedEnemy.level }}</strong>
            <p>HP {{ selectedEnemy.hp }}/{{ selectedEnemy.maxHp }}<br>攻撃 {{ selectedEnemy.status?.攻撃 ?? '—' }} · 防御 {{ selectedEnemy.status?.防御 ?? '—' }}<br>{{ selectedEnemy.aggressive?'好戦的':'非好戦的' }}</p></div>
          <div v-else>現在位置：{{ hero?.x }},{{ hero?.y }}<span v-if="entrancesByTile.has(hero?.key)"> ／ 出入口{{ entrancesByTile.get(hero.key) }}</span></div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.cave-test-overlay{position:fixed;inset:0;z-index:10200;display:grid;place-items:center;padding:12px;background:rgba(2,8,11,.94);color:#e8efec;font-size:var(--font-body)}
.cave-test-dialog{width:min(1050px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid #526a70;border-radius:12px;background:linear-gradient(145deg,#17262b,#0d171a);overflow:auto}
header{display:flex;justify-content:space-between;align-items:center;gap:12px}h2{margin:0;font-size:var(--font-heading)}
.cave-test-modes{display:flex;gap:8px}.cave-test-modes button:disabled{border-color:#82d9e8;background:#24404a}
button,input,select{font:inherit;color:inherit;background:#15282e;border:1px solid #58777d;border-radius:6px;padding:8px;min-width:0}button{cursor:pointer}button:hover{border-color:#82d9e8}
.cave-test-controls{display:flex;flex-wrap:wrap;align-items:end;gap:10px}.cave-test-controls label{display:grid;gap:4px;flex:1;min-width:100px}.cave-test-controls input,.cave-test-controls select{width:100%}
.cave-test-map{min-height:150px;overflow:auto;background:radial-gradient(ellipse,#253139,#101a20);border:1px solid #3c5259;border-radius:8px}.cave-test-map svg{display:block;width:100%;min-width:520px;max-height:58dvh}
.cave-cell{fill:#29383e;stroke:#33464c;stroke-width:.7}.cave-cell.floor{fill:#7b7966;stroke:#a09c84;cursor:pointer}.cave-cell.floor:hover,.cave-cell.route{fill:#a6a088}
.cave-route{fill:none;stroke:#83d9ec;stroke-width:3;pointer-events:none}.cave-marker{pointer-events:none}.cave-marker text{fill:white;font-size:var(--font-size-14)}.cave-monster-art{width:32px;height:32px;background-repeat:no-repeat;cursor:pointer}
footer{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:var(--font-body)}footer p{margin:6px 0;color:#b8c8c9;font-size:var(--font-secondary);line-height:1.5}[role=alert]{color:#f5a391;margin:0}
@media(max-width:600px){.cave-test-dialog{padding:10px}header{align-items:start}header button{max-width:110px}footer{grid-template-columns:1fr}.cave-test-map svg{max-height:none}}
</style>
