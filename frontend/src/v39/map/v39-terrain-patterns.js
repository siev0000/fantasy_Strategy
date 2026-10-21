import config from '../../../../config/v39-terrain-patterns.json';
import {hegemonyZoneAt} from '../../lib/v39-hegemony-areas.js';
import { HEX_TILE_CONFIG } from '../../lib/phaser-map-panel-config.js';

const SOURCE_KEY = 'v39-terrain-pattern-source';
const rawTerrainPatternModules = import.meta.glob('../../../../assets/images/units/1ファイルまとめ/*.{png,jpg,jpeg,webp,svg}', {
  eager: true,
  import: 'default'
});

function resolveBundledTerrainAsset(path) {
  const normalized = String(path ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return '';
  const match = Object.entries(rawTerrainPatternModules)
    .find(([modulePath]) => modulePath.replace(/\\/g, '/').endsWith(normalized));
  return String(match?.[1] || '');
}

const TERRAIN_SOURCE_URL = resolveBundledTerrainAsset(config.asset);

export function loadV39TerrainPatterns(scene, getData, getDisplay) {
  if (!TERRAIN_SOURCE_URL) {
    console.warn('[v39 terrain] terrain artwork was not bundled:', config.asset);
    return;
  }
  const loaded = () => {
    clearPatterns(scene);
    drawV39TerrainPatterns(scene, getData(), getDisplay());
    window.renderV39TerrainIcons?.();
    scene.game.v39InvalidateRender?.();
  };
  scene.load.once(`filecomplete-image-${SOURCE_KEY}`, loaded);
  scene.events.once('shutdown', () => scene.load.off(`filecomplete-image-${SOURCE_KEY}`, loaded));
  scene.load.image(SOURCE_KEY, TERRAIN_SOURCE_URL);
  scene.load.start();
}

export function hasV39TerrainPattern(scene, terrain) {
  return (scene.v39TerrainPatterns?.terrainCounts?.[terrain] || 0)>0;
}

export function terrainPatternNameAt(data,x,y){
  const appearance=hegemonyZoneAt(data,x,y);
  if(appearance?.visualTerrain)return appearance.visualTerrain;
  const special=data.specialMap?.[y]?.[x];
  return ['沼地','湿地'].includes(special)?special:data.grid[y]?.[x];
}

export function terrainHeightBrightness(level, enabled = true) {
  if (!enabled || !Number.isFinite(level)) return 1;
  const rule = config.heightBrightness;
  const t = Math.max(0, Math.min(1, (level - rule.minimumLevel) / (rule.maximumLevel - rule.minimumLevel)));
  return rule.low + (rule.high - rule.low) * t;
}

export function terrainPatternCrop(image, frame) {
  const width = image.width / config.columns, height = image.height / config.rows;
  const inset = config.insetRatio;
  return {
    x: ((frame - 1) % config.columns + inset) * width,
    y: (Math.floor((frame - 1) / config.columns) + inset) * height,
    width: width * (1 - inset * 2), height: height * (1 - inset * 2)
  };
}

function clearPatterns(scene) {
  for (const chunk of scene.v39TerrainPatterns?.chunks || []) {
    chunk.image.destroy();
    scene.textures.remove(chunk.key);
  }
  scene.v39TerrainPatterns = null;
}

// Bake cropped artwork into bounded textures, not thousands of live tile sprites.
export function drawV39TerrainPatterns(scene, data, display = {}) {
  const signature = data.isUnderground ? 'underground' : `${data.w}:${data.h}:${display.heightShading}:${display.heightOutlineOnly}:${JSON.stringify(data.heightLevelMap)}:${data.grid.map((row,y) => row.map((_,x)=>terrainPatternNameAt(data,x,y)).join('|')).join(';')}`;
  if (scene.v39TerrainPatterns?.signature === signature) return;
  clearPatterns(scene);
  const state = { signature, chunks: [], tileCount: 0,terrainCounts:{} };
  scene.v39TerrainPatterns = state;
  if (!scene.v39TerrainPatternsCleanup) {
    scene.v39TerrainPatternsCleanup = true;
    scene.events.once('shutdown', () => clearPatterns(scene));
  }
  if (data.isUnderground || !scene.textures.exists(SOURCE_KEY)) return;
  const source = scene.textures.get(SOURCE_KEY).getSourceImage();
  const { width, height, rowStep, oddRowOffsetX } = HEX_TILE_CONFIG;
  const scale = config.resolution, size = config.chunkSize;
  const chunks = new Map();
  const artwork = new Map();
  for (let y = 0; y < data.h; y++) for (let x = 0; x < data.w; x++) {
    const terrain=terrainPatternNameAt(data,x,y),rule = config.terrains[terrain];
    if (!rule) continue;
    const left = x * width + (y % 2 ? oddRowOffsetX : 0), top = y * rowStep;
    const crop = terrainPatternCrop(source, rule.frame);
    const brightness = terrainHeightBrightness(Number(data.heightLevelMap?.[y]?.[x]), display.heightShading !== false);
    const artworkKey = `${rule.frame}:${brightness}`;
    let tile = artwork.get(artworkKey);
    if (!tile) {
      tile = document.createElement('canvas'); tile.width = width; tile.height = height;
      const context = tile.getContext('2d');
      context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      // Shade each terrain/height variant once, including browsers without Canvas filters.
      const pixels = context.getImageData(0, 0, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) for (let c = 0; c < 3; c++) pixels.data[i+c] = Math.min(255, Math.round(pixels.data[i+c] * brightness));
      context.putImageData(pixels, 0, 0); artwork.set(artworkKey, tile);
    }
    for (let cy = Math.floor(top * scale / size); cy <= Math.floor((top + height) * scale / size); cy++) {
      for (let cx = Math.floor(left * scale / size); cx <= Math.floor((left + width) * scale / size); cx++) {
        const id = `${cx}:${cy}`;
        let chunk = chunks.get(id);
        if (!chunk) {
          const key = `v39-terrain-pattern-${id}`;
          const texture = scene.textures.createCanvas(key, size, size);
          const image = scene.add.image(cx * size / scale, cy * size / scale, key)
            .setOrigin(0).setScale(1 / scale).setDepth(0.1).setName('v39-terrain-pattern-chunk');
          chunk = { key, texture, image }; chunks.set(id, chunk); state.chunks.push(chunk);
        }
        const ctx = chunk.texture.context;
        ctx.save();
        ctx.translate(-cx * size, -cy * size); ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.moveTo(left + width / 2, top);
        ctx.lineTo(left + width, top + height - rowStep);
        ctx.lineTo(left + width, top + rowStep);
        ctx.lineTo(left + width / 2, top + height);
        ctx.lineTo(left, top + rowStep); ctx.lineTo(left, top + height - rowStep);
        ctx.closePath(); ctx.clip(); ctx.globalAlpha = rule.alpha;
        ctx.drawImage(tile, left, top, width, height);
        if (display.heightOutlineOnly === false) {
          ctx.globalAlpha = 0.95; ctx.strokeStyle = '#26353b'; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.restore();
      }
    }
    state.tileCount++;
    state.terrainCounts[terrain]=(state.terrainCounts[terrain]||0)+1;
  }
  for (const chunk of chunks.values()) chunk.texture.refresh();
}
