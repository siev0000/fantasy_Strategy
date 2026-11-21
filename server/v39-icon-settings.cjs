const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const {localRequest} = require("./v39-effect-local-draft.cjs");
const definitions = require("../config/v39-icon-sheets.json");
const terrain = require("../config/v39-terrain-patterns.json");
async function loadSheets(root) {
  const {iconSheetCatalog} = await import("../config/v39-icon-catalog.mjs");
  const entries = await fs.readdir(path.join(root,"assets/images/アイコン"), {withFileTypes:true});
  const filenames = entries.filter(entry => entry.isFile()).map(entry => entry.name);
  return new Map(iconSheetCatalog(definitions, terrain, filenames).map(sheet => [sheet.filename, sheet]));
}

const route = "/api/local/icon-settings";
const keysByType = new Map([["装備","装備名"],["資源・資材","データ分類"],["道具","名前"],["画面用アイコン","名前"]]);
const revisionOf = text => crypto.createHash("sha256").update(text).digest("hex");

function validateRows(rows, sheets) {
  if (!Array.isArray(rows) || rows.length > 2048) return false;
  const seen = new Set();
  return rows.every(row => {
    const nameKey = keysByType.get(row?.種別);
    const name = nameKey && row[nameKey];
    if (typeof name !== "string" || !name.trim() || name.length > 256) return false;
    const key = JSON.stringify([row.種別,name.trim()]);
    if (seen.has(key)) return false;
    seen.add(key);
    if (row.アイコン色 !== undefined && (typeof row.アイコン色 !== "string" || !/^#[0-9a-f]{6}$/i.test(row.アイコン色))) return false;
    if (row.文字アイコン !== undefined) {
      return row.画像ファイル === "" && row.画像番号 === null
        && typeof row.文字アイコン === "string" && row.文字アイコン.trim().length > 0
        && Array.from(row.文字アイコン).length <= 16;
    }
    if (row.画像ファイル === "" && row.画像番号 === null) return row.アイコン色 === undefined;
    const sheet = sheets.get(row.画像ファイル);
    return !!sheet && Number.isInteger(row.画像番号) && row.画像番号 >= sheet.firstNumber
      && row.画像番号 <= (sheet.lastNumber ?? sheet.columns * sheet.rows)
      && !sheet.excludedNumbers?.includes(row.画像番号);
  });
}

async function acquireLock(lock) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { return await fs.open(lock,"wx"); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      await new Promise(resolve => setTimeout(resolve,20));
    }
  }
  throw new Error("Icon settings write lock unavailable");
}

function installV39SharedIconSettings(app, {root, enabled = true}) {
  const file = path.join(root,"config","local","v39-icon-settings.json");
  const read = async () => {
    try {
      const text = await fs.readFile(file,"utf8");
      const rows = JSON.parse(text);
      if (!validateRows(rows, await loadSheets(root))) throw new Error("Invalid icon settings");
      return {revision:revisionOf(text), rows};
    } catch (error) {
      if (error.code === "ENOENT") return {revision:null, rows:[]};
      throw error;
    }
  };
  app.use(/^\/config\/local\/v39-icon-settings\.json(?:\.|$)/i, (_req,res) => res.sendStatus(404));
  app.use(route,(req,res,next) => {
    res.set("Cache-Control","no-store");
    if (!enabled || !localRequest(req)) return res.status(403).json({error:"同じLANのローカル開発サーバーから利用できます。"});
    if (req.method === "PUT" && req.get("x-v39-local-editor") !== "1") return res.status(403).json({error:"編集用ヘッダーが必要です。"});
    next();
  });
  app.get(route,async (_req,res) => {
    try { res.json(await read()); }
    catch { res.status(500).json({error:"アイコン設定JSONを読み込めません。"}); }
  });
  app.put(route,express.json({limit:"256kb",strict:true}),async (req,res) => {
    const {revision, rows} = req.body || {};
    if (!(revision === null || typeof revision === "string" && /^[0-9a-f]{64}$/.test(revision)) || !validateRows(rows, await loadSheets(root))) {
      return res.status(400).json({error:"アイコン設定JSONの形式が正しくありません。"});
    }
    const lock = file + ".lock";
    const temp = file + "." + crypto.randomUUID() + ".tmp";
    let handle;
    try {
      await fs.mkdir(path.dirname(file),{recursive:true});
      handle = await acquireLock(lock);
      if ((await read()).revision !== revision) {
        return res.status(409).json({error:"別の端末が保存しました。編集中の内容をJSON出力してから、画面を開き直してください。"});
      }
      const text = JSON.stringify(rows,null,2)+"\n";
      await fs.writeFile(temp,text,"utf8");
      await fs.rename(temp,file);
      res.json({revision:revisionOf(text), rows});
    } catch {
      if (!res.headersSent) res.status(500).json({error:"アイコン設定JSONを保存できませんでした。"});
    } finally {
      await fs.unlink(temp).catch(() => {});
      if (handle) {
        await handle.close().catch(() => {});
        await fs.unlink(lock).catch(() => {});
      }
    }
  });
}

module.exports = {installV39SharedIconSettings};
