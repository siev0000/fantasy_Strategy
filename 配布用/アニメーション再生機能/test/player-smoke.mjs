import PhaserEffectPlayer, { resolveEffectSheetLayout } from "../phaser-effect-player.mjs";

const layout = resolveEffectSheetLayout(320, 240);
if (layout.frameCount !== 2 || layout.frameWidth !== 320 || layout.frameHeight !== 120) {
  throw new Error(`320x240の分割結果が不正です: ${JSON.stringify(layout)}`);
}

class FakeImageLoader {
  set src(value) {
    this.width = value.includes("second") ? 600 : 320;
    this.height = value.includes("second") ? 120 : 240;
    queueMicrotask(() => this.onload?.());
  }
}

globalThis.Image = FakeImageLoader;
const sourceImages = new Map();
const textures = {
  exists: key => sourceImages.has(key),
  addImage(key, image) {
    sourceImages.set(key, image);
  },
  get: key => ({ getSourceImage: () => sourceImages.get(key) }),
  createCanvas(key, width, height) {
    const context = {
      createRadialGradient: () => ({ addColorStop() {} }),
      clearRect() {},
      fillRect() {},
      fillStyle: null
    };
    sourceImages.set(key, { width, height });
    return { context, refresh() {} };
  }
};

function makeDisplayObject() {
  const object = {};
  const chainMethods = [
    "setOrigin", "setScale", "setDepth", "setAngle", "setAlpha", "setBlendMode",
    "setCrop", "setPosition", "setTint", "clearTint", "setDisplaySize", "setMask"
  ];
  for (const method of chainMethods) object[method] = () => object;
  object.createBitmapMask = () => ({});
  object.clearMask = () => object;
  object.destroy = () => {
    object.destroyed = true;
  };
  return object;
}

const scene = {
  textures,
  add: { image: () => makeDisplayObject() },
  make: { image: () => makeDisplayObject() }
};
const player = new PhaserEffectPlayer(scene, { totalDurationMs: 32, sequenceGapMs: 1 });
let completed = false;
const played = await player.play({
  sequenceSources: ["first.webp", { src: "second.webp", sourceScaleMultiplier: 2 }],
  x: 100,
  y: 80,
  angleDeg: 45,
  scalePercent: 50,
  tint: "#ff3300",
  colorStrengthPercent: 70,
  renderStyle: "soft",
  showPreviousFrameGhost: true,
  onComplete: () => {
    completed = true;
  }
});

if (!played || !completed) throw new Error("連続再生が完了していません。");
player.destroy();
console.log("player smoke test: OK");
