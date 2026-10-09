import { PhaserEffectPlayer, resolveEffectSheetLayout } from "../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs";

const FRAME_DURATION_MS = 100;
const MAX_TOTAL_DURATION_MS = 1500;
const PATCH_FLAG = "__v39FixedFrameTimingPatched";

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function installFixedFrameTiming() {
  const prototype = PhaserEffectPlayer?.prototype;
  if (!prototype || prototype[PATCH_FLAG]) return;

  const originalPlaySingle = prototype.playSingle;
  prototype.playSingle = async function playSingleWithFixedFrameTiming(source, request = {}, position, requestId) {
    if (request?.staticFrame === true || !source?.src) {
      return originalPlaySingle.call(this, source, request, position, requestId);
    }

    const requestedMax = Math.max(16, Math.floor(finiteNumber(
      request.totalDurationMs,
      finiteNumber(this.options?.totalDurationMs, MAX_TOTAL_DURATION_MS)
    )));
    const maxDuration = Math.min(MAX_TOTAL_DURATION_MS, requestedMax);

    try {
      const textureKey = await this.loadTexture(source.src);
      const sourceImage = textureKey ? this.scene?.textures?.get(textureKey)?.getSourceImage?.() : null;
      const layout = resolveEffectSheetLayout(sourceImage?.width, sourceImage?.height, this.options);

      if (layout.frameCount > 1) {
        const fixedSpeedDuration = FRAME_DURATION_MS * layout.frameCount;
        const totalDurationMs = Math.max(16, Math.min(maxDuration, fixedSpeedDuration));
        return originalPlaySingle.call(this, source, { ...request, totalDurationMs }, position, requestId);
      }
    } catch {
      // Preserve the shared player's existing load/error handling.
    }

    // A one-frame effect remains visible for the configured maximum duration.
    return originalPlaySingle.call(this, source, { ...request, totalDurationMs:maxDuration }, position, requestId);
  };

  Object.defineProperty(prototype, PATCH_FLAG, { value:true, configurable:false, enumerable:false });
}

installFixedFrameTiming();

export const V39_EFFECT_FRAME_DURATION_MS = FRAME_DURATION_MS;
export const V39_EFFECT_MAX_TOTAL_DURATION_MS = MAX_TOTAL_DURATION_MS;
