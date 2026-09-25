import {
  GAME_START_DEFAULT_MAX_COMBAT_TURNS,
  GAME_START_DEFAULT_TURN_MODE,
  GAME_START_MAX_COMBAT_TURNS_MAX,
  GAME_START_MAX_COMBAT_TURNS_MIN,
  GAME_START_TURN_MODE_OPTIONS,
  normalizeGameStartSettings
} from "../../lib/game-start-settings.js";
import { V39_NEUTRAL_VILLAGE_BALANCE } from "../../lib/v39-gameplay-balance.js";
import {
  V39_LOCAL_SESSION_PLAYER_LIMIT,
  normalizeV39LocalParticipantCount,
  normalizeV39LocalPlayerCount
} from "../../lib/v39-local-multiplayer-session.js";

const FIELD_SETTINGS_STORAGE_KEY = "v39-field-settings-v1";

function normalizePlayMode(value) {
  if (value === "multiplayer") return "multiplayer";
  if (value === "single-test") return "single-test";
  return "single-normal";
}

const DEFAULT_FIELD_SETTINGS = Object.freeze({
  playMode: "single-normal",
  mapSize: "60x60",
  patternId: "realistic",
  mountainMode: "random",
  enemySpawnTileDivisor: 40,
  neutralVillageCount: V39_NEUTRAL_VILLAGE_BALANCE.initialVillageCount,
  localPlayerCount: V39_LOCAL_SESSION_PLAYER_LIMIT.min,
  localParticipantCount: V39_LOCAL_SESSION_PLAYER_LIMIT.min,
  playerParticipantAssignments: {},
  gameSettings: normalizeGameStartSettings({
    turnProgressionMode: GAME_START_DEFAULT_TURN_MODE,
    maxCombatTurnsPerWorldTurn: GAME_START_DEFAULT_MAX_COMBAT_TURNS
  }),
  islandCustomSettings: {
    enabled: false,
    largeIslandCount: 2,
    isletCountMin: 1,
    isletCountMax: 4,
    targetLandRatio: 0.5,
    largeIslandMinGap: 6,
    riverPerContinentMin: 3,
    riverPerContinentMax: 4,
    worldWrapEnabled: true
  }
});

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadFieldSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(FIELD_SETTINGS_STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return deepClone(DEFAULT_FIELD_SETTINGS);
    return {
      ...deepClone(DEFAULT_FIELD_SETTINGS),
      ...saved,
      playMode:normalizePlayMode(saved.playMode),
      gameSettings: normalizeGameStartSettings(saved.gameSettings),
      islandCustomSettings: {
        ...deepClone(DEFAULT_FIELD_SETTINGS.islandCustomSettings),
        ...(saved.islandCustomSettings || {})
      }
    };
  } catch {
    return deepClone(DEFAULT_FIELD_SETTINGS);
  }
}

function saveFieldSettings(settings) {
  localStorage.setItem(FIELD_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function parseMapSize(value) {
  const [wRaw, hRaw] = String(value || "60x60").split("x");
  return { w: Number(wRaw) || 60, h: Number(hRaw) || 60 };
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

function enemyDivisorToAmount(value) {
  const divisor = Math.round(clampNumber(value, 20, 60, 40));
  return 80 - divisor;
}

function enemyAmountToDivisor(value) {
  const amount = Math.round(clampNumber(value, 20, 60, 40));
  return 80 - amount;
}

function createStyles() {
  if (document.getElementById("v39-field-settings-final-style")) return;
  const style = document.createElement("style");
  style.id = "v39-field-settings-final-style";
  style.textContent = `
#v39-field-settings-modal{position:fixed;inset:0;z-index:10050;display:none;place-items:center;padding:max(8px,var(--safe-t,0px)) max(8px,var(--safe-r,0px)) max(8px,var(--safe-b,0px)) max(8px,var(--safe-l,0px));background:rgba(1,5,8,.82);backdrop-filter:blur(3px)}
#v39-field-settings-modal.open{display:grid}
#v39-field-settings-dialog{box-sizing:border-box;width:min(720px,100%);height:min(760px,100%);max-height:calc(100dvh - 16px);min-height:0;display:grid;grid-template-rows:48px minmax(0,1fr) auto;border:1px solid #46575e;border-radius:10px;background:linear-gradient(180deg,#111c20,#0a1216);box-shadow:0 18px 50px rgba(0,0,0,.62);overflow:hidden;color:#e8efec}
.v39-field-settings-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #34444a;background:#111c21}.v39-field-settings-head h2{font-size:15px;margin:0}.v39-field-settings-head small{font-size:12px;color:#829499}.v39-field-settings-head button{margin-left:auto;width:34px;height:30px;border:1px solid #46575d;border-radius:7px;background:#172429;color:#e8efec}
.v39-field-settings-body{min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:8px;display:grid;grid-auto-rows:max-content;gap:7px;align-content:start}
.v39-start-section{border:1px solid #34444a;border-radius:8px;background:#0f191d;overflow:hidden}
.v39-start-section>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 10px;background:#121f24;font-size:13px;font-weight:800;user-select:none}
.v39-start-section>summary::-webkit-details-marker{display:none}
.v39-start-section>summary::before{content:"▷";display:inline-block;width:14px;color:#7fc9d6;transition:transform .12s ease}
.v39-start-section[open]>summary::before{transform:rotate(90deg)}
.v39-start-section[open]>summary{border-bottom:1px solid #2f4046}
.v39-section-summary-control{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#b9c6c9}
.v39-section-summary-control input{width:18px;height:18px;accent-color:#66c6d6}
.v39-setting-list{display:grid;padding:2px 10px 7px}
.v39-setting-row{min-width:0;display:grid;grid-template-columns:minmax(150px,.8fr) minmax(190px,1.2fr);gap:6px 12px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(70,87,93,.42)}
.v39-setting-row:last-child{border-bottom:0}.v39-setting-row[hidden]{display:none}
.v39-setting-row>span{font-size:12px;color:#b8c5c8;font-weight:700}
.v39-setting-row select,.v39-setting-row input[type="number"]{width:100%;min-height:34px;border:1px solid #46575d;border-radius:6px;background:#162227;color:#e8efec;padding:5px 7px}
.v39-setting-row input[type="checkbox"]{width:18px;height:18px;accent-color:#66c6d6}
.v39-setting-row .v39-inline-check{display:flex;align-items:center;gap:7px;min-height:34px}
.v39-setting-row small{grid-column:2;font-size:11px;color:#809297;line-height:1.4;margin-top:-2px}
.v39-range-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:5px;align-items:center}
.v39-player-assignment-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.v39-player-assignment-list label{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:5px;font-size:12px;color:#b8c5c8}.v39-player-assignment-list select{min-width:0;min-height:30px;border:1px solid #46575d;border-radius:6px;background:#162227;color:#e8efec;padding:3px 5px}
.v39-room-entry{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.v39-room-entry button{min-height:34px;border:1px solid #52747d;border-radius:7px;background:#18333b;color:#edf6f3;padding:5px 10px;font-weight:800}.v39-room-entry small{flex:1 1 200px}
.v39-field-load-save{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.v39-field-load-save button{min-height:36px;border:1px solid #5b7882;border-radius:7px;background:#173039;color:#edf5f3;padding:5px 10px;font-weight:800;cursor:pointer}.v39-field-load-save button:hover{background:#1d3c46}
.v39-field-load-save-status{font-size:11px;color:#91a4a9}
#v39-field-custom-grid.is-disabled{opacity:.45;pointer-events:none}
.v39-field-settings-actions{display:flex;gap:8px;padding:8px 10px;border-top:1px solid #34444a;background:#0d161a}.v39-field-settings-actions button{min-height:38px;border:1px solid #4c6067;border-radius:8px;background:#172329;color:#e8efec;padding:0 13px;font-weight:800}.v39-field-settings-actions .primary{margin-left:auto;border-color:#66b7c6;background:#17414a}.v39-field-settings-actions .danger{border-color:#66504b;background:#261b18}.v39-field-settings-status{font-size:12px;color:#91a4a9;align-self:center}
@media(max-width:700px){#v39-field-settings-dialog{width:100%;height:calc(100dvh - 16px);max-height:calc(100dvh - 16px);min-height:0;border-radius:6px}.v39-field-settings-body{padding:6px;overflow-y:auto;touch-action:pan-y}.v39-setting-row{grid-template-columns:1fr;gap:4px;padding:7px 0}.v39-setting-row small{grid-column:1}.v39-field-settings-actions{position:sticky;bottom:0}.v39-field-settings-head small{display:none}}
`;
  document.head.appendChild(style);
}

function createModal() {
  document.getElementById("v39-field-settings-placeholder")?.remove();
  document.getElementById("v39-field-settings-modal")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "v39-field-settings-modal";
  overlay.dataset.v39FinalSettings = "1";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <section id="v39-field-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="v39-field-settings-title">
      <header class="v39-field-settings-head">
        <div><h2 id="v39-field-settings-title">ゲーム開始設定</h2><small id="v39-field-settings-subtitle">マップ生成とゲーム進行方式を設定</small></div>
        <button type="button" data-field-close aria-label="閉じる">×</button>
      </header>
      <div class="v39-field-settings-body">
        <details class="v39-start-section" id="v39-start-game-section" open>
          <summary>ゲーム進行</summary>
          <div class="v39-setting-list">
            <label class="v39-setting-row" id="v39-field-local-player-row">
              <span>ターン進行方式</span>
              <select id="v39-field-turn-mode"></select>
              <small id="v39-field-turn-mode-note"></small>
            </label>
            <label class="v39-setting-row" id="v39-field-max-combat-turns-row">
              <span>最大戦闘ターン数</span>
              <input id="v39-field-max-combat-turns" type="number" step="1">
              <small id="v39-field-max-combat-turns-note"></small>
            </label>
            <label class="v39-setting-row">
              <span>操作勢力数</span>
              <input id="v39-field-local-player-count" type="number" min="${V39_LOCAL_SESSION_PLAYER_LIMIT.min}" max="${V39_LOCAL_SESSION_PLAYER_LIMIT.max}" step="1">
              <small>1台で順番に操作する勢力数です。全勢力の終了後にエネミーと全体処理を実行します。</small>
            </label>
          </div>
        </details>

        <details class="v39-start-section" id="v39-start-participant-section" open>
          <summary>参加者と担当勢力</summary>
          <div class="v39-setting-list">
            <label class="v39-setting-row">
              <span>参加者数</span>
              <input id="v39-field-local-participant-count" type="number" min="${V39_LOCAL_SESSION_PLAYER_LIMIT.min}" max="${V39_LOCAL_SESSION_PLAYER_LIMIT.max}" step="1">
              <small>通信前の仮参加者です。将来はルーム参加者へ置き換えます。</small>
            </label>
            <div class="v39-setting-row">
              <span>担当勢力</span>
              <div class="v39-player-assignment-list" id="v39-field-player-assignments"></div>
              <small>各勢力は必ず1人の参加者が担当します。1人で複数勢力を担当できます。</small>
            </div>
          </div>
        </details>

        <details class="v39-start-section" id="v39-start-online-section">
          <summary>通信ルーム</summary>
          <div class="v39-setting-list">
            <div class="v39-setting-row">
              <span>ホスト・参加</span>
              <div class="v39-room-entry">
                <button type="button" data-open-v39-room="create">ルーム作成</button>
                <button type="button" data-open-v39-room="join">ルーム参加</button>
              </div>
              <small>ルームIDを共有して参加します。現在はロビー段階で、ワールド同期・ゲーム開始はまだ接続しません。</small>
            </div>
          </div>
        </details>

        <details class="v39-start-section" id="v39-start-map-section" open>
          <summary>マップ基本設定</summary>
          <div class="v39-setting-list">
            <label class="v39-setting-row">
              <span>マップサイズ</span>
              <select id="v39-field-map-size">
                <option value="30x40">下限 30×40（1200マス）</option>
                <option value="36x36">標準 36×36（1296マス / 推奨）</option>
                <option value="48x48">大 48×48（2304マス）</option>
                <option value="60x60">特大 60×60（3600マス）</option>
                <option value="72x72">超特大 72×72（5184マス）</option>
                <option value="83x83">最大 83×83（6889マス）</option>
              </select>
            </label>
            <label class="v39-setting-row">
              <span>島形状パターン</span>
              <select id="v39-field-pattern">
                <option value="realistic">リアル島</option>
                <option value="balanced">標準諸島</option>
                <option value="continent">大陸型</option>
                <option value="archipelago">多島海</option>
                <option value="twins">双子島</option>
                <option value="chain">列島型</option>
              </select>
            </label>
            <label class="v39-setting-row">
              <span>山岳モード</span>
              <select id="v39-field-mountain">
                <option value="random">ランダム（単峰 / 群峰 / 混合）</option>
                <option value="single">単峰 固定</option>
                <option value="multi">群峰 固定</option>
                <option value="mixed">混合 固定</option>
              </select>
            </label>
            <label class="v39-setting-row">
              <span>敵出現量</span>
              <input id="v39-field-enemy-amount" type="number" min="20" max="60" step="5">
              <small>数値が大きいほど敵が多く出現します。20＝少ない / 40＝標準 / 60＝多い。</small>
            </label>
            <label class="v39-setting-row">
              <span>一般村数</span>
              <input id="v39-field-neutral-village-count" type="number" min="0" max="${V39_NEUTRAL_VILLAGE_BALANCE.maxInitialVillageCount}" step="1">
              <small>初期配置後に中立一般村を配置します。0で配置しません。既定は${V39_NEUTRAL_VILLAGE_BALANCE.initialVillageCount}。</small>
            </label>
            <div class="v39-setting-row">
              <span>ワールド端接続</span>
              <label class="v39-inline-check"><input type="checkbox" id="v39-field-wrap">左右上下の端を接続する</label>
              <small>旧カスタム設定の worldWrapEnabled を使用します。</small>
            </div>
          </div>
        </details>

        <details class="v39-start-section" id="v39-start-island-section">
          <summary>
            <span>島カスタム設定</span>
            <label class="v39-section-summary-control"><input type="checkbox" id="v39-field-custom-enabled">使用する</label>
          </summary>
          <div class="v39-setting-list" id="v39-field-custom-grid">
            <div class="v39-setting-row"><span>大島の数</span><input id="v39-field-large-islands" type="number" min="1" max="8" step="1"></div>
            <div class="v39-setting-row"><span>大島間の最小距離</span><input id="v39-field-island-gap" type="number" min="2" max="12" step="1"></div>
            <div class="v39-setting-row"><span>目標陸地率（%）</span><input id="v39-field-land-percent" type="number" min="25" max="60" step="1"></div>
            <div class="v39-setting-row"><span>孤島数</span><div class="v39-range-pair"><input id="v39-field-islet-min" type="number" min="0" max="12" step="1"><b>〜</b><input id="v39-field-islet-max" type="number" min="0" max="12" step="1"></div></div>
            <div class="v39-setting-row"><span>大陸あたり川本数</span><div class="v39-range-pair"><input id="v39-field-river-min" type="number" min="1" max="12" step="1"><b>〜</b><input id="v39-field-river-max" type="number" min="1" max="12" step="1"></div></div>
          </div>
        </details>

        <details class="v39-start-section" id="v39-start-load-section">
          <summary>セーブデータから再開</summary>
          <div class="v39-setting-list">
            <div class="v39-setting-row">
              <span>セーブデータ</span>
              <div class="v39-field-load-save">
                <button type="button" id="v39-field-load-save">セーブデータをロード</button>
                <input id="v39-field-save-file" type="file" accept="application/json,.json" hidden>
                <span class="v39-field-load-save-status" id="v39-field-load-save-status">JSONファイルを選択</span>
              </div>
              <small>マップ・勢力・ターン・研究・経済・戦闘状態・カメラ位置を復元します。</small>
            </div>
          </div>
        </details>
      </div>
      <footer class="v39-field-settings-actions">
        <span class="v39-field-settings-status" id="v39-field-settings-status">未生成</span>
        <button type="button" class="danger" id="v39-field-settings-reset">初期値</button>
        <button type="button" data-field-close>キャンセル</button>
        <button type="button" class="primary" id="v39-field-generate">生成</button>
      </footer>
    </section>`;
  document.body.appendChild(overlay);
  return overlay;
}

function boot() {
  createStyles();
  let settings = loadFieldSettings();
  let lobbyGameSettingsMode = false;
  const overlay = createModal();
  const get = id => document.getElementById(id);

  const turnModeSelect = get("v39-field-turn-mode");
  if (turnModeSelect instanceof HTMLSelectElement) {
    turnModeSelect.replaceChildren(...GAME_START_TURN_MODE_OPTIONS.map(row => {
      const option = document.createElement("option");
      option.value = row.value;
      option.textContent = row.label;
      return option;
    }));
  }
  const maxCombatTurnsInput = get("v39-field-max-combat-turns");
  if (maxCombatTurnsInput instanceof HTMLInputElement) {
    maxCombatTurnsInput.min = String(GAME_START_MAX_COMBAT_TURNS_MIN);
    maxCombatTurnsInput.max = String(GAME_START_MAX_COMBAT_TURNS_MAX);
  }
  const maxCombatTurnsNote = get("v39-field-max-combat-turns-note");
  if (maxCombatTurnsNote) {
    maxCombatTurnsNote.textContent = "初期値 " + GAME_START_DEFAULT_MAX_COMBAT_TURNS
      + "。設定範囲 " + GAME_START_MAX_COMBAT_TURNS_MIN + "〜" + GAME_START_MAX_COMBAT_TURNS_MAX
      + "。上限到達時に未決着戦闘を次のワールドターンへ持ち越す想定です。";
  }

  const syncTurnModeVisibility = gameSettings => {
    const maxCombatTurnsRow = get("v39-field-max-combat-turns-row");
    if (maxCombatTurnsRow instanceof HTMLElement) {
      maxCombatTurnsRow.hidden = gameSettings?.turnProgressionMode !== "phased";
    }
  };

  const normalizeParticipantAssignments = () => {
    const playerCount = normalizeV39LocalPlayerCount(settings.localPlayerCount);
    const participantCount = normalizeV39LocalParticipantCount(settings.localParticipantCount, playerCount);
    const source = settings.playerParticipantAssignments && typeof settings.playerParticipantAssignments === "object"
      ? settings.playerParticipantAssignments
      : {};
    return Object.fromEntries(Array.from({ length:playerCount }, (_, index) => {
      const playerId = `player-${index + 1}`;
      const requested = String(source[playerId] || "");
      const participantNumber = Number(requested.replace("local-", ""));
      const fallback = `local-${(index % participantCount) + 1}`;
      return [playerId, Number.isInteger(participantNumber) && participantNumber >= 1 && participantNumber <= participantCount ? requested : fallback];
    }));
  };

  const syncPlayerAssignments = () => {
    const playerCount = normalizeV39LocalPlayerCount(settings.localPlayerCount);
    const participantCount = normalizeV39LocalParticipantCount(settings.localParticipantCount, playerCount);
    settings.localPlayerCount = playerCount;
    settings.localParticipantCount = participantCount;
    settings.playerParticipantAssignments = normalizeParticipantAssignments();
    const list = get("v39-field-player-assignments");
    if (!(list instanceof HTMLElement)) return;
    list.replaceChildren(...Array.from({ length:playerCount }, (_, index) => {
      const playerId = `player-${index + 1}`;
      const label = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = `勢力${index + 1}`;
      const select = document.createElement("select");
      select.dataset.v39PlayerAssignment = playerId;
      for (let participantIndex = 1; participantIndex <= participantCount; participantIndex += 1) {
        const option = document.createElement("option");
        option.value = `local-${participantIndex}`;
        option.textContent = `参加者${participantIndex}`;
        select.appendChild(option);
      }
      select.value = settings.playerParticipantAssignments[playerId];
      label.append(title, select);
      return label;
    }));
  };

  const sync = () => {
    settings.playMode = normalizePlayMode(settings.playMode);
    const subtitle = get("v39-field-settings-subtitle");
    if (subtitle) subtitle.textContent = settings.playMode === "multiplayer"
      ? "マルチプレイ用のマップ・ゲーム進行を設定"
      : settings.playMode === "single-test"
        ? "シングル・テストプレイ用のマップ・ゲーム進行を設定"
        : "シングル・通常プレイ用のマップ・ゲーム進行を設定";
    get("v39-field-map-size").value = settings.mapSize;
    get("v39-field-pattern").value = settings.patternId;
    get("v39-field-mountain").value = settings.mountainMode;
    get("v39-field-enemy-amount").value = enemyDivisorToAmount(settings.enemySpawnTileDivisor);
    get("v39-field-neutral-village-count").value = settings.neutralVillageCount;
    settings.localPlayerCount = normalizeV39LocalPlayerCount(settings.localPlayerCount);
    get("v39-field-local-player-count").value = settings.localPlayerCount;
    settings.localParticipantCount = normalizeV39LocalParticipantCount(settings.localParticipantCount, settings.localPlayerCount);
    get("v39-field-local-participant-count").value = settings.localParticipantCount;
    syncPlayerAssignments();
    const normalizedGameSettings = normalizeGameStartSettings(settings.gameSettings);
    settings.gameSettings = normalizedGameSettings;
    get("v39-field-turn-mode").value = normalizedGameSettings.turnProgressionMode;
    get("v39-field-max-combat-turns").value = normalizedGameSettings.maxCombatTurnsPerWorldTurn;
    const selectedTurnMode = GAME_START_TURN_MODE_OPTIONS.find(row => row.value === normalizedGameSettings.turnProgressionMode);
    get("v39-field-turn-mode-note").textContent = selectedTurnMode?.description || "";
    syncTurnModeVisibility(normalizedGameSettings);
    get("v39-field-custom-enabled").checked = !!settings.islandCustomSettings.enabled;
    get("v39-field-wrap").checked = settings.islandCustomSettings.worldWrapEnabled !== false;
    get("v39-field-large-islands").value = settings.islandCustomSettings.largeIslandCount;
    get("v39-field-island-gap").value = settings.islandCustomSettings.largeIslandMinGap;
    get("v39-field-land-percent").value = Math.round(settings.islandCustomSettings.targetLandRatio * 100);
    get("v39-field-islet-min").value = settings.islandCustomSettings.isletCountMin;
    get("v39-field-islet-max").value = settings.islandCustomSettings.isletCountMax;
    get("v39-field-river-min").value = settings.islandCustomSettings.riverPerContinentMin;
    get("v39-field-river-max").value = settings.islandCustomSettings.riverPerContinentMax;
    get("v39-field-custom-grid").classList.toggle("is-disabled", !settings.islandCustomSettings.enabled);
    ["v39-field-local-player-row", "v39-start-participant-section", "v39-start-load-section"]
      .forEach(id => {
        const element = get(id);
        if (element instanceof HTMLElement) element.hidden = lobbyGameSettingsMode;
      });
    const onlineSection = get("v39-start-online-section");
    if (onlineSection instanceof HTMLElement) onlineSection.hidden = true;
    const primaryButton = get("v39-field-generate");
    if (primaryButton) primaryButton.textContent = lobbyGameSettingsMode ? "ロビー設定を保存" : "生成";
  };

  const applyLobbyGameSetup = gameSetup => {
    if (!gameSetup || typeof gameSetup !== "object" || Array.isArray(gameSetup)) return;
    const source = gameSetup;
    settings = {
      ...settings,
      playMode:"multiplayer",
      mapSize:String(source.mapSize || settings.mapSize),
      patternId:String(source.patternId || settings.patternId),
      mountainMode:String(source.mountainMode || settings.mountainMode),
      enemySpawnTileDivisor:source.enemySpawnTileDivisor ?? settings.enemySpawnTileDivisor,
      neutralVillageCount:source.neutralVillageCount ?? settings.neutralVillageCount,
      gameSettings:normalizeGameStartSettings(source.gameSettings || settings.gameSettings),
      islandCustomSettings:{
        ...settings.islandCustomSettings,
        ...(source.islandCustomSettings && typeof source.islandCustomSettings === "object" ? source.islandCustomSettings : {})
      }
    };
  };

  const read = () => {
    const isletA = clampNumber(get("v39-field-islet-min").value, 0, 12, 1);
    const isletB = clampNumber(get("v39-field-islet-max").value, 0, 12, 4);
    const riverA = clampNumber(get("v39-field-river-min").value, 1, 12, 3);
    const riverB = clampNumber(get("v39-field-river-max").value, 1, 12, 4);
    const localPlayerCount = normalizeV39LocalPlayerCount(get("v39-field-local-player-count").value);
    const localParticipantCount = normalizeV39LocalParticipantCount(
      get("v39-field-local-participant-count").value,
      localPlayerCount
    );
    const playerParticipantAssignments = Object.fromEntries([...document.querySelectorAll("[data-v39-player-assignment]")]
      .map(select => [String(select.dataset.v39PlayerAssignment || ""), String(select.value || "")])
      .filter(([playerId]) => playerId));
    settings = {
      playMode:normalizePlayMode(settings.playMode),
      mapSize: get("v39-field-map-size").value,
      patternId: get("v39-field-pattern").value,
      mountainMode: get("v39-field-mountain").value,
      enemySpawnTileDivisor: enemyAmountToDivisor(get("v39-field-enemy-amount").value),
      neutralVillageCount: Math.round(clampNumber(
        get("v39-field-neutral-village-count").value,
        0,
        V39_NEUTRAL_VILLAGE_BALANCE.maxInitialVillageCount,
        V39_NEUTRAL_VILLAGE_BALANCE.initialVillageCount
      )),
      localPlayerCount,
      localParticipantCount,
      playerParticipantAssignments,
      gameSettings: normalizeGameStartSettings({
        turnProgressionMode: get("v39-field-turn-mode").value,
        maxCombatTurnsPerWorldTurn: get("v39-field-max-combat-turns").value
      }),
      islandCustomSettings: {
        enabled: get("v39-field-custom-enabled").checked,
        worldWrapEnabled: get("v39-field-wrap").checked,
        largeIslandCount: Math.round(clampNumber(get("v39-field-large-islands").value, 1, 8, 2)),
        largeIslandMinGap: Math.round(clampNumber(get("v39-field-island-gap").value, 2, 12, 6)),
        targetLandRatio: clampNumber(get("v39-field-land-percent").value, 25, 60, 50) / 100,
        isletCountMin: Math.round(Math.min(isletA, isletB)),
        isletCountMax: Math.round(Math.max(isletA, isletB)),
        riverPerContinentMin: Math.round(Math.min(riverA, riverB)),
        riverPerContinentMax: Math.round(Math.max(riverA, riverB))
      }
    };
    return settings;
  };

  const open = (options = {}) => {
    // 管理メニューやテストから直接設定を開く場合、初期選択の遮蔽を残さない。
    window.closeV39PlayModeSelection?.();
    if (Object.prototype.hasOwnProperty.call(options, "playMode")) {
      settings.playMode = normalizePlayMode(options.playMode);
    }
    lobbyGameSettingsMode = options.lobbyGameSettingsMode === true;
    if (lobbyGameSettingsMode) applyLobbyGameSetup(options.lobbyGameSetup);
    const generated = !!window.__v39FieldRuntime?.mapData;
    const runtimeFieldSettings = window.__v39FieldRuntime?.settings;
    const runtimeGameSettings = typeof window.getV39GameState === "function"
      ? window.getV39GameState()?.gameSettings
      : null;
    if (!lobbyGameSettingsMode && generated && runtimeGameSettings) {
      settings.gameSettings = normalizeGameStartSettings(runtimeGameSettings);
    }
    if (!lobbyGameSettingsMode && generated && typeof window.getV39GameState === "function") {
      const gameState = window.getV39GameState();
      const players = gameState?.players;
      settings.localPlayerCount = normalizeV39LocalPlayerCount(Array.isArray(players) ? players.length : settings.localPlayerCount);
      settings.localParticipantCount = normalizeV39LocalParticipantCount(gameState?.sessionParticipants?.length, settings.localPlayerCount);
      settings.playerParticipantAssignments = Object.fromEntries((players || []).map(player => [player.id, player.controllerParticipantId]));
    }
    if (!lobbyGameSettingsMode && generated && runtimeFieldSettings) {
      settings.neutralVillageCount = Math.round(clampNumber(
        runtimeFieldSettings.neutralVillageCount,
        0,
        V39_NEUTRAL_VILLAGE_BALANCE.maxInitialVillageCount,
        V39_NEUTRAL_VILLAGE_BALANCE.initialVillageCount
      ));
    }
    sync();
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  };
  const close = () => {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  };

  overlay.querySelectorAll("[data-field-close]").forEach(button => button.addEventListener("click", close));
  overlay.addEventListener("click", e => {
    if (e.target === overlay && !lobbyGameSettingsMode) close();
  });
  get("v39-field-turn-mode").addEventListener("change", () => {
    const next = normalizeGameStartSettings({
      turnProgressionMode: get("v39-field-turn-mode").value,
      maxCombatTurnsPerWorldTurn: get("v39-field-max-combat-turns").value
    });
    settings.gameSettings = next;
    const selected = GAME_START_TURN_MODE_OPTIONS.find(row => row.value === next.turnProgressionMode);
    get("v39-field-turn-mode-note").textContent = selected?.description || "";
    syncTurnModeVisibility(next);
  });
  get("v39-field-max-combat-turns").addEventListener("change", () => {
    settings.gameSettings = normalizeGameStartSettings({
      turnProgressionMode: get("v39-field-turn-mode").value,
      maxCombatTurnsPerWorldTurn: get("v39-field-max-combat-turns").value
    });
    sync();
  });
  get("v39-field-local-player-count").addEventListener("change", () => {
    settings.localPlayerCount = normalizeV39LocalPlayerCount(get("v39-field-local-player-count").value);
    settings.localParticipantCount = normalizeV39LocalParticipantCount(settings.localParticipantCount, settings.localPlayerCount);
    sync();
  });
  get("v39-field-local-participant-count").addEventListener("change", () => {
    settings.localParticipantCount = normalizeV39LocalParticipantCount(
      get("v39-field-local-participant-count").value,
      settings.localPlayerCount
    );
    sync();
  });
  const islandSection = get("v39-start-island-section");
  get("v39-field-custom-enabled").addEventListener("click", event => {
    event.stopPropagation();
  });
  get("v39-field-custom-enabled").addEventListener("change", () => {
    settings.islandCustomSettings.enabled = get("v39-field-custom-enabled").checked;
    get("v39-field-custom-grid").classList.toggle("is-disabled", !settings.islandCustomSettings.enabled);
    if (settings.islandCustomSettings.enabled && islandSection instanceof HTMLDetailsElement) {
      islandSection.open = true;
    }
  });
  get("v39-field-settings-reset").addEventListener("click", () => { settings = deepClone(DEFAULT_FIELD_SETTINGS); sync(); });

  const loadSaveButton = get("v39-field-load-save");
  const loadSaveInput = get("v39-field-save-file");
  const loadSaveStatus = get("v39-field-load-save-status");
  loadSaveButton?.addEventListener("click", () => {
    if (!(loadSaveInput instanceof HTMLInputElement)) return;
    loadSaveInput.click();
  });
  loadSaveInput?.addEventListener("change", async () => {
    const file = loadSaveInput.files?.[0];
    if (!file) return;
    try {
      if (typeof window.importV39SaveJson !== "function") {
        if (loadSaveStatus) loadSaveStatus.textContent = "セーブ機能を読み込み中です";
        return;
      }
      if (loadSaveStatus) loadSaveStatus.textContent = `${file.name} を読込中…`;
      get("v39-field-settings-status").textContent = "セーブデータ読込中…";
      window.importV39SaveJson(await file.text());
      if (loadSaveStatus) loadSaveStatus.textContent = `${file.name} を読み込みました`;
      get("v39-field-settings-status").textContent = "セーブデータ読込完了";
      close();
    } catch (error) {
      console.error("[v39-field-settings-final] save load failed", error);
      const message = error instanceof Error ? error.message : "読込に失敗しました";
      if (loadSaveStatus) loadSaveStatus.textContent = message;
      get("v39-field-settings-status").textContent = "セーブデータ読込失敗";
    } finally {
      loadSaveInput.value = "";
    }
  });

  get("v39-field-generate").addEventListener("click", () => {
    const next = read();
    if (lobbyGameSettingsMode) {
      const gameSetup = {
        mapSize:next.mapSize,
        patternId:next.patternId,
        mountainMode:next.mountainMode,
        enemySpawnTileDivisor:next.enemySpawnTileDivisor,
        neutralVillageCount:next.neutralVillageCount,
        gameSettings:next.gameSettings,
        islandCustomSettings:next.islandCustomSettings
      };
      window.dispatchEvent(new CustomEvent("v39:lobby-game-settings-saved", { detail:{ gameSetup } }));
      get("v39-field-settings-status").textContent = "ロビー設定を保存しました";
      close();
      return;
    }
    const { w, h } = parseMapSize(next.mapSize);
    if (typeof window.generateFieldFromSettings !== "function") {
      get("v39-field-settings-status").textContent = "フィールドruntime待機中";
      return;
    }
    get("v39-field-settings-status").textContent = "生成中…";
    try {
      if (typeof window.setV39GameState === "function") {
        window.startV39LocalSession?.(next.localPlayerCount, {
          playMode:next.playMode,
          gameSettings:next.gameSettings,
          participantCount:next.localParticipantCount,
          playerParticipantAssignments:next.playerParticipantAssignments
        });
        if (next.playMode === "single-normal" && window.__v39PendingInitialSovereignProfile) {
          const profileResult = window.consumeV39PendingInitialSovereignProfile?.();
          if (!profileResult?.ok) throw new Error(profileResult?.reason || "開始統治者を作成できませんでした");
        }
        window.setV39GameState({ gameSettings: next.gameSettings }, { reason: "game-start-settings" });
      }
      window.generateFieldFromSettings({
        w,
        h,
        patternId:next.patternId,
        mountainMode:next.mountainMode,
        enemySpawnTileDivisor:next.enemySpawnTileDivisor,
        neutralVillageCount:next.neutralVillageCount,
        islandCustomSettings:next.islandCustomSettings
      });
      if (window.__v39FieldRuntime?.settings) {
        window.__v39FieldRuntime.settings.enemySpawnTileDivisor = next.enemySpawnTileDivisor;
      }
      saveFieldSettings(next);
      const modeLabel = GAME_START_TURN_MODE_OPTIONS.find(row => row.value === next.gameSettings.turnProgressionMode)?.label || next.gameSettings.turnProgressionMode;
      get("v39-field-settings-status").textContent = w + "×" + h
        + " / " + modeLabel
        + " / 戦闘上限 " + next.gameSettings.maxCombatTurnsPerWorldTurn
        + " / 操作勢力 " + next.localPlayerCount
        + " / 参加者 " + next.localParticipantCount
        + " / 生成完了";
      close();
    } catch (error) {
      console.error("[v39-field-settings-final] generation failed", error);
      get("v39-field-settings-status").textContent = "生成失敗";
    }
  });

  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("#v39-manage-field-settings") : null;
    if (!(button instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  }, true);

  window.addEventListener("keydown", e => { if (e.key === "Escape" && overlay.classList.contains("open")) close(); });
  window.openFieldSettingsModal = open;
  window.closeFieldSettingsModal = close;
  window.getV39FieldSettings = () => deepClone(settings);

  sync();
  const maybeOpenInitial = () => {
    const generated = !!window.__v39FieldRuntime?.mapData;
    if (!generated) {
      if (typeof window.openV39PlayModeSelection === "function") window.openV39PlayModeSelection();
      else open();
    }
  };
  if (typeof window.generateFieldFromSettings === "function") maybeOpenInitial();
  else window.addEventListener("v39:field-runtime-ready", maybeOpenInitial, { once:true });
}

boot();
