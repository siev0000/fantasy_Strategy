const PANEL_ID = "footTile";

const LAND_FIELD_IDS = Object.freeze({
  "地形": "v39-land-terrain",
  "領土": "v39-land-owner",
  "危険度": "v39-land-danger",
  "高度": "v39-land-height",
  "施設": "v39-land-facility",
  "ユニット": "v39-land-units",
  "町状態": "v39-land-settlement",
  "領土状態": "v39-land-territory-state",
  "回復補正": "v39-land-recovery",
  "移動停止": "v39-land-move-stop",
  "川 / 滝": "v39-land-river-waterfall",
  "敵": "v39-land-enemies"
});

function text(value, fallback = "-") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function coordKey(x, y) {
  return `${Math.floor(Number(x))},${Math.floor(Number(y))}`;
}

function isSetLikeHas(value, key) {
  return value instanceof Set ? value.has(key) : false;
}

function bindFixedLandFields() {
  const panel = document.getElementById(PANEL_ID);
  if (!(panel instanceof HTMLElement)) return null;

  for (const item of panel.querySelectorAll(".land-item")) {
    const label = item.querySelector("span")?.textContent?.trim() || "";
    const output = item.querySelector("b");
    const id = LAND_FIELD_IDS[label];
    if (id && output instanceof HTMLElement) output.id = id;
  }

  const firstLabel = panel.querySelector(".land-item span");
  if (firstLabel) firstLabel.textContent = "地形 / 座標";
  return panel;
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = text(value);
}

function resetLandPanel(message = "マスを選択") {
  setField("v39-land-terrain", message);
  setField("v39-land-owner", "未所属");
  setField("v39-land-danger", "未接続");
  setField("v39-land-height", "-");
  setField("v39-land-facility", "なし");
  setField("v39-land-units", "なし");
  setField("v39-land-settlement", "なし");
  setField("v39-land-territory-state", "未所属");
  setField("v39-land-recovery", "-");
  setField("v39-land-move-stop", "-");
  setField("v39-land-river-waterfall", "なし / なし");
  setField("v39-land-enemies", "なし");
}

function resolveGeneratedTileDetail(selected) {
  const runtime = window.__v39FieldRuntime;
  const data = runtime?.mapData;
  const x = Math.floor(Number(selected?.x));
  const y = Math.floor(Number(selected?.y));
  if (!data || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= data.w || y >= data.h) {
    return null;
  }

  const key = coordKey(x, y);
  const terrain = text(data.grid?.[y]?.[x], "不明");
  const relief = text(data.reliefMap?.[y]?.[x], "");
  const special = text(data.specialMap?.[y]?.[x], "");
  const heightLevelRaw = Number(data.heightLevelMap?.[y]?.[x]);
  const heightRaw = Number(data.heightMap?.[y]?.[x]);
  const riverData = data.riverData || {};
  const riverTouchSet = riverData.riverTouchSet;
  const riverSet = riverData.riverSet;
  const majorRiverSet = riverData.largeRiverSet;
  const waterfallSet = riverData.waterfallSet;

  const hasRiver = isSetLikeHas(riverTouchSet, key) || isSetLikeHas(riverSet, key);
  const hasMajorRiver = isSetLikeHas(majorRiverSet, key);
  const hasWaterfall = isSetLikeHas(waterfallSet, key);
  const isStrongCandidate = data.strongMonsterMap?.[y]?.[x] === "強敵候補";
  const strongInfo = data.strongMonsterInfoMap?.[y]?.[x] || null;

  return {
    x,
    y,
    terrain,
    relief,
    special,
    heightLevel: Number.isFinite(heightLevelRaw) ? heightLevelRaw : null,
    heightRaw: Number.isFinite(heightRaw) ? heightRaw : null,
    river: hasMajorRiver ? "大河" : hasRiver ? "あり" : "なし",
    waterfall: hasWaterfall ? "あり" : "なし",
    isStrongCandidate,
    strongInfo
  };
}

function formatTerrain(detail) {
  const parts = [detail.terrain];
  if (detail.relief && detail.relief !== detail.terrain) parts.push(`地勢:${detail.relief}`);
  if (detail.special) parts.push(`特殊:${detail.special}`);
  return `${parts.join(" / ")} / (${detail.x}, ${detail.y})`;
}

function formatHeight(detail) {
  const level = detail.heightLevel === null ? "-" : `Lv ${detail.heightLevel}`;
  const raw = detail.heightRaw === null ? "" : ` / Raw ${Math.round(detail.heightRaw)}`;
  return `${level}${raw}`;
}

function formatStrongEnemy(detail) {
  if (!detail.isStrongCandidate) return "なし（未配置）";
  const info = detail.strongInfo;
  if (!info || typeof info !== "object") return "強敵候補";
  const label = text(info.name || info.label || info.ruleName || info.type, "強敵候補");
  return label === "強敵候補" ? label : `強敵候補 / ${label}`;
}

function renderLandDetail(selected) {
  const detail = resolveGeneratedTileDetail(selected);
  if (!detail) {
    resetLandPanel();
    return;
  }

  setField("v39-land-terrain", formatTerrain(detail));
  setField("v39-land-owner", "未所属");
  setField("v39-land-danger", detail.isStrongCandidate ? "強敵候補" : "未接続");
  setField("v39-land-height", formatHeight(detail));
  setField("v39-land-facility", "なし");
  setField("v39-land-units", "なし");
  setField("v39-land-settlement", "なし");
  setField("v39-land-territory-state", "未所属");
  setField("v39-land-recovery", "-");
  setField("v39-land-move-stop", "-");
  setField("v39-land-river-waterfall", `${detail.river} / ${detail.waterfall}`);
  setField("v39-land-enemies", formatStrongEnemy(detail));

  const panel = document.getElementById(PANEL_ID);
  if (panel) {
    panel.dataset.selectedX = String(detail.x);
    panel.dataset.selectedY = String(detail.y);
    panel.dataset.selectedTerrain = detail.terrain;
  }

  window.dispatchEvent(new CustomEvent("v39:land-detail-updated", { detail }));
}

function install() {
  const panel = bindFixedLandFields();
  if (!panel) {
    window.setTimeout(install, 50);
    return;
  }

  resetLandPanel();
  window.addEventListener("v39:tile-selected", event => renderLandDetail(event.detail));
  window.addEventListener("v39:field-generated", () => resetLandPanel("マスを選択"));

  window.getV39SelectedLandDetail = () => {
    const x = Number(panel.dataset.selectedX);
    const y = Number(panel.dataset.selectedY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return resolveGeneratedTileDetail({ x, y });
  };
}

install();
