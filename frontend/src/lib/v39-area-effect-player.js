import { PhaserEffectPlayer } from '../../../配布用/アニメーション再生機能/phaser-effect-player.mjs';
import { normalizeV39EffectTransform } from './v39-effect-transform.js';

export function resolveV39AreaEffectDelays(count, setting = {}, random = Math.random) {
  const maximum = normalizeV39EffectTransform(setting).areaDelayMs;
  if (setting.areaTiming !== 'random' || count < 2 || maximum === 0) return Array(count).fill(0);
  const delays = Array.from({ length:count }, (_, index) => index === 0 ? 0 : index === 1 ? maximum
    : Math.floor(random() * (maximum + 1)));
  // Shuffle the guaranteed endpoints too, so no particular map cell always starts first.
  for (let index = delays.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [delays[index], delays[other]] = [delays[other], delays[index]];
  }
  return delays;
}

// One portable player owns each position; all positions share textures and cancellation.
export class V39AreaEffectPlayer extends PhaserEffectPlayer {
  async loadTexture(src) {
    this.pendingTextures ||= new Map();
    if (!this.pendingTextures.has(src)) {
      this.pendingTextures.set(src, super.loadTexture(src).finally(() => this.pendingTextures.delete(src)));
    }
    return this.pendingTextures.get(src);
  }

  stop() {
    for (const cancel of this.areaDelayCancels || []) cancel();
    this.areaDelayCancels?.clear();
    for (const child of this.areaPlayers || []) child.destroy();
    this.areaPlayers = [];
    super.stop();
  }

  async play(request = {}) { return this.playInstances('play', request); }
  async showFrame(request = {}) { return this.playInstances('showFrame', request); }

  waitForAreaStart(delay) {
    if (!delay) return Promise.resolve(true);
    this.areaDelayCancels ||= new Set();
    return new Promise(resolve => {
      const cancel = () => { clearTimeout(timer); resolve(false); };
      const timer = setTimeout(() => { this.areaDelayCancels.delete(cancel); resolve(true); }, delay);
      this.areaDelayCancels.add(cancel);
    });
  }

  async playInstances(method, request) {
    if (this.destroyed || !this.scene) return false;
    this.stop();
    const { instances, ...base } = request;
    const positions = instances?.length ? instances : [{}];
    const delays = resolveV39AreaEffectDelays(positions.length, method === 'play' ? base : {});
    const children = positions.map(() => {
      const child = new PhaserEffectPlayer(this.scene, { ...this.options, textureLoader:src => this.loadTexture(src) });
      child.ensureSoftMaskTexture = () => this.ensureSoftMaskTexture();
      return child;
    });
    this.areaPlayers = children;
    try {
      const results = await Promise.all(children.map(async (child, index) => {
        if (!await this.waitForAreaStart(delays[index]) || child.destroyed) return false;
        return child[method]({ ...base, ...positions[index], onFrame:index === 0 ? base.onFrame : undefined });
      }));
      return results.some(Boolean);
    } catch (error) {
      for (const child of children) child.destroy();
      if (this.areaPlayers === children) this.stop();
      throw error;
    } finally {
      if (method === 'play') {
        for (const child of children) child.destroy();
        if (this.areaPlayers === children) this.areaPlayers = [];
      }
    }
  }
}