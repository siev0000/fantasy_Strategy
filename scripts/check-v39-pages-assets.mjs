import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";

const output = resolve(process.argv[2] ?? "web-vue-dist");
const basePath = process.env.VITE_BASE_PATH || "/fantasy_Strategy/";
const html = readFileSync(resolve(output,"index.html"),"utf8");
const mustExist = relative => assert.ok(statSync(resolve(output,relative)).isFile(),relative);
const pageAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(([,url])=>url).filter(url=>/^\/(?!\/)/.test(url));
assert.ok(pageAssets.some(url=>url.endsWith("王冠.webp")), "favicon is missing");
for (const url of pageAssets) {
  assert.ok(url.startsWith(basePath),`Asset URL escapes the Pages base: ${url}`);
  mustExist(decodeURIComponent(url.slice(basePath.length)));
}

const audio = JSON.parse(readFileSync("config/v39-audio-catalog.json","utf8"));
for (const [folder, files] of Object.entries(audio)) {
  for (const file of files) mustExist(`assets/audio/${folder}/${file}`);
}
for (const path of [
  "config/v39-enchantment-colors.json",
  "data/source/export/json/スキル一覧.json",
  "assets/images/アイコン/闇の輪.webp",
  "assets/images/background/pipo-fog018.webp"
]) mustExist(path);

console.log(`Pages static files OK under ${basePath}`);
