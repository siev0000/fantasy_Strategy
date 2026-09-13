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

let selectedCoord = null;

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
  selectedCoord = null;
  setField("v39-land-terrain", message);
  setField("v39-land-owner", "未所属");
  setField("v39-land-danger", "-");
  setField("v39-land-height", "-");
  setField("v39-land-facility", "なし");
  setField("v39-land-units", "なし");
  setField("v39-land-settlement", "なし");
  setField("v39-land-territory-state", "未所属");
  setField("v39-land-recovery", "+0%");
  setField("v39-land-move-stop", "-");
  setField("v39-land-river-waterfall", "なし / なし");
  setField("v39-land-enemies", "なし");
}

function gameState() {
  try {
    return typeof window.getV39GameState === "function" ? window.getV39GameState() : {};
  } catch {
    return {};
  }
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
  const hasRiver = isSetLikeHas(riverData.riverTouchSet, key) || isSetLikeHas(riverData.riverSet, key);
  const hasMajorRiver = isSetLikeHas(riverData.largeRiverSet, key);
  const hasWaterfall = isSetLikeHas(riverData.waterfallSet, key);
  const isStrongCandidate = data.strongMonsterMap?.[y]?.[x] === "強敵候補";
  const strongInfo = data.strongMonsterInfoMap?.[y]?.[x] || null;

  return {
    x,
    y,
    key,
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

function entitiesAt(rows, x, y) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => Math.floor(Number(row?.x)) === x && Math.floor(Number(row?.y)) === y);
}

function resolveOwnerLabel(state, key) {
  const owner = state?.territoryOwnerByTile?.[key];
  if (!owner) return "未所属";
  if (typeof owner === "string") {
    if (owner === "player") return "自領";
    if (owner === "enemy") return "敵領";
    const label = state?.factionLabels?.[owner];
    return label ? `${label}領` : `${owner}領`;
  }
  if (typeof owner === "object") {
    if (owner.owner === "player" || owner.type === "player") return "自領";
    if (owner.owner === "enemy" || owner.type === "enemy") return "敵領";
    const factionId = text(owner.factionId || owner.ownerFactionId, "");
    const explicit = text(owner.label || owner.factionLabel, "");
    if (explicit) return explicit.endsWith("領") ? explicit : `${explicit}領`;
    if (factionId) {
      const label = text(state?.factionLabels?.[factionId], factionId);
      return `${label}領`;
    }
  }
  return "未所属";
}

function formatDanger(state, detail) {
  const raw = Number(state?.dangerPercentByTile?.[detail.key]);
  if (Number.isFinite(raw)) return `${Math.max(0, Math.round(raw))}%`;
  return detail.isStrongCandidate ? "強敵候補" : "-";
}

function formatFacilities(state, key) {
  const raw = state?.facilitiesByTile?.[key];
  if (Array.isArray(raw)) {
    const labels = raw.map(row => typeof row === "string" ? row : row?.name || row?.label || row?.facilityName).map(v => text(v, "")).filter(Boolean);
    return labels.length ? labels.join(" / ") : "なし";
  }
  if (raw && typeof raw === "object") return text(raw.name || raw.label || raw.facilityName, "なし");
  return text(raw, "なし");
}

function formatUnits(state, detail) {
  const activeFaction = typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : null;
  const rows = entitiesAt(activeFaction?.units, detail.x, detail.y);
  if (!rows.length) return "なし";
  return rows.map(row => {
    const name = text(row.name || row.unitName || row.squadName, "ユニット");
    const lv = Number(row.level ?? row.lv);
    return Number.isFinite(lv) ? `${name} Lv${Math.floor(lv)}` : name;
  }).join(" / ");
}

function settlementAt(state, detail) {
  return entitiesAt(state?.settlements, detail.x, detail.y)[0] || null;
}

function formatSettlement(state, detail) {
  const row = settlementAt(state, detail);
  if (!row) return "なし";
  const name = text(row.name, "村");
  const scale = text(row.scaleLabel || row.scale || row.type, "");
  const population = Number(row.population);
  const parts = [name];
  if (scale && scale !== name) parts.push(scale);
  if (Number.isFinite(population)) parts.push(`人口${Math.max(0, Math.floor(population)).toLocaleString("ja-JP")}`);
  return parts.join(" / ");
}

function formatTerritoryState(state, detail, ownerLabel) {
  const raw = state?.territoryStateByTile?.[detail.key];
  if (!raw) return ownerLabel === "未所属" ? "未所属" : "領土";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    const mode = text(raw.label || raw.modeLabel || raw.mode || raw.type, "");
    const progress = Number(raw.progressPercent ?? raw.progress);
    if (mode && Number.isFinite(progress)) return `${mode} / ${Math.round(progress)}%`;
    return mode || "領土";
  }
  return "領土";
}

function formatRecovery(state, key) {
  const raw = Number(state?.recoveryPercentByTile?.[key]);
  if (!Number.isFinite(raw)) return "+0%";
  const rounded = Math.round(raw);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function formatMoveStop(state, detail) {
  const stop = state?.lastMoveStop;
  if (!stop || Math.floor(Number(stop.x)) !== detail.x || Math.floor(Number(stop.y)) !== detail.y) return "-";
  return text(stop.reason || stop.label, "-");
}

function formatStrongCandidate(detail) {
  if (!detail.isStrongCandidate) return "";
  const info = detail.strongInfo;
  if (!info || typeof info !== "object") return "強敵候補";
  const label = text(info.name || info.label || info.ruleName || info.type, "強敵候補");
  return label === "強敵候補" ? label : `強敵候補:${label}`;
}

function formatEnemies(state, detail) {
  const rows = entitiesAt(state?.enemies, detail.x, detail.y);
  const labels = rows.map(row => {
    const name = text(row.name || row.enemyName || row.type, "敵");
    const lv = Number(row.level ?? row.lv);
    return Number.isFinite(lv) ? `${name} Lv${Math.floor(lv)}` : name;
  });
  const strong = formatStrongCandidate(detail);
  if (strong) labels.push(strong);
  return labels.length ? labels.join(" / ") : "なし";
}

function buildFullDetail(selected) {
  const detail = resolveGeneratedTileDetail(selected);
  if (!detail) return null;
  const state = gameState();
  const ownerLabel = resolveOwnerLabel(state, detail.key);
  return {
    ...detail,
    owner: ownerLabel,
    danger: formatDanger(state, detail),
    facilities: formatFacilities(state, detail.key),
    units: formatUnits(state, detail),
    settlement: formatSettlement(state, detail),
    territoryState: formatTerritoryState(state, detail, ownerLabel),
    recovery: formatRecovery(state, detail.key),
    moveStop: formatMoveStop(state, detail),
    enemies: formatEnemies(state, detail)
  };
}

function renderLandDetail(selected) {
  const detail = buildFullDetail(selected);
  if (!detail) {
    resetLandPanel();
    return;
  }

  selectedCoord = { x: detail.x, y: detail.y };
  setField("v39-land-terrain", formatTerrain(detail));
  setField("v39-land-owner", detail.owner);
  setField("v39-land-danger", detail.danger);
  setField("v39-land-height", formatHeight(detail));
  setField("v39-land-facility", detail.facilities);
  setField("v39-land-units", detail.units);
  setField("v39-land-settlement", detail.settlement);
  setField("v39-land-territory-state", detail.territoryState);
  setField("v39-land-recovery", detail.recovery);
  setField("v39-land-move-stop", detail.moveStop);
  setField("v39-land-river-waterfall", `${detail.river} / ${detail.waterfall}`);
  setField("v39-land-enemies", detail.enemies);

  const panel = document.getElementById(PANEL_ID);
  if (panel) {
    panel.dataset.selectedX = String(detail.x);
    panel.dataset.selectedY = String(detail.y);
    panel.dataset.selectedTerrain = detail.terrain;
  }

  window.dispatchEvent(new CustomEvent("v39:land-detail-updated", { detail }));
}

function refreshSelectedLand() {
  if (selectedCoord) renderLandDetail(selectedCoord);
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
  window.addEventListener("v39:game-state-changed", refreshSelectedLand);

  window.getV39SelectedLandDetail = () => selectedCoord ? buildFullDetail(selectedCoord) : null;
  window.refreshV39LandDetail = refreshSelectedLand;
}

install();
