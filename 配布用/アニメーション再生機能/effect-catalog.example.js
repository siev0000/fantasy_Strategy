// Viteで配布素材を読み込む例です。別の配置にする場合はパスだけ変更してください。
import effectList320 from "./assets/effect/320×240/effect_list.json";
import effectListAnimation1 from "./assets/effect/アニメーション1/effect_list.json";

const modules320 = import.meta.glob("./assets/effect/320×240/*.{webp,png,jpg,jpeg,avif,gif}", {
  eager: true,
  import: "default"
});
const modulesAnimation1 = import.meta.glob("./assets/effect/アニメーション1/*.{webp,png,jpg,jpeg,avif,gif}", {
  eager: true,
  import: "default"
});

function toSourceMap(modules) {
  return new Map(Object.entries(modules).map(([path, src]) => [
    (path.split("/").pop() || "").replace(/\.(webp|png|jpg|jpeg|avif|gif)$/i, ""),
    src
  ]));
}

const catalog = [];
const usedNames = new Set();

function appendListedEffects(names, modules, sourceScaleMultiplier = 1) {
  const sourceMap = toSourceMap(modules);
  for (const rawName of Array.isArray(names) ? names : []) {
    const name = String(rawName || "").trim();
    const src = sourceMap.get(name);
    if (!name || !src || usedNames.has(name)) continue;
    usedNames.add(name);
    catalog.push({ name, src, sourceScaleMultiplier });
  }
}

appendListedEffects(effectList320, modules320);
appendListedEffects(effectListAnimation1, modulesAnimation1, 2);

export const effectCatalog = catalog;
