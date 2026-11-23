<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {
  applyV39FixedMapTerrain, buildV39FixedMapStart, createV39FixedMap, fixedMapCanPlace, fixedMapClasses, inspectV39FixedMapPlacement, placeV39FixedMapObject,
  getV39FixedMapRemovableObjects, removeV39FixedMapObject,
  fixedMapRaces, fixedMapResources, getV39FixedMapRange,
  fixedMapTerrains, fixedMapTileCoords, fixedMapTileKey, FIXED_MAP_MIN, FIXED_MAP_MAX, parseV39FixedMap,
  validateV39FixedMap
} from '../lib/v39-fixed-map.js';

const emit = defineEmits(['close', 'start']);
const importFile = ref(null);
const map = ref(createV39FixedMap());
const width = ref(map.value.w);
const height = ref(map.value.h);
const brush = ref('平地');
const activeFaction = ref('');
const footerTab = ref('map');
const rangeMode = ref(false);
const rangeStart = ref(null);
const rangeEnd = ref(null);
const pendingUnit = ref(null);
const rangeTiles = computed(() => rangeStart.value ? getV39FixedMapRange(rangeStart.value,rangeEnd.value ?? rangeStart.value) : []);
const selected = ref({x:0,y:0});
const selectedKey = computed(() => fixedMapTileKey(selected.value.x,selected.value.y));
const selectedTile = computed(() => map.value.tiles[selectedKey.value] ?? {});
const tools = ['地形','資源','勢力'];
const tool = ref('地形');
const form = ref({});
const editingFaction = ref('');
const status = ref('');
const errors = ref([]);
const dirty = ref(false);
const defaultRace = fixedMapRaces[0]?.key ?? '只人';
const terrain = computed(() => map.value.grid[selected.value.y][selected.value.x]);
const sceneInput = () => window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0]?.v39Input;

function highlightRange() {
  const tiles = rangeTiles.value;
  sceneInput()?.showActionTiles(tiles,tiles.map(({x,y}) => fixedMapTileKey(x,y)));
  window.__v39FieldRuntime?.game?.v39InvalidateRender?.();
}

function previewMap(reset = false) {
  const {mapData,...spatial} = buildV39FixedMapStart({
    ...map.value,name:map.value.name.trim() || '新しい固定マップ'
  },{editing:true});
  if (reset) {
    window.startV39FixedMapSession({mapData,...spatial},{editing:true});
    return;
  }
  const current = window.__v39FieldRuntime?.mapData;
  if (current && JSON.stringify(current.defenseStructures) !== JSON.stringify(mapData.defenseStructures)) {
    window.updateV39FieldData({...current,defenseStructures:mapData.defenseStructures},{reason:'fixed-map-walls'});
  }
  window.setV39GameState({...spatial,activePlayerId:activeFaction.value},{reason:'fixed-map-editing',returnState:false});
}

function updateTerrain() {
  const current = window.__v39FieldRuntime?.mapData;
  if (!current) return;
  window.updateV39FieldData({...current,grid:map.value.grid.map(row => [...row]),
    heightLevelMap:map.value.heightLevelMap.map(row => [...row])},{reason:'fixed-map-terrain'});
}

function onTileSelected({detail:tile}) {
  if (!tile || !map.value.grid[tile.y]?.[tile.x]) return;
  selected.value = {x:tile.x,y:tile.y};
  if (pendingUnit.value) {
    const key = fixedMapTileKey(tile.x,tile.y);
    const record = {...map.value.tiles[key]};
    if (record.unit || !fixedMapCanPlace(map.value.grid[tile.y][tile.x])) {
      report('配置できる空きマスを選んでください。');
      return;
    }
    record.unit = pendingUnit.value;
    pendingUnit.value = null;
    commitTile(record,key);
    return;
  }
  if (tool.value === '地形' && rangeMode.value && footerTab.value === 'map') {
    if (!rangeStart.value || rangeEnd.value) {
      rangeStart.value = selected.value;
      rangeEnd.value = null;
    } else rangeEnd.value = selected.value;
    highlightRange();
  }
}

function switchFaction(id) {
  activeFaction.value = id;
  editingFaction.value = id;
  if (pendingUnit.value) cancelUnit();
  window.cancelV39FixedMapBasePlacement?.();
  if (id) window.setV39ActivePlayer(id);
  resetForm();
}

function useFooter({detail:{tab}}) {
  if (footerTab.value === tab) return;
  footerTab.value = tab;
  if (tab !== 'map') clearRange();
}

function inspectPlacement(tile, placement) {
  return inspectV39FixedMapPlacement(map.value,activeFaction.value,tile,placement);
}

function placeObject(tile, placement) {
  const result = placeV39FixedMapObject(map.value,activeFaction.value,tile,placement);
  if (result.ok) {
    dirty.value = true;
    previewMap();
    report(`(${result.key}) に配置しました。`);
  }
  return result;
}

function getBaseDraft(neutral) {
  const faction = map.value.factions.find(row => row.id === activeFaction.value);
  if (!neutral && !faction) return null;
  return {name:neutral?'一般村':`${faction.name}の拠点`,population:50,
    ...(neutral?{race:faction?.race ?? defaultRace}:{factionId:faction.id})};
}

function removeObject(tile, kind) {
  const result = removeV39FixedMapObject(map.value,activeFaction.value,tile,kind);
  if (result.ok) {
    dirty.value = true;
    previewMap();
  }
  return result;
}

function clearRange() {
  rangeStart.value = null;
  rangeEnd.value = null;
  highlightRange();
}

function cancelUnit() {
  pendingUnit.value = null;
  report('配置を取り消しました。');
}

function queueUnit(unit) {
  if (!activeFaction.value) return false;
  pendingUnit.value = {...unit,factionId:activeFaction.value};
  window.activateV39FooterTab('squad');
  report('上のマップでユニットを配置するマスを選んでください。');
  return true;
}

function resetForm() {
  const tile = selectedTile.value;
  const faction = map.value.factions.find(row => row.id === editingFaction.value);
  form.value = {
    elevation:map.value.heightLevelMap[selected.value.y][selected.value.x],
    resource:tile.resource ?? '',
    factionName:faction?.name ?? '', factionRace:faction?.race ?? defaultRace,
    control:faction?.control ?? (map.value.factions.length ? 'npc' : 'human')
  };
}

function report(message, issues = []) {
  status.value = message;
  errors.value = issues;
}

function commitTile(next, key = selectedKey.value) {
  if (Object.keys(next).length) map.value.tiles[key] = next;
  else delete map.value.tiles[key];
  dirty.value = true;
  previewMap();
  report(`(${key}) を更新しました。`);
}

function applyTile() {
  const key = selectedKey.value;
  const tile = {...selectedTile.value};
  const values = form.value;
  switch (tool.value) {
    case '地形': {
      const tiles = rangeMode.value ? rangeTiles.value : [selected.value];
      if (!tiles.length || (rangeMode.value && !rangeEnd.value)) return report('マップで範囲の始点と終点を選んでください。');
      try {
        applyV39FixedMapTerrain(map.value,tiles,brush.value,rangeMode.value ? undefined : values.elevation);
        updateTerrain();
        dirty.value = true;
        report(`${tiles.length}マスの地形を変更しました。`);
      } catch (error) { report(error.message); }
      return;
    }
    case '資源':
      if (values.resource) tile.resource = values.resource;
      else delete tile.resource;
      break;
  }
  commitTile(tile);
}

function saveFaction() {
  const name = form.value.factionName.trim();
  if (!name) return report('勢力名を入力してください。');
  const faction = map.value.factions.find(row => row.id === editingFaction.value);
  const values = {name,race:form.value.factionRace,control:form.value.control};
  if (faction) Object.assign(faction,values);
  else {
    if (map.value.factions.length >= 16) return report('勢力は16件まで設定できます。');
    let number = map.value.factions.length + 1;
    while (map.value.factions.some(row => row.id === 'fixed-'+number)) number++;
    const id = 'fixed-'+number;
    map.value.factions.push({id,...values});
    editingFaction.value = id;
  }
  dirty.value = true;
  activeFaction.value = editingFaction.value;
  previewMap();
  report(`${name}を保存しました。`);
}

function deleteFaction() {
  const id = editingFaction.value;
  if (Object.values(map.value.tiles).some(tile => tile.base?.factionId === id || tile.unit?.factionId === id)) {
    return report('所属する拠点・ユニットを先に外してください。');
  }
  map.value.factions = map.value.factions.filter(row => row.id !== id);
  editingFaction.value = '';
  if (activeFaction.value === id) activeFaction.value = map.value.factions[0]?.id ?? '';
  dirty.value = true;
  previewMap();
  report('勢力を削除しました。');
}

function replaceMap(next) {
  map.value = next;
  selected.value = {x:0,y:0};
  width.value = next.w;
  height.value = next.h;
  activeFaction.value = next.factions.find(row => row.control === 'human')?.id ?? next.factions[0]?.id ?? '';
  editingFaction.value = activeFaction.value;
  pendingUnit.value = null;
  dirty.value = false;
  clearRange();
  resetForm();
  previewMap(true);
}

function makeMap(random) {
  if (dirty.value && !window.confirm('編集中の固定マップを置き換えますか？')) return;
  try {
    replaceMap(createV39FixedMap(width.value,height.value,{random,terrain:brush.value}));
    report('新しい地形を作成しました。');
  } catch (error) {
    report(error.message);
  }
}

async function readMap(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || (dirty.value && !window.confirm('編集中の固定マップを置き換えますか？'))) return;
  try {
    replaceMap(parseV39FixedMap(await file.text()));
    report('固定マップを読み込みました。');
  } catch (error) {
    report('読み込みに失敗しました。',error.message.split('\n'));
  }
}

function saveMap() {
  const issues = validateV39FixedMap(map.value);
  if (issues.length) return report('保存できません。',issues);
  const url = URL.createObjectURL(new Blob([JSON.stringify(map.value,null,2)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = (map.value.name.replace(/[<>:"/\\|?*]/g,'_') || '固定マップ')+'.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),0);
  dirty.value = false;
  report('固定マップをJSONに書き出しました。');
}

function startMap() {
  const issues = validateV39FixedMap(map.value,{starting:true});
  if (issues.length) return report('開始前に配置を確認してください。',issues);
  emit('start',JSON.parse(JSON.stringify(map.value)),error => report('開始できません。',error.message.split('\n')));
}

function close() {
  if (!dirty.value || window.confirm('保存していない変更を破棄しますか？')) emit('close');
}

function selectIssue(error) {
  const match = /^\((\d+,\d+)\)/.exec(error);
  if (!match) return;
  const [x,y] = fixedMapTileCoords(match[1]);
  if (x >= map.value.w || y >= map.value.h) return;
  selected.value = {x,y};
  sceneInput()?.selectTile({x,y},true,{notify:false});
}

watch([selectedKey,tool,editingFaction],resetForm,{immediate:true});
watch([tool,rangeMode],clearRange);
onMounted(() => {
  replaceMap(map.value);
  window.addEventListener('v39:tile-selected',onTileSelected);
  window.addEventListener('v39:footer-tab-changed',useFooter);
  window.addEventListener('v39:field-input-ready',highlightRange);
  window.queueV39FixedMapUnit = queueUnit;
  window.v39FixedMapPlacement = {inspect:inspectPlacement,place:placeObject,getBaseDraft,
    removable:tile => getV39FixedMapRemovableObjects(map.value,activeFaction.value,tile),remove:removeObject};
  window.getV39FixedMapUnitOptions = () => ({races:fixedMapRaces.map(row => row.key),classes:fixedMapClasses});
  window.activateV39FooterTab('map');
});
onUnmounted(() => {
  clearRange();
  window.removeEventListener('v39:tile-selected',onTileSelected);
  window.removeEventListener('v39:footer-tab-changed',useFooter);
  window.removeEventListener('v39:field-input-ready',highlightRange);
  delete window.queueV39FixedMapUnit;
  delete window.v39FixedMapPlacement;
  window.cancelV39FixedMapBasePlacement?.();
  delete window.getV39FixedMapUnitOptions;
});
</script>

<template>
  <Teleport to=".footer-tabs">
    <button type="button" class="footer-tab tappable footer-text-tab" data-foot="map" aria-label="マップ" :aria-pressed="footerTab==='map'">
      <span class="tab-text">マップ</span><span class="tab-icon" aria-hidden="true">▧</span>
    </button>
  </Teleport>
  <Teleport to=".footer-body">
    <div v-if="footerTab==='map' || pendingUnit" class="fixed-map-editor fixed-map-dock" :class="{'fixed-map-placement-message':footerTab!=='map'}">
    <section v-if="footerTab==='map'" class="fixed-map-controls" aria-label="固定マップ作成">
      <div class="fixed-map-bar">
        <strong>固定マップ作成</strong>
        <label>勢力 <select :value="activeFaction" @change="switchFaction($event.target.value)">
          <option v-if="!map.factions.length" value="">勢力なし</option>
          <option v-for="row in map.factions" :key="row.id" :value="row.id">{{ row.name }}{{ row.control==='npc' ? '（NPC）' : '' }}</option>
        </select></label>
        <button type="button" @click="tool='勢力'">勢力設定</button>
        <input ref="importFile" type="file" accept=".json,application/json" hidden @change="readMap">
        <button type="button" @click="importFile.click()">JSONを開く</button>
        <button type="button" @click="saveMap">JSON保存</button>
        <button type="button" class="fixed-map-start" @click="startMap">このマップで開始</button>
        <button type="button" aria-label="タイトルへ戻る" @click="close">戻る</button>
      </div>
      <details class="fixed-map-new">
        <summary>新規マップ・名前</summary>
        <div class="fixed-map-options">
          <label>マップ名 <input v-model="map.name" maxlength="80" @input="dirty=true"></label>
          <label>横 <input v-model.number="width" type="number" :min="FIXED_MAP_MIN" :max="FIXED_MAP_MAX"></label>
          <label>縦 <input v-model.number="height" type="number" :min="FIXED_MAP_MIN" :max="FIXED_MAP_MAX"></label>
          <button type="button" @click="makeMap(false)">{{ brush }}で新規</button>
          <button type="button" @click="makeMap(true)">ランダム下地</button>
        </div>
      </details>
    </section>
    <section v-if="footerTab==='map'" class="fixed-map-controls" aria-label="選択マスの編集">
      <div class="fixed-map-bar">
        <strong>選択マス ({{ selectedKey }}) · {{ terrain }}</strong>
        <small>{{ [selectedTile.base?.name,selectedTile.facility,selectedTile.unit?.name,selectedTile.resource].filter(Boolean).join(' / ') }}</small>
      </div>
      <div class="fixed-map-tools" role="group" aria-label="編集項目">
        <button v-for="label in tools" :key="label" type="button" :aria-pressed="tool===label" @click="tool=label">{{ label }}</button>
      </div>
      <form v-if="tool==='勢力'" class="fixed-map-options" @submit.prevent="saveFaction">
        <label>編集する勢力 <select v-model="editingFaction"><option value="">新規勢力</option>
          <option v-for="faction in map.factions" :key="faction.id" :value="faction.id">{{ faction.name }}</option>
        </select></label>
        <label>勢力名 <input v-model="form.factionName" required maxlength="80"></label>
        <label>種族 <select v-model="form.factionRace">
          <option v-for="race in fixedMapRaces" :key="race.key" :value="race.key">{{ race.name }}</option>
        </select></label>
        <label>操作 <select v-model="form.control"><option value="human">プレイヤー</option><option value="npc">NPC</option></select></label>
        <button type="submit">{{ editingFaction ? '勢力を更新' : '勢力を追加' }}</button>
        <button v-if="editingFaction" type="button" @click="deleteFaction">勢力を削除</button>
      </form>
      <form v-else class="fixed-map-options" @submit.prevent="applyTile">
        <template v-if="tool==='地形'">
          <label>地形 <select v-model="brush"><option v-for="row in fixedMapTerrains" :key="row.key">{{ row.key }}</option></select></label>
          <label><input v-model="rangeMode" type="checkbox">範囲選択</label>
          <label v-if="!rangeMode">高度 <input v-model.number="form.elevation" type="number" min="-100" max="100" required></label>
          <small v-if="rangeMode">{{ rangeEnd ? rangeTiles.length+'マス選択中' : rangeStart ? '終点を選択' : '始点を選択' }}</small>
          <button v-if="rangeStart" type="button" @click="clearRange">範囲を解除</button>
        </template>
        <label v-if="tool==='資源'">資源 <select v-model="form.resource"><option value="">なし</option>
          <option v-for="row in fixedMapResources" :key="row.名前">{{ row.名前 }}</option>
        </select></label>
        <button type="submit">{{ tool==='地形' && rangeMode ? '範囲に反映' : '選択マスに反映' }}</button>
      </form>
    </section>
    <footer class="fixed-map-footer">
      <button v-if="pendingUnit" type="button" @click="cancelUnit">配置を取り消す</button>
      <div>
        <output role="status">{{ status }}</output>
        <ul v-if="errors.length">
          <li v-for="(error,index) in errors" :key="index">
            <button v-if="/^\(\d+,\d+\)/.test(error)" type="button" @click="selectIssue(error)">{{ error }}</button>
            <span v-else>{{ error }}</span>
          </li>
        </ul>
      </div>
    </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.fixed-map-editor { color:#eef5f5; font-size:var(--font-body); }
.fixed-map-dock { position:relative; display:grid; gap:8px; padding:3px; }
.fixed-map-placement-message { background:#101c22; }
.fixed-map-new summary { cursor:pointer; }
.fixed-map-new .fixed-map-options { margin-top:5px; }
.fixed-map-bar,.fixed-map-options,.fixed-map-tools { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.fixed-map-options label { display:flex; align-items:center; gap:5px; min-width:0; }
.fixed-map-editor :is(button,input:not([type="checkbox"],[type="range"]),select) { min-height:32px; min-width:0; box-sizing:border-box; border:1px solid #52727b; border-radius:5px; padding:4px 7px; background:#162b33; color:#eef5f5; font:inherit; }
.fixed-map-editor select { max-width:100%; }
.fixed-map-editor input[type="number"] { width:64px; }
.fixed-map-editor input:not([type]) { width:124px; }
.fixed-map-controls { display:grid; gap:6px; }
.fixed-map-controls small { color:#b8cbd0; }
.fixed-map-tools button[aria-pressed="true"],button.fixed-map-start { border-color:#80d4e5; background:#214552; }
.fixed-map-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.fixed-map-footer ul { max-height:80px; overflow:auto; padding-left:20px; margin:3px 0; color:#ffc6a7; }
</style>

<style>
body:not(.v39-fixed-map-editing) .v39-fixed-editor-only { display:none !important; }
body.v39-fixed-map-editing :is(#v39-land-settlement-convert,#v39-land-settlement-convert-status) { display:none !important; }
body.v39-fixed-map-editing [data-foot]:not([data-foot="map"],[data-foot="tile"],[data-foot="settlement"],[data-foot="squad"]),
body.v39-fixed-map-editing :is(#v39-turn-controls,#v39-territory-guide-caption,.top-actions) { display:none !important; }
</style>
