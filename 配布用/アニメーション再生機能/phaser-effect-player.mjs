const DEFAULT_OPTIONS = Object.freeze({
  spriteUnit: 120,
  verticalSplitWidth: 320,
  verticalFrameHeight: 120,
  totalDurationMs: 1500,
  sequenceGapMs: 10,
  depth: 1000000,
  baseScalePercent: 100,
  softMaskSize: 256,
  softMaskInnerRatio: 0.58,
  ellipseRatioThreshold: 1.15,
  blendMode: "SCREEN",
  crossOrigin: null
});

let instanceSerial = 0;

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(value) {
  const normalized = numberOr(value, 0) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function normalizeTint(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(Math.floor(value), 0, 0xffffff);
  }
  const body = String(value).trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(body) ? Number.parseInt(body, 16) : null;
}

function rotateHue(color, degrees) {
  const shift = numberOr(degrees, 0);
  if (!shift) return color;
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs((2 * lightness) - 1));

  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * (((b - r) / delta) + 2);
    else hue = 60 * (((r - g) / delta) + 4);
  }
  hue = ((hue + shift) % 360 + 360) % 360;

  const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - (chroma / 2);
  let rgb = [0, 0, 0];
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  const channels = rgb.map(channel => clamp(Math.round((channel + m) * 255), 0, 255));
  return (channels[0] << 16) | (channels[1] << 8) | channels[2];
}

function mixTintWithWhite(color, strengthPercent) {
  const ratio = clamp(numberOr(strengthPercent, 100), 0, 100) / 100;
  const mix = channel => Math.round(255 + (channel - 255) * ratio);
  return (mix((color >> 16) & 0xff) << 16)
    | (mix((color >> 8) & 0xff) << 8)
    | mix(color & 0xff);
}

function wait(ms) {
  const delay = Math.max(0, Math.floor(numberOr(ms, 0)));
  return delay > 0 ? new Promise(resolve => setTimeout(resolve, delay)) : Promise.resolve();
}

export const EFFECT_PLAYER_DEFAULTS = DEFAULT_OPTIONS;

export function resolveEffectSheetLayout(widthRaw, heightRaw, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const sourceWidth = Math.max(0, Math.floor(numberOr(widthRaw, 0)));
  const sourceHeight = Math.max(0, Math.floor(numberOr(heightRaw, 0)));
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { sourceWidth, sourceHeight, frameWidth: 0, frameHeight: 0, frameCount: 0, horizontal: false };
  }

  const fixedVertical = sourceWidth === settings.verticalSplitWidth
    && sourceHeight >= settings.verticalFrameHeight * 2;
  const horizontal = !fixedVertical && sourceWidth > sourceHeight;
  let frameCount = 1;

  if (fixedVertical) {
    frameCount = Math.max(1, Math.floor(sourceHeight / settings.verticalFrameHeight));
  } else if (horizontal) {
    frameCount = sourceWidth % sourceHeight === 0
      ? Math.max(1, Math.floor(sourceWidth / sourceHeight))
      : Math.max(1, Math.floor(sourceWidth / settings.spriteUnit));
  } else {
    frameCount = sourceHeight % sourceWidth === 0
      ? Math.max(1, Math.floor(sourceHeight / sourceWidth))
      : Math.max(1, Math.floor(sourceHeight / settings.spriteUnit));
  }

  return {
    sourceWidth,
    sourceHeight,
    frameWidth: horizontal ? Math.max(1, Math.floor(sourceWidth / frameCount)) : sourceWidth,
    frameHeight: horizontal
      ? sourceHeight
      : fixedVertical
        ? settings.verticalFrameHeight
        : Math.max(1, Math.floor(sourceHeight / frameCount)),
    frameCount,
    horizontal,
    fixedVertical
  };
}

export class PhaserEffectPlayer {
  constructor(scene, options = {}) {
    if (!scene?.add || !scene?.textures) {
      throw new TypeError("Phaser.Scene を指定してください。");
    }
    this.scene = scene;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.instanceId = ++instanceSerial;
    this.requestId = 0;
    this.textureKeys = new Map();
    this.effectImage = null;
    this.previousImage = null;
    this.maskImage = null;
    this.frameTimer = null;
    this.hideTimer = null;
    this.finishActivePlayback = null;
    this.destroyed = false;
  }

  async play(request = {}) {
    if (this.destroyed) return false;
    this.stop();
    const requestId = this.requestId;
    const x = numberOr(request.x ?? request.worldX, Number.NaN);
    const y = numberOr(request.y ?? request.worldY, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("再生位置 x, y は数値で指定してください。");
    }

    const sources = this.resolveSources(request);
    if (!sources.length) return false;
    request.onStart?.({ x, y, sources });

    let played = false;
    for (let index = 0; index < sources.length; index += 1) {
      if (requestId !== this.requestId || this.destroyed) break;
      const source = sources[index];
      played = await this.playSingle(source, request, { x, y }, requestId) || played;
      if (index < sources.length - 1 && requestId === this.requestId) {
        await wait(request.sequenceGapMs ?? this.options.sequenceGapMs);
      }
    }

    if (requestId === this.requestId) request.onComplete?.({ x, y, played });
    return played;
  }

  stop() {
    this.requestId += 1;
    this.clearActiveObjects();
  }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.scene = null;
    this.textureKeys.clear();
  }

  resolveSources(request) {
    const rawSources = Array.isArray(request.sequenceSources) && request.sequenceSources.length
      ? request.sequenceSources
      : request.src
        ? [request.src]
        : [];
    return rawSources.map(item => {
      if (typeof item === "string") {
        return { src: item, sourceScaleMultiplier: numberOr(request.sourceScaleMultiplier, 1) };
      }
      return {
        src: String(item?.src || "").trim(),
        sourceScaleMultiplier: numberOr(item?.sourceScaleMultiplier ?? request.sourceScaleMultiplier, 1)
      };
    }).filter(item => item.src);
  }

  async loadTexture(src) {
    if (this.textureKeys.has(src)) return this.textureKeys.get(src);
    const key = `portable-effect-${this.instanceId}-${this.textureKeys.size + 1}`;
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      if (this.options.crossOrigin) element.crossOrigin = this.options.crossOrigin;
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`エフェクト画像を読み込めません: ${src}`));
      element.src = src;
    });
    if (this.destroyed || !this.scene?.textures) return null;
    if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, image);
    this.textureKeys.set(src, key);
    return key;
  }

  ensureSoftMaskTexture() {
    const key = `portable-effect-soft-mask-${this.instanceId}`;
    if (this.scene.textures.exists(key)) return key;
    const size = Math.max(32, Math.floor(numberOr(this.options.softMaskSize, 256)));
    const texture = this.scene.textures.createCanvas(key, size, size);
    if (!texture?.context) return null;
    const context = texture.context;
    const center = size / 2;
    const outerRadius = size / 2;
    const innerRadius = outerRadius * clamp(numberOr(this.options.softMaskInnerRatio, 0.58), 0, 0.98);
    const gradient = context.createRadialGradient(center, center, innerRadius, center, center, outerRadius);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.clearRect(0, 0, size, size);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    texture.refresh();
    return key;
  }

  clearActiveObjects() {
    if (this.frameTimer) clearInterval(this.frameTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.frameTimer = null;
    this.hideTimer = null;

    const finish = this.finishActivePlayback;
    this.finishActivePlayback = null;
    for (const image of [this.effectImage, this.previousImage]) {
      if (!image) continue;
      image.clearMask?.(true);
      image.destroy?.();
    }
    this.maskImage?.destroy?.();
    this.effectImage = null;
    this.previousImage = null;
    this.maskImage = null;
    finish?.();
  }

  applyGrayscale(image, enabled) {
    if (!image || !enabled) return;
    const colorMatrix = image.postFX?.addColorMatrix?.() || image.preFX?.addColorMatrix?.();
    colorMatrix?.grayscale?.(1);
  }

  async playSingle(source, request, position, requestId) {
    let textureKey;
    try {
      textureKey = await this.loadTexture(source.src);
    } catch (error) {
      request.onError?.(error);
      return false;
    }
    if (!textureKey || requestId !== this.requestId || !this.scene) return false;

    const sourceImage = this.scene.textures.get(textureKey)?.getSourceImage?.();
    const layout = resolveEffectSheetLayout(sourceImage?.width, sourceImage?.height, this.options);
    if (!layout.frameCount) return false;
    this.clearActiveObjects();

    const angle = normalizeAngle(request.angleDeg);
    const angleRadians = angle * Math.PI / 180;
    const scalePercent = clamp(numberOr(request.scalePercent, 50), 1, 1000);
    const scale = (scalePercent / this.options.baseScalePercent)
      * Math.max(0.01, numberOr(source.sourceScaleMultiplier, 1));
    const tint = normalizeTint(request.tint);
    const tintStrength = clamp(numberOr(request.colorStrengthPercent, 100), 0, 100);
    const huePerFrame = clamp(numberOr(request.hueAnimationDegPerFrame, 0), -360, 360);
    const frameOffsets = request.frameOffsets && typeof request.frameOffsets === "object" ? request.frameOffsets : {};
    const depth = numberOr(request.depth, this.options.depth);
    const renderStyle = ["soft", "rect", "none"].includes(request.renderStyle) ? request.renderStyle : "soft";

    const resolvePlacement = frameIndexRaw => {
      const frameIndex = clamp(Math.floor(numberOr(frameIndexRaw, 0)), 0, layout.frameCount - 1);
      const cropX = layout.horizontal ? frameIndex * layout.frameWidth : 0;
      const cropY = layout.horizontal ? 0 : frameIndex * layout.frameHeight;
      const frameOffset = frameOffsets[frameIndex] || frameOffsets[String(frameIndex)] || {};
      const localX = ((layout.sourceWidth / 2) - cropX - (layout.frameWidth / 2)) * scale;
      const localY = ((layout.sourceHeight / 2) - cropY - (layout.frameHeight / 2)) * scale;
      return {
        cropX,
        cropY,
        x: position.x + (localX * Math.cos(angleRadians)) - (localY * Math.sin(angleRadians)) + numberOr(frameOffset.x, 0),
        y: position.y + (localX * Math.sin(angleRadians)) + (localY * Math.cos(angleRadians)) + numberOr(frameOffset.y, 0)
      };
    };

    const applyFrame = (image, frameIndex) => {
      if (!image) return;
      const placement = resolvePlacement(frameIndex);
      image.setCrop(placement.cropX, placement.cropY, layout.frameWidth, layout.frameHeight);
      image.setPosition(placement.x, placement.y);
      if (tint === null) image.clearTint?.();
      else image.setTint(mixTintWithWhite(rotateHue(tint, huePerFrame * frameIndex), tintStrength));
    };

    const createImage = (imageDepth, alpha = 1) => {
      const image = this.scene.add.image(position.x, position.y, textureKey);
      image.setOrigin(0.5, 0.5);
      image.setScale(scale);
      image.setDepth(imageDepth);
      image.setAngle(angle);
      image.setAlpha(alpha);
      image.setBlendMode(request.blendMode ?? this.options.blendMode);
      this.applyGrayscale(image, !!request.grayscaleBase);
      return image;
    };

    this.effectImage = createImage(depth);
    if (request.showPreviousFrameGhost && layout.frameCount > 1) {
      this.previousImage = createImage(depth - 1, 0.35);
    }

    if (renderStyle === "soft") {
      const maskKey = this.ensureSoftMaskTexture();
      if (maskKey) {
        this.maskImage = this.scene.make.image({ x: position.x, y: position.y, key: maskKey, add: false });
        const displayWidth = layout.frameWidth * scale;
        const displayHeight = layout.frameHeight * scale;
        const elliptical = displayWidth > displayHeight * this.options.ellipseRatioThreshold;
        const maskWidth = elliptical ? displayWidth : Math.min(displayWidth, displayHeight);
        const maskHeight = elliptical ? displayHeight : Math.min(displayWidth, displayHeight);
        this.maskImage.setOrigin(0.5, 0.5);
        this.maskImage.setDisplaySize(Math.max(1, maskWidth), Math.max(1, maskHeight));
        this.maskImage.setAngle(angle);
        this.effectImage.setMask(this.maskImage.createBitmapMask());
      }
    }

    applyFrame(this.effectImage, 0);
    applyFrame(this.previousImage, 0);
    const duration = Math.max(16, Math.floor(numberOr(request.totalDurationMs, this.options.totalDurationMs)));

    await new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(true);
      };
      this.finishActivePlayback = finish;

      if (layout.frameCount <= 1) {
        this.hideTimer = setTimeout(() => {
          if (requestId === this.requestId) this.clearActiveObjects();
          finish();
        }, duration);
        return;
      }

      const frameInterval = Math.max(16, Math.floor(duration / layout.frameCount));
      let frameIndex = 0;
      this.frameTimer = setInterval(() => {
        if (requestId !== this.requestId || !this.effectImage) {
          this.clearActiveObjects();
          finish();
          return;
        }
        frameIndex += 1;
        if (frameIndex >= layout.frameCount) {
          this.clearActiveObjects();
          finish();
          return;
        }
        applyFrame(this.effectImage, frameIndex);
        applyFrame(this.previousImage, Math.max(0, frameIndex - 1));
      }, frameInterval);
    });
    return true;
  }
}

export default PhaserEffectPlayer;
