// 地図が静止している間は入力・時計の更新だけ続け、GPUへの再送を省く。
// 未通知の変更も拾えるよう、一定間隔では通常描画する。
import { MAP_IDLE_RENDER_CONFIG } from "../../lib/phaser-map-panel-config.js";

export function installV39IdleRender(game) {
  const originalStep = game.step;
  let dirty = true, lastDraw = -Infinity, inputUntil = 0, cameraKey = "";
  let effects = 0;
  const invalidate = event => { if (event?.detail?.reason !== "activity-log") dirty = true; };
  const input = () => { inputUntil = performance.now() + MAP_IDLE_RENDER_CONFIG.inputRedrawMs; invalidate(); };
  const listeners = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  for (const type of ["v39:game-state-changed", "v39:field-data-updated", "v39:visibility-rendered", "v39:tile-selected", "v39:display-settings-changed", "v39:map-render-batch-ended"]) {
    listen(window, type, invalidate);
  }
  for (const type of ["pointerdown", "pointermove", "pointerup", "wheel"]) listen(game.canvas, type, input, { passive:true });
  listen(window, "keydown", input);
  listen(window, "resize", invalidate);
  game.textures.on("addtexture", invalidate);
  const attached = new WeakSet();
  const stats = { drawn:0, skipped:0 };
  game.v39RenderStats = stats;
  game.v39InvalidateRender = invalidate;
  game.v39BeginEffectRender = () => {
    effects += 1; invalidate();
    let released = false;
    return () => { if (!released) { released = true; effects -= 1; invalidate(); } };
  };
  game.step = function(time, delta) {
    const scenes = this.scene.getScenes(true);
    let animated = effects > 0;
    const keys = [];
    for (const scene of scenes) {
      if (!attached.has(scene)) {
        attached.add(scene);
        scene.events.on("addedtoscene", invalidate);
        scene.events.on("removedfromscene", invalidate);
        scene.load.on("complete", invalidate);
        scene.events.once("shutdown", () => {
          scene.events.off("addedtoscene", invalidate);
          scene.events.off("removedfromscene", invalidate);
          scene.load.off("complete", invalidate);
          attached.delete(scene);
        });
      }
      animated ||= scene.tweens?.getTweens().some(tween => tween.isPlaying()) === true;
      for (const camera of scene.cameras.cameras) {
        keys.push(camera.scrollX, camera.scrollY, camera.zoom, camera.rotation, camera.width, camera.height);
        animated ||= [camera.panEffect, camera.zoomEffect, camera.rotateToEffect, camera.shakeEffect, camera.fadeEffect, camera.flashEffect].some(effect => effect?.isRunning);
      }
    }
    const nextKey = keys.join(",");
    const draw = dirty || animated || nextKey !== cameraKey || performance.now() < inputUntil || time - lastDraw >= MAP_IDLE_RENDER_CONFIG.idleRedrawMs;
    if (draw || this.pendingDestroy || this.isPaused) {
      dirty = false; cameraKey = nextKey; lastDraw = time; stats.drawn += 1;
      originalStep.call(this, time, delta);
    } else {
      stats.skipped += 1;
      // Phaser自身の更新専用step。入力・Timer・Tweenは止めない。
      this.headlessStep(time, delta);
    }
  };
  game.events.once("destroy", () => {
    for (const remove of listeners) remove();
    game.textures.off("addtexture", invalidate);
    game.step = originalStep;
  });
}
