import "./v39-modal-gallery.css";

const parameter = "v39-modal-preview";
const galleryMessage = "v39-modal-gallery";
const actor = "expedition-test-king";
const query = selector => document.querySelector(selector);
const click = selector => {
  const button = query(selector);
  if (!button) throw new Error("画面を開く操作が見つかりません");
  button.click();
};

const entries = [
  { id:"race", group:"開始・設定", name:"種族選択", from:"新規ゲームの初期設定", selector:".vue-modal-backdrop", open:() => window.openV39PreMapSovereignSetup({playerId:"player-1"}) },
  { id:"class", group:"開始・設定", name:"クラス選択", from:"初期クラス選択・成長", selector:".vue-modal-backdrop", open:() => window.openV39AcquisitionPicker({kind:"class",race:"只人",choices:["ファイター","モンク","アーチャー"],onConfirm(){}}) },
  { id:"map", group:"開始・設定", name:"ゲーム開始設定", from:"種族・クラス決定後", selector:"#v39-field-settings-modal", open:() => window.openFieldSettingsModal({playMode:"single-test"}) },
  { id:"lobby", group:"開始・設定", name:"通信ルーム", from:"マルチプレイ", selector:"#v39-multiplayer-lobby", open:() => window.openV39MultiplayerLobby({mode:"create"}) },
  { id:"settings", group:"開始・設定", name:"設定", from:"管理・設定", selector:"#settingsModal", open:() => click('[data-open="settings"]') },
  { id:"effects", group:"開始・設定", name:"エフェクト設定", from:"タイトル・管理", selector:"#v39-effect-settings-host", open:() => window.openV39EffectSettings({returnTo:"title"}) },
  { id:"docs", group:"開始・設定", name:"設計書", from:"管理・設計書", selector:"#v39-design-docs-modal", open:() => window.openDesignDocsModal() },
  { id:"cave", group:"開始・設定", name:"洞窟生成テスト", from:"タイトル・洞窟生成テスト", selector:".cave-test-dialog", open:() => window.dispatchEvent(new CustomEvent("v39:cave-test-requested")) },
  { id:"character", group:"ユニット・装備", name:"ユニット一覧", from:"部隊・ユニット一覧", fixture:"expedition", selector:"#characterModal", open:() => window.openV39CharacterModal() },
  { id:"squad", group:"ユニット・装備", name:"部隊編制", from:"部隊・編制", fixture:"expedition", selector:"#v39-squad-editor-title", open:() => window.openV39SquadEditor() },
  { id:"recruit", group:"ユニット・装備", name:"ユニット作成", from:"拠点・ユニット作成", fixture:"expedition", selector:"#unitCreateModal", open:() => click('[data-open="unitCreate"]') },
  { id:"equipment", group:"ユニット・装備", name:"装備・生成・付与", from:"装備のメニュー", fixture:"equipment", selector:"#equipmentModal", open:() => click('[data-open="equipment"]') },
  { id:"equipment-slot", group:"ユニット・装備", name:"装備スロット選択", from:"ユニット詳細・装備変更", fixture:"equipment", selector:"#v39-equipment-picker", open:async () => {
    const {openV39EquipmentPicker} = await import("../unit/v39-equipment-picker.js");
    openV39EquipmentPicker(window.getV39ActiveFactionState().selectedUnitId, "武器1");
  } },
  { id:"summon", group:"召喚・合体", name:"召喚モンスター選択", from:"儀式施設・召喚", fixture:"ritual", selector:"#v39-summon-modal" },
  { id:"call", group:"召喚・合体", name:"呼集", from:"部隊・行動・呼集", fixture:"call", selector:"#v39-summon-modal", open:() => click("[data-v39-call-open]") },
  { id:"fusion", group:"召喚・合体", name:"モンスター合体", from:"合体スキル・合体施設", fixture:"fusion", selector:"#v39-fusion-modal", open:() => window.openV39FusionModal(actor) },
  { id:"golem", group:"召喚・合体", name:"ゴーレム工房", from:"拠点・施設・ゴーレム作成", fixture:"golem", selector:"#v39-golem-workshop", open:() => click("[data-golem-workshop]") },
  { id:"build", group:"拠点・交流", name:"建設・施設", from:"拠点発展", fixture:"expedition", selector:"#buildModal", open:() => click('[data-open="build"]') },
  { id:"research", group:"拠点・交流", name:"研究", from:"上部の研究メニュー", fixture:"expedition", selector:"#researchModal", open:() => window.openV39Research("鍛冶") },
  { id:"logs", group:"拠点・交流", name:"統治者ログ", from:"統治者ログのメニュー", fixture:"expedition", selector:"#rulerLogModal", open:() => click('[data-open="rulerLog"]') },
  { id:"trade", group:"拠点・交流", name:"取引", from:"交流・取引", fixture:"trade", selector:"#v39-trade-modal", open:() => window.openV39TradeModal() },
  { id:"logistics", group:"拠点・交流", name:"運搬設定", from:"物流・運搬を設定", fixture:"expedition", selector:"#v39-logistics-dialog", open:() => {
    window.activateV39FooterTab("logistics");
    click("[data-logistics-new]");
  } },
  { id:"factions", group:"拠点・交流", name:"勢力情報", from:"交流・勢力情報", fixture:"expedition", selector:"#v39-faction-info", open:() => window.openV39FactionInfo() },
];

function isolatePreviewStorage() {
  for (const property of ["localStorage", "sessionStorage"]) {
    const values = new Map();
    Object.defineProperty(window, property, {value:{
      get length() { return values.size; },
      key:index => [...values.keys()][index] ?? null,
      getItem:key => values.get(String(key)) ?? null,
      setItem:(key, value) => values.set(String(key), String(value)),
      removeItem:key => values.delete(String(key)),
      clear:() => values.clear()
    }});
  }
  document.addEventListener("submit", event => {
    if (event.target.method !== "dialog") event.preventDefault();
  }, true);
  const fetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const method = String(options?.method ?? input?.method ?? "GET").toUpperCase();
    return ["GET", "HEAD"].includes(method) ? fetch(input, options)
      : Promise.reject(new Error("モーダル確認ではサーバーに変更を送信できません"));
  };
}

async function prepareFixture(fixture) {
  if (!fixture) return;
  await window.setV39TestMode(true);
  const starts = {
    expedition:() => window.startV39ExpeditionTest(false,{silentBanner:true}),
    equipment:async () => (await import("./v39-skill-trigger-test.js")).startV39SkillTriggerTest(),
    ritual:() => window.startV39RitualTest(1),
    call:() => window.startV39CallTest(),
    fusion:() => window.startV39FusionTest(),
    golem:() => window.startV39GolemWorkshopTest(),
    trade:() => window.startV39TradeTest()
  };
  const result = await starts[fixture]();
  if (!result || result.ok === false) throw new Error(result?.reason || "確認用データを準備できません");
  await window.waitForV39MapRenderSettled?.();
}

function notifyParent(state, reason = "") {
  window.parent.postMessage({type:galleryMessage,state,reason}, location.origin);
}

async function openPreview(id) {
  const entry = entries.find(row => row.id === id);
  try {
    if (!entry) throw new Error("対象画面が見つかりません");
    window.closeV39PlayModeSelection?.();
    await prepareFixture(entry.fixture);
    await entry.open?.();
    const visible = () => [...document.querySelectorAll(entry.selector)].some(node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    for (let attempt = 0; attempt < 35 && !visible(); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!visible()) throw new Error("対象画面が開きませんでした");
    notifyParent("opened");
    const watcher = setInterval(() => {
      if (visible()) return;
      clearInterval(watcher);
      notifyParent("closed");
    }, 300);
  } catch (error) {
    notifyParent("failed", error.message);
  }
}

function installTitleEntry() {
  const title = query("#v39-play-mode-select .v39-play-mode-options.single");
  if (!title || query("[data-v39-modal-gallery-entry]")) return;
  const entry = document.createElement("button");
  entry.type = "button";
  entry.dataset.v39ModalGalleryEntry = "";
  entry.innerHTML = "<strong>モーダル一覧</strong><small>既存の画面を開いて比較します。</small>";
  entry.addEventListener("click", openGallery);
  title.append(entry);
}

function openGallery() {
  const gallery = document.createElement("dialog");
  gallery.id = "v39-modal-gallery";
  gallery.setAttribute("aria-labelledby", "v39-modal-gallery-title");
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }
  gallery.innerHTML = `<header><h2 id="v39-modal-gallery-title">モーダル一覧</h2><button type="button" data-gallery-back>タイトルに戻る</button></header>
    <output role="status"></output>
    <div class="v39-modal-gallery-list">${[...groups].map(([group, rows]) => `<section><h3>${group}</h3><div>${rows.map(entry =>
      `<button type="button" data-gallery-id="${entry.id}"><strong>${entry.name}</strong><small>${entry.from}</small></button>`).join("")}</div></section>`).join("")}</div>
    <div class="v39-modal-gallery-preview" hidden></div>`;
  document.body.append(gallery);
  const list = gallery.querySelector(".v39-modal-gallery-list");
  const preview = gallery.querySelector(".v39-modal-gallery-preview");
  const back = gallery.querySelector("[data-gallery-back]");
  const status = gallery.querySelector("output");
  let frame;
  let timeout;
  let returnFocus;
  function closePreview(reason = "") {
    clearTimeout(timeout);
    frame?.remove();
    frame = null;
    preview.hidden = true;
    list.hidden = false;
    back.textContent = "タイトルに戻る";
    status.textContent = reason;
    returnFocus?.focus();
  }
  function onMessage(event) {
    if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow || event.data?.type !== galleryMessage) return;
    if (event.data.state === "opened") { clearTimeout(timeout); status.textContent = ""; }
    if (event.data.state === "closed") closePreview();
    if (event.data.state === "failed") closePreview(event.data.reason || "画面を開けませんでした");
  }
  window.addEventListener("message", onMessage);
  gallery.addEventListener("close", () => {
    clearTimeout(timeout);
    window.removeEventListener("message",onMessage);
    gallery.remove();
    query("[data-v39-modal-gallery-entry]")?.focus();
  },{once:true});
  gallery.addEventListener("cancel", event => {
    if (frame) { event.preventDefault(); closePreview(); }
  });
  gallery.addEventListener("click", event => {
    if (event.target.closest("[data-gallery-back]")) {
      if (frame) closePreview();
      else gallery.close();
      return;
    }
    const button = event.target.closest("[data-gallery-id]");
    if (!button || frame) return;
    returnFocus = button;
    list.hidden = true;
    preview.hidden = false;
    back.textContent = "一覧に戻る";
    status.textContent = "画面を読み込み中…";
    frame = document.createElement("iframe");
    frame.title = button.querySelector("strong").textContent;
    frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms");
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set(parameter, button.dataset.galleryId);
    frame.src = url;
    preview.append(frame);
    back.focus();
    timeout = setTimeout(() => closePreview("画面を開くまでに時間がかかりすぎました"), 30000);
  });
  gallery.showModal();
}

export function installV39ModalGallery() {
  const id = new URL(location.href).searchParams.get(parameter);
  if (id && window.parent !== window) {
    isolatePreviewStorage();
    window.addEventListener("v39:bootstrap-complete", () => void openPreview(id), {once:true});
  } else {
    window.addEventListener("v39:bootstrap-complete",installTitleEntry,{once:true});
  }
}
