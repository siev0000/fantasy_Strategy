import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";

const CACHE_NAME_SUFFIX = "-cache";
// 通常表示はマップ全体が縮小されるため、半解像度で焼き込んでも視認性を維持できる。
// これにより地形・高低差・Fogの3層をキャッシュしてもVRAM増加を抑える。
const CACHE_RESOLUTION = 0.5;
// 1枚あたりの上限。RGBA換算で約36MiBを超える大きなマップでは、
// VRAMを増やさず従来のGraphics描画を使う。
const MAX_CACHE_PIXELS = 9_000_000;

function cacheNameFor(sourceName) {
  return `${String(sourceName || "v39-static-layer")}${CACHE_NAME_SUFFIX}`;
}

function resolveWorldSize(data) {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  const w = Math.max(1, Math.floor(Number(data?.w) || 1));
  const h = Math.max(1, Math.floor(Number(data?.h) || 1));
  return {
    width:Math.ceil((w * width) + oddRowOffsetX + 2),
    height:Math.ceil(((h - 1) * rowStep) + height + 2)
  };
}

function supportsCache(scene, size) {
  if (!scene?.add?.renderTexture || !size || (size.width * size.height) > MAX_CACHE_PIXELS) return false;
  const gl = scene.game?.renderer?.gl;
  if (!gl) return false;
  const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
  return Number.isFinite(maxTextureSize) && size.width <= maxTextureSize && size.height <= maxTextureSize;
}

export function removeStaticGraphicsCache(scene, sourceName) {
  const targetName = cacheNameFor(sourceName);
  for (const child of [...(scene?.children?.list || [])]) {
    if (child?.name === targetName) child.destroy();
  }
}

// 静的GraphicsをRenderTextureへ焼き込む。元Graphicsは直後に空にするため、
// 通常フレームで大量の描画コマンドを再実行しない。
export function cacheStaticGraphicsLayer(scene, data, graphics, options = {}) {
  if (!scene || !graphics) return false;
  const sourceName = String(options.name || graphics.name || "v39-static-layer");
  const world = resolveWorldSize(data);
  const size = {
    width:Math.max(1, Math.ceil(world.width * CACHE_RESOLUTION)),
    height:Math.max(1, Math.ceil(world.height * CACHE_RESOLUTION))
  };
  if (!supportsCache(scene, size)) {
    removeStaticGraphicsCache(scene, sourceName);
    graphics.setVisible(true);
    return false;
  }

  const targetName = cacheNameFor(sourceName);
  let cache = [...(scene.children?.list || [])].find(child => child?.name === targetName) || null;
  if (!cache || cache.width !== size.width || cache.height !== size.height) {
    cache?.destroy?.();
    cache = scene.add.renderTexture(0, 0, size.width, size.height);
    cache.setName(targetName);
    cache.setOrigin(0, 0);
  }
  cache.setDepth(Number.isFinite(Number(options.depth)) ? Number(options.depth) : graphics.depth);
  cache.setDisplaySize(world.width, world.height);
  graphics.setVisible(true);
  graphics.setScale(CACHE_RESOLUTION);
  cache.clear();
  cache.draw(graphics);
  graphics.setScale(1);
  graphics.clear();
  graphics.setVisible(false);
  return true;
}
