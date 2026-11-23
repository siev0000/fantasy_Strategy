import defaultIconRows from "../../../config/v39-icon-settings.json";

export { defaultIconRows };

const route = "/api/local/icon-settings";
const nameKeys = new Map([["装備", "装備名"], ["資源・資材", "データ分類"], ["道具", "名前"], ["画面用アイコン", "名前"]]);
const rowKey = (type, name) => JSON.stringify([type, String(name ?? "").trim()]);
export const iconStorageKey = "v39-icon-assignment-draft-v1";
function indexRows(rows) {
  return new Map(rows.filter(row=>row && nameKeys.has(row.種別)).map(row=>[rowKey(row.種別,row[nameKeys.get(row.種別)]),row]));
}
function browserRows(){
  try {
    const saved = globalThis.localStorage?.getItem(iconStorageKey);
    return saved === null || saved === undefined ? indexRows(defaultIconRows) : indexRows(JSON.parse(saved));
  } catch { return indexRows(defaultIconRows); }
}
let sharedRows = browserRows();
export function saveBrowserIconSettings(rows){
  localStorage.setItem(iconStorageKey, JSON.stringify(rows));
  sharedRows=indexRows(rows);
}

export function getV39SharedIconRow(type, name) {
  return sharedRows.get(rowKey(type, name));
}

async function requestSettings(options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  let response;
  let result;
  try {
    response = await fetch(route, {...options, cache:"no-store", signal:controller.signal});
    if (!response.headers.get("content-type")?.includes("application/json")) return null;
    if (!options && [403, 404].includes(response.status)) return null;
    result = await response.json();
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(result.error || "共有JSONに接続できませんでした");
  if (!Array.isArray(result.rows) || !(result.revision === null || typeof result.revision === "string")) return null;
  sharedRows = result.revision===null ? browserRows() : indexRows(result.rows);
  return result;
}

export async function loadV39SharedIconSettings() {
  const host = globalThis.location?.hostname ?? "";
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\]|(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[\d.]+)$/.test(host)) return null;
  return requestSettings();
}

export async function saveV39SharedIconSettings(revision, rows) {
  const result = await requestSettings({
    method:"PUT",
    headers:{"Content-Type":"application/json", "X-V39-Local-Editor":"1"},
    body:JSON.stringify({revision, rows})
  });
  if (!result) throw new Error("共有JSONに保存できませんでした");
  return result;
}
