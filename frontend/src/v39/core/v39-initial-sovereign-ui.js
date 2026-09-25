import { factionData, raceData } from "../../lib/game-data-registry.js";
import factionDetailFallbackData from "../../../../data/manual/勢力詳細.json";
import {
  applyV39InitialSovereignProfile,
  getV39InitialSovereignClassCandidates
} from "./v39-initial-sovereign.js";

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;
const raceRows = (Array.isArray(raceData) ? raceData : []).filter(row => text(row?.key));
const raceByKey = new Map(raceRows.map(row => [text(row.key), row]));
const SPECIALTY_KEYS = ["指揮", "威圧", "看破", "早業", "技術", "隠密", "索敵", "統治", "交渉", "農業", "林業", "漁業", "工業", "鍛冶", "魔術", "信仰"];
const CLASS_NON_STATUS_KEYS = new Set(["名前", "ルビ", "種類", "合計", "Tire", "増加条件", "コスト", "穀物", "野菜", "肉", "魚", "魂", "死体", "脚数", "画像ID"]);
const factionRows = Array.isArray(factionData) ? factionData : [];
const factionDetailFallbackRows = Array.isArray(factionDetailFallbackData) ? factionDetailFallbackData : [];

let activeProfile = null;

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character]));
}

function installStyles() {
  if (document.getElementById("v39-initial-sovereign-style")) return;
  const style = document.createElement("style");
  style.id = "v39-initial-sovereign-style";
  style.textContent = `
#v39-initial-sovereign-modal{position:fixed;inset:0;z-index:10130;display:none;place-items:center;padding:12px;background:rgba(1,5,8,.88);backdrop-filter:blur(4px)}#v39-initial-sovereign-modal.open{display:grid}.v39-sovereign-dialog{box-sizing:border-box;width:min(980px,100%);max-height:calc(100dvh - 24px);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border:1px solid #49636a;border-radius:12px;background:radial-gradient(circle at 72% 0,#1b3940 0,#101d22 38%,#091216 100%);box-shadow:0 20px 56px rgba(0,0,0,.65);color:#e8efec}.v39-sovereign-head{display:flex;align-items:start;gap:12px;padding:15px 17px 12px;border-bottom:1px solid #385057}.v39-sovereign-head-main{min-width:0;flex:1}.v39-sovereign-head h2{margin:0;font-size:21px}.v39-sovereign-head p{margin:5px 0 0;color:#a9bec1;font-size:15px}.v39-sovereign-back{min-height:38px;border:1px solid #4a6870;border-radius:7px;background:#142b31;color:#d9eeee;padding:6px 11px;font:inherit;font-size:15px;font-weight:800}.v39-sovereign-back[hidden]{display:none}.v39-sovereign-content{min-height:0;overflow:auto;padding:15px 17px 18px}.v39-sovereign-choice-intro{margin:0 0 13px;color:#b7c9ca;font-size:15px;line-height:1.55}.v39-sovereign-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.v39-sovereign-choice{display:grid;grid-template-columns:76px minmax(0,1fr);gap:11px;min-width:0;border:1px solid #38535a;border-radius:10px;background:rgba(10,25,30,.88);color:#e8efec;padding:11px;text-align:left;font:inherit;cursor:pointer}.v39-sovereign-choice:hover,.v39-sovereign-choice:focus-visible{border-color:#78d3df;background:#12343b;outline:none}.v39-sovereign-portrait{display:grid;place-items:center;width:76px;height:82px;overflow:hidden;border:1px solid #49636a;border-radius:8px;background:#172a2f;color:#9dd8df;font-size:25px;font-weight:800}.v39-sovereign-portrait img{width:100%;height:100%;object-fit:contain;image-rendering:auto}.v39-sovereign-choice-copy{min-width:0}.v39-sovereign-choice-title{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}.v39-sovereign-choice-title strong{font-size:18px}.v39-sovereign-choice-title small{color:#95b9be;font-size:13px}.v39-sovereign-choice-summary{margin:5px 0;color:#d7e3e1;font-size:15px;line-height:1.45}.v39-sovereign-choice-detail{margin:0;color:#9fb5b7;font-size:13px;line-height:1.45}.v39-sovereign-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.v39-sovereign-tag{border:1px solid #406169;border-radius:999px;background:#13262c;color:#b9d8da;padding:2px 6px;font-size:12px;font-weight:700}.v39-sovereign-stat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin-top:9px}.v39-sovereign-stat{min-width:0;border-left:2px solid #497983;background:#122328;padding:3px 5px}.v39-sovereign-stat small{display:block;overflow:hidden;color:#9bb1b4;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.v39-sovereign-stat b{display:block;color:#eaf4f1;font-size:15px}.v39-sovereign-skill-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.v39-sovereign-skill{color:#e7cf8d;font-size:12px}.v39-sovereign-fixed-race{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;margin:0 0 12px;padding:8px 10px;border-left:3px solid #6bc7d5;background:#122c32;color:#d7eeee;font-size:15px}.v39-sovereign-fixed-race strong{white-space:nowrap}.v39-sovereign-form{display:grid;gap:13px;max-width:520px}.v39-sovereign-form label{display:grid;gap:5px;color:#c5d6d7;font-size:16px;font-weight:800}.v39-sovereign-form input{min-height:44px;box-sizing:border-box;border:1px solid #4a6269;border-radius:7px;background:#152328;color:#edf4f1;padding:7px 9px;font:inherit;font-size:16px}.v39-sovereign-selection-summary{display:grid;gap:8px;margin-bottom:14px;padding:12px;border:1px solid #42626a;border-radius:9px;background:#102228}.v39-sovereign-selection-summary strong{font-size:18px}.v39-sovereign-selection-summary p{margin:0;color:#afc3c5;font-size:14px;line-height:1.5}.v39-sovereign-status{min-height:20px;margin:0;color:#efaa96;font-size:14px}.v39-sovereign-status[data-kind="ok"]{color:#8cdda8}.v39-sovereign-actions{display:flex;justify-content:end}.v39-sovereign-actions button{min-height:44px;border:1px solid #6abfcf;border-radius:7px;background:#174650;color:#effafa;padding:7px 16px;font:inherit;font-size:16px;font-weight:800}.v39-sovereign-actions button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:700px){#v39-initial-sovereign-modal{padding:6px}.v39-sovereign-dialog{max-height:calc(100dvh - 12px);border-radius:8px}.v39-sovereign-head{padding:12px}.v39-sovereign-content{padding:12px}.v39-sovereign-grid{grid-template-columns:1fr}.v39-sovereign-choice{grid-template-columns:62px minmax(0,1fr);padding:9px}.v39-sovereign-portrait{width:62px;height:68px}.v39-sovereign-choice-summary{font-size:14px}.v39-sovereign-stat-row{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;
  document.head.append(style);
}

function getModal() {
  installStyles();
  let modal = document.getElementById("v39-initial-sovereign-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "v39-initial-sovereign-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `<section class="v39-sovereign-dialog" aria-labelledby="v39-sovereign-title"><header class="v39-sovereign-head"><div class="v39-sovereign-head-main"><h2 id="v39-sovereign-title"></h2><p data-v39-sovereign-summary></p></div><button type="button" class="v39-sovereign-back" data-v39-sovereign-back>戻る</button></header><main class="v39-sovereign-content" data-v39-sovereign-content></main></section>`;
  document.body.append(modal);
  modal.addEventListener("click", event => handleModalClick(event, modal));
  modal.addEventListener("submit", event => {
    if (!(event.target instanceof Element) || !event.target.matches("[data-v39-sovereign-form]")) return;
    event.preventDefault();
    submitProfile(modal);
  });
  return modal;
}

function factionDetail(row) {
  const candidates = [text(row?.key), text(row?.name), text(row?.className)].filter(Boolean);
  const faction = factionRows.find(entry => candidates.includes(text(entry?.種族)) || candidates.includes(text(entry?.カナ)));
  const fallback = factionDetailFallbackRows.find(entry => candidates.includes(text(entry?.種族)) || candidates.includes(text(entry?.カナ)));
  return text(faction?.詳細) || text(fallback?.詳細) || "詳細は未設定です。";
}

function classStatusEntries(row) {
  return Object.entries(row || {}).filter(([key, value]) => {
    if (CLASS_NON_STATUS_KEYS.has(key) || /^Skill\d+$/.test(key) || /^条件_\d+$/.test(key) || /^Lv_\d+$/.test(key)) return false;
    if (/^(武器\d*|頭|体|足|装飾\d*)$/.test(key)) return false;
    return Number.isFinite(Number(value));
  });
}

function statMarkup(row) {
  const entries = classStatusEntries(row);
  return `<div class="v39-sovereign-stat-row">${entries.map(([key, value]) => `<span class="v39-sovereign-stat"><small>${escapeHtml(key)}</small><b>${number(value)}</b></span>`).join("")}</div>`;
}

function classSpecialties(row) {
  return SPECIALTY_KEYS.map(key => ({ key, value:number(row?.[key]) }))
    .filter(entry => entry.value >= 50)
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key, "ja"))
    .slice(0, 3);
}

function classSkills(row) {
  return Array.from({ length:10 }, (_, index) => text(row?.[`Skill${index + 1}`]))
    .filter(value => value && value !== "0").slice(0, 4);
}

function classCardMarkup(row) {
  const name = text(row?.名前);
  const ruby = text(row?.ルビ);
  const specialties = classSpecialties(row);
  const skills = classSkills(row);
  const equipment = ["武器1", "武器2"].map(key => text(row?.[key])).filter(value => value && value !== "×");
  return `<button type="button" class="v39-sovereign-choice" data-v39-sovereign-class-card="${escapeHtml(name)}"><span class="v39-sovereign-portrait">${escapeHtml((ruby || name).slice(0, 1))}</span><span class="v39-sovereign-choice-copy"><span class="v39-sovereign-choice-title"><strong>${escapeHtml(ruby || name)}</strong>${ruby ? `<small>${escapeHtml(name)}</small>` : ""}</span><span class="v39-sovereign-choice-detail">${escapeHtml(text(row?.種類) || "クラス")}${equipment.length ? ` / 初期装備: ${escapeHtml(equipment.join("・"))}` : ""}</span>${statMarkup(row)}<span class="v39-sovereign-tags">${specialties.length ? specialties.map(entry => `<span class="v39-sovereign-tag">${entry.key} ${entry.value}</span>`).join("") : '<span class="v39-sovereign-tag">標準型</span>'}</span>${skills.length ? `<span class="v39-sovereign-skill-row">${skills.map(skill => `<span class="v39-sovereign-skill">${escapeHtml(skill)}</span>`).join("")}</span>` : ""}</span></button>`;
}

function raceCardMarkup(row) {
  const key = text(row?.key);
  const name = text(row?.name) || key;
  const detail = factionDetail(row);
  // 種族.jsonの既存icon列は旧画面向けの未配置パスを含むため、開始画面では確実に表示できる頭文字を使う。
  const portrait = escapeHtml(name.slice(0, 1));
  return `<button type="button" class="v39-sovereign-choice" data-v39-sovereign-race-card="${escapeHtml(key)}"><span class="v39-sovereign-portrait">${portrait}</span><span class="v39-sovereign-choice-copy"><span class="v39-sovereign-choice-title"><strong>${escapeHtml(name)}</strong></span><span class="v39-sovereign-choice-summary">${escapeHtml(detail)}</span></span></button>`;
}

function setStatus(modal, message, kind = "") {
  const status = modal.querySelector("[data-v39-sovereign-status]");
  if (!(status instanceof HTMLElement)) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function renderSelection(modal) {
  if (!activeProfile) return;
  const content = modal.querySelector("[data-v39-sovereign-content]");
  const title = modal.querySelector("#v39-sovereign-title");
  const subtitle = modal.querySelector("[data-v39-sovereign-summary]");
  const back = modal.querySelector("[data-v39-sovereign-back]");
  const race = raceByKey.get(activeProfile.race);
  back.hidden = activeProfile.step === "race";
  if (activeProfile.step === "race") {
    title.textContent = "開始種族を選択";
    subtitle.textContent = "種族ごとの特性と基礎能力を比較して選択します。";
    content.innerHTML = `<p class="v39-sovereign-choice-intro">種族は人口の増加条件、基礎能力、統治の得意分野に影響します。</p><div class="v39-sovereign-grid">${raceRows.map(raceCardMarkup).join("")}</div>`;
    return;
  }
  if (activeProfile.step === "class") {
    const candidates = getV39InitialSovereignClassCandidates(activeProfile.race);
    title.textContent = "統治者クラスを選択";
    subtitle.textContent = `${text(race?.name) || activeProfile.race}の統治者が就くクラスを選択します。`;
    content.innerHTML = `<div class="v39-sovereign-fixed-race"><strong>種族: ${escapeHtml(text(race?.name) || activeProfile.race)}</strong><span>${escapeHtml(factionDetail(race))}</span></div><p class="v39-sovereign-choice-intro">ステータスはクラス.jsonの値をそのまま表示します。初期スキルと初期装備も比較できます。</p><div class="v39-sovereign-grid">${candidates.map(classCardMarkup).join("")}</div>`;
    return;
  }
  const classRow = getV39InitialSovereignClassCandidates(activeProfile.race).find(row => text(row?.名前) === activeProfile.className);
  title.textContent = "統治者と初期拠点を設定";
  subtitle.textContent = "設定後、マップ上で初期拠点を配置します。";
  content.innerHTML = `<section class="v39-sovereign-selection-summary"><strong>${escapeHtml(text(race?.name) || activeProfile.race)} / ${escapeHtml(text(classRow?.ルビ) || activeProfile.className)}</strong><p>${escapeHtml(factionDetail(race))}</p>${statMarkup(classRow)}</section><form class="v39-sovereign-form" data-v39-sovereign-form><label>統治者名<input data-v39-sovereign-name maxlength="20" required autocomplete="off" value="${escapeHtml(activeProfile.characterName || "統治者")}"></label><label>初期拠点名<input data-v39-sovereign-village maxlength="20" required autocomplete="off" value="${escapeHtml(activeProfile.villageName || "はじまりの村")}"></label><p class="v39-sovereign-status" data-v39-sovereign-status aria-live="polite"></p><div class="v39-sovereign-actions"><button type="submit" data-v39-sovereign-confirm>統治者を決定</button></div></form>`;
}

function handleModalClick(event, modal) {
  if (!(event.target instanceof Element) || !activeProfile) return;
  const raceCard = event.target.closest("[data-v39-sovereign-race-card]");
  if (raceCard instanceof HTMLElement) {
    activeProfile.race = text(raceCard.dataset.v39SovereignRaceCard);
    activeProfile.className = "";
    activeProfile.step = "class";
    renderSelection(modal);
    return;
  }
  const classCard = event.target.closest("[data-v39-sovereign-class-card]");
  if (classCard instanceof HTMLElement) {
    activeProfile.className = text(classCard.dataset.v39SovereignClassCard);
    activeProfile.step = "details";
    renderSelection(modal);
    window.setTimeout(() => modal.querySelector("[data-v39-sovereign-name]")?.focus(), 0);
    return;
  }
  if (event.target.closest("[data-v39-sovereign-back]")) {
    activeProfile.step = activeProfile.step === "details" ? "class" : "race";
    renderSelection(modal);
  }
}

function submitProfile(modal) {
  if (!activeProfile?.race || !activeProfile.className) return;
  const characterName = text(modal.querySelector("[data-v39-sovereign-name]")?.value);
  const villageName = text(modal.querySelector("[data-v39-sovereign-village]")?.value);
  if (!characterName || !villageName) {
    setStatus(modal, "統治者名と初期拠点名を入力してください。");
    return;
  }
  const button = modal.querySelector("[data-v39-sovereign-confirm]");
  button.disabled = true;
  const profile = { ...activeProfile, characterName, villageName };
  if (activeProfile.mode === "local") {
    const state = window.getV39GameState?.();
    const players = Array.isArray(state?.players) ? state.players : [];
    const stateWithRace = { ...state, players:players.map(player => text(player?.id) === profile.playerId ? { ...player, race:profile.race } : player) };
    const result = applyV39InitialSovereignProfile(stateWithRace, profile);
    if (!result.ok) {
      button.disabled = false;
      setStatus(modal, result.reason || "統治者を作成できませんでした。");
      return;
    }
    window.setV39GameState?.(result.state, { reason:"initial-sovereign" });
    return;
  }
  setStatus(modal, "統治者作成をホストへ送信しています。", "ok");
  window.dispatchEvent(new CustomEvent("v39:multiplayer-sovereign-profile-submitted", { detail:profile }));
}

function openSovereignCreation(detail = {}, mode = "multiplayer") {
  const playerId = text(detail.playerId);
  const race = text(detail.race);
  if (!playerId || (mode === "multiplayer" && !race)) return;
  activeProfile = { playerId, race, mode, className:"", characterName:"統治者", villageName:"はじまりの村", step:mode === "local" ? "race" : "class" };
  const modal = getModal();
  renderSelection(modal);
  modal.classList.add("open");
}

window.addEventListener("v39:multiplayer-sovereign-required", event => openSovereignCreation(event.detail || {}));
window.addEventListener("v39:initial-sovereign-required", event => {
  if (window.getV39PlayMode?.() === "multiplayer" || window.isV39MultiplayerSetup?.() === true) return;
  openSovereignCreation(event.detail || {}, "local");
});
window.addEventListener("v39:game-state-changed", () => {
  if (!activeProfile) return;
  const state = window.getV39GameState?.();
  const player = Array.isArray(state?.players) && state.players.find(row => text(row?.id) === activeProfile.playerId);
  const hasSovereign = Array.isArray(player?.factionState?.units) && player.factionState.units.some(unit => unit?.isSovereign === true);
  if (!hasSovereign) return;
  document.getElementById("v39-initial-sovereign-modal")?.classList.remove("open");
  activeProfile = null;
});
