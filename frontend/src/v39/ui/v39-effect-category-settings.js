import { getV39EffectSettingsCatalog } from "../../lib/v39-effect-settings.js";
import {
  getV39EffectCategories,
  resetV39EffectCategories,
  updateV39EffectCategory
} from "../../lib/v39-effect-category-settings.js";

const TAB_ID = "v39-effect-category-tab";
const PANEL_ID = "v39-effect-category-panel";
const STYLE_ID = "v39-effect-category-style";
let installed = false;
let observer = null;

function element(id) {
  return document.getElementById(id);
}

function installStyles() {
  if (element(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .v39-effect-settings-tabs{grid-template-columns:repeat(5,minmax(0,1fr))!important}
    #${PANEL_ID}{gap:8px}
    .v39-effect-category-group{display:grid;gap:6px}
    .v39-effect-category-group>h3{margin:4px 2px 0;font-size:var(--font-secondary);color:#dcebea}
    .v39-effect-category-row{display:grid;grid-template-columns:minmax(120px,.75fr) minmax(0,1.25fr);align-items:center;gap:7px;padding:7px 8px;border:1px solid #33474e;border-radius:7px;background:#111d22}
    .v39-effect-category-row>span{font-size:var(--font-secondary);font-weight:800;color:#c7d4d5}
    .v39-effect-category-row select{width:100%;min-width:0;min-height:38px;border:1px solid #50646b;border-radius:6px;background:#0d171b;color:#eef5f2;padding:4px 7px;font:inherit}
    .v39-effect-category-actions{display:flex;justify-content:flex-end}
    .v39-effect-category-actions button{min-height:38px;border:1px solid #49646d;border-radius:7px;background:#173039;color:#eef8f5;padding:6px 10px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    @media(max-width:600px){
      .v39-effect-category-row{grid-template-columns:1fr;gap:5px;padding:7px}
      .v39-effect-category-row select{min-height:40px}
    }
  `;
  document.head.appendChild(style);
}

function setStatus(message, isError = false) {
  const status = element("v39-effect-settings-status");
  if (!status) return;
  status.textContent = String(message || "");
  status.classList.toggle("is-error", !!isError);
}

function createEffectSelect(category, catalog) {
  const select = document.createElement("select");
  select.dataset.v39EffectCategoryId = category.id;
  select.setAttribute("aria-label", `${category.name}の基本エフェクト`);
  for (const effectName of catalog) {
    const option = document.createElement("option");
    option.value = effectName;
    option.textContent = effectName;
    select.appendChild(option);
  }
  select.value = category.effectName;
  select.addEventListener("change", () => {
    const updated = updateV39EffectCategory(category.id, select.value);
    if (!updated) return;
    const source = element("v39-effect-setting-source");
    if (source instanceof HTMLSelectElement) {
      source.value = updated.effectName;
      source.dispatchEvent(new Event("change", { bubbles:true }));
    }
    setStatus(`${updated.name} → ${updated.effectName} に変更しました。`);
  });
  return select;
}

function renderCategoryRows() {
  const panel = element(PANEL_ID);
  if (!(panel instanceof HTMLElement)) return;
  const catalog = getV39EffectSettingsCatalog();
  const categories = getV39EffectCategories();
  panel.replaceChildren();

  const note = document.createElement("p");
  note.className = "v39-effect-settings-note";
  note.textContent = `${categories.length}カテゴリの基本エフェクトを編集します。現在は仮割当で、スキル個別の自動分類にはまだ接続していません。`;
  panel.appendChild(note);

  for (const [group, title] of [["attack", "攻撃系"], ["support", "補助系"]]) {
    const wrapper = document.createElement("section");
    wrapper.className = "v39-effect-category-group";
    const heading = document.createElement("h3");
    heading.textContent = title;
    wrapper.appendChild(heading);
    for (const category of categories.filter(item => item.group === group)) {
      const row = document.createElement("label");
      row.className = "v39-effect-category-row";
      const name = document.createElement("span");
      name.textContent = category.name;
      row.append(name, createEffectSelect(category, catalog));
      wrapper.appendChild(row);
    }
    panel.appendChild(wrapper);
  }

  const actions = document.createElement("div");
  actions.className = "v39-effect-category-actions";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "仮割当に戻す";
  reset.addEventListener("click", () => {
    resetV39EffectCategories();
    renderCategoryRows();
    setStatus("18カテゴリを仮割当に戻しました。");
  });
  actions.appendChild(reset);
  panel.appendChild(actions);
}

function showCategoryTab() {
  for (const button of document.querySelectorAll("[data-v39-effect-tab]")) {
    button.setAttribute("aria-selected", button.id === TAB_ID ? "true" : "false");
  }
  for (const panel of document.querySelectorAll("[data-v39-effect-panel]")) {
    panel.hidden = panel.id !== PANEL_ID;
  }
  const guides = element("v39-effect-gradient-guides");
  if (guides) guides.hidden = true;
  renderCategoryRows();
}

function ensureCategoryUi() {
  const tabs = document.querySelector(".v39-effect-settings-tabs");
  const body = document.querySelector(".v39-effect-settings-body");
  if (!(tabs instanceof HTMLElement) || !(body instanceof HTMLElement)) return false;

  installStyles();
  let button = element(TAB_ID);
  if (!(button instanceof HTMLButtonElement)) {
    button = document.createElement("button");
    button.type = "button";
    button.id = TAB_ID;
    button.className = "v39-effect-settings-tab";
    button.dataset.v39EffectTab = "categories";
    button.setAttribute("aria-selected", "false");
    button.textContent = "カテゴリ";
    tabs.appendChild(button);
    button.addEventListener("click", showCategoryTab);
  }

  let panel = element(PANEL_ID);
  if (!(panel instanceof HTMLElement)) {
    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "v39-effect-settings-tabpanel";
    panel.dataset.v39EffectPanel = "categories";
    panel.hidden = true;
    body.appendChild(panel);
  }
  renderCategoryRows();
  return true;
}

function install() {
  if (installed) return;
  if (ensureCategoryUi()) {
    installed = true;
    observer?.disconnect();
    observer = null;
    return;
  }
  if (!observer && document.body) {
    observer = new MutationObserver(() => {
      if (ensureCategoryUi()) {
        installed = true;
        observer?.disconnect();
        observer = null;
      }
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }
}

window.addEventListener("v39:effect-settings-changed", () => {
  if (!element(PANEL_ID)?.hidden) renderCategoryRows();
});
window.addEventListener("v39:effect-category-settings-changed", () => {
  if (!element(PANEL_ID)?.hidden) renderCategoryRows();
});

install();
